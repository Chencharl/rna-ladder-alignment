"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { CoverageByIntensity } from "./components/CoverageByIntensity";
import { ExcelUploader } from "./components/ExcelUploader";
import { MassRTPlot } from "./components/MassRTPlot";
import { PeakScatterPlot } from "./components/PeakScatterPlot";
import { QCPreview } from "./components/QCPreview";
import { TopParallelReads } from "./components/TopParallelReads";
import { Card } from "./components/ui";
import type {
  UploadRawResponse,
  PipelineResponse,
  AnalyzeResponse,
  ChainPoint,
  CoverageBin,
  SigmoidPostPoint,
  PipelineParams,
} from "./lib/api";
import { runPipeline, downloadResultsUrl, analyzeFile, IS_VERCEL_MODE } from "./lib/api";
import type {
  BaseCallingReport,
  TopParallelRow,
  DecisionRow,
  ClassificationEvidenceRow,
  PeakStatusRow,
} from "./lib/types";

type Phase = "idle" | "excel_loaded" | "pipeline_running" | "pipeline_complete";

export default function SequencingAssist() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadResult, setUploadResult] = useState<UploadRawResponse | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [excelB64, setExcelB64] = useState<string | null>(null);

  // Vercel mode: file chosen before run + pipeline parameters
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pipelineParams, setPipelineParams] = useState<PipelineParams>({
    minChainLen: 10,
    topNChains: 10,
  });

  // Pipeline output
  const [report, setReport] = useState<BaseCallingReport | null>(null);
  const [topParallel, setTopParallel] = useState<TopParallelRow[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[] | null>(null);
  const [classificationEvidence, setClassificationEvidence] = useState<ClassificationEvidenceRow[] | null>(null);
  const [peakStatus, setPeakStatus] = useState<PeakStatusRow[] | null>(null);
  const [topChainsForPlot, setTopChainsForPlot] = useState<ChainPoint[] | null>(null);
  const [coverageBins, setCoverageBins] = useState<CoverageBin[] | null>(null);
  const [sigmoidPost, setSigmoidPost] = useState<SigmoidPostPoint[] | null>(null);
  const [pipelineMeta, setPipelineMeta] = useState<{
    subsampled: boolean; nOriginal: number; nPipeline: number;
    nChainsTotal: number; nChainsMin10: number; minChainLenShown: number;
  } | null>(null);
  const [selectedReadRank, setSelectedReadRank] = useState<number | null>(null);
  const [referenceSequence, setReferenceSequence] = useState("");

  const selectRead = useCallback((rank: number) => setSelectedReadRank(rank), []);

  // Clears pipeline output but NOT uploadResult (callers set that themselves)
  function resetPipelineOutput() {
    setReport(null);
    setTopParallel(null);
    setDecisions(null);
    setClassificationEvidence(null);
    setPeakStatus(null);
    setTopChainsForPlot(null);
    setCoverageBins(null);
    setSigmoidPost(null);
    setPipelineMeta(null);
    setSelectedReadRank(null);
    setExcelB64(null);
  }

  function applyPipelineResult(result: PipelineResponse & Partial<AnalyzeResponse>) {
    setExcelB64((result as AnalyzeResponse).excel_b64 ?? null);
    setReport(result.report as unknown as BaseCallingReport);
    setTopParallel(result.top_parallel_reads_long as unknown as TopParallelRow[] | null);
    setDecisions(result.sequencing_decision_summary as unknown as DecisionRow[] | null);
    setClassificationEvidence(result.classification_evidence as unknown as ClassificationEvidenceRow[] | null);
    setPeakStatus(result.peak_status as unknown as PeakStatusRow[] | null);
    setTopChainsForPlot(result.top_chains_for_plot ?? null);
    setCoverageBins(result.coverage_by_intensity ?? null);
    setSigmoidPost(result.sigmoid_post_pipeline ?? null);
    setPipelineMeta({
      subsampled: result.was_subsampled,
      nOriginal: result.n_original_points,
      nPipeline: result.n_pipeline_points,
      nChainsTotal: result.n_chains_total ?? 0,
      nChainsMin10: result.n_chains_min_10 ?? 0,
      minChainLenShown: result.min_chain_len_shown ?? 10,
    });
    setSelectedReadRank(null);
  }

  // ── Vercel mode handlers ─────────────────────────────────────────────────

  function handleFileSelected(file: File) {
    setSelectedFile(file);
    setUploadResult(null);
    setPhase("idle");
    resetPipelineOutput();
    setPipelineError(null);
  }

  async function handleRunAnalysis() {
    if (!selectedFile) return;
    setPhase("pipeline_running");
    setPipelineError(null);
    try {
      const result = await analyzeFile(selectedFile, referenceSequence, pipelineParams);
      setUploadResult(result);
      applyPipelineResult(result);
      setPhase("pipeline_complete");
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }

  // ── Two-phase local mode handlers ────────────────────────────────────────

  function handleExcelUploaded(result: UploadRawResponse) {
    resetPipelineOutput();
    setUploadResult(result);
    setPhase("excel_loaded");
    setPipelineError(null);
  }

  const handleRunPipeline = useCallback(async () => {
    if (!uploadResult) return;
    setPhase("pipeline_running");
    setPipelineError(null);
    try {
      const result: PipelineResponse = await runPipeline(
        uploadResult.session_id,
        false,
        referenceSequence,
      );
      applyPipelineResult(result);
      setPhase("pipeline_complete");
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
      setPhase("excel_loaded");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadResult, referenceSequence]);

  // ── Derived state ────────────────────────────────────────────────────────

  const hasResults = !!(report || topParallel || decisions);
  const isRunning = phase === "pipeline_running";

  function downloadExcelBlob() {
    if (!excelB64) return;
    const fname = selectedFile?.name ?? uploadResult?.filename ?? "results.xlsx";
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelB64}`;
    link.download = fname.replace(/\.xlsx?$/i, "_results.xlsx");
    link.click();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              RNA Ladder Sequencing Workbench
            </h1>
            <p className="mt-1 text-sm text-gray-500 max-w-2xl">
              De-novo chain recovery from deconvoluted LC-MS data. Block-wise relative
              intensity across 320 Da mass windows, nested ladder alignment to trace candidate
              short reads — no reference sequence required.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800 mt-1"
          >
            &larr; Ladder Alignment
          </Link>
        </div>

        <div className="space-y-6">

          {/* ═══════════════════════════════════════════════════════════════
              VERCEL MODE  (single-phase: select file → set params → run)
          ════════════════════════════════════════════════════════════════ */}
          {IS_VERCEL_MODE && (
            <>
              {/* Step 1 — Upload */}
              <Card
                title="Step 1 — Upload deconvoluted LC-MS data"
                subtitle="Drop your Excel file. No reference sequence needed — the pipeline recovers reads de-novo."
              >
                <ExcelUploader
                  onUploaded={() => {}}
                  onFileSelected={handleFileSelected}
                  currentFile={selectedFile}
                  isRunning={isRunning}
                />
              </Card>

              {/* Step 2 — Parameters + reference (only after a file is chosen) */}
              {selectedFile && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                  {/* Parameters */}
                  <Card
                    title="Step 2 — Analysis parameters"
                    subtitle="Adjust before running. Re-run any time with new values."
                  >
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min read length (nt)
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                          Chains shorter than this are filtered from results. Lower values
                          recover more reads but may include noise.
                        </p>
                        <input
                          type="number"
                          min={3}
                          max={30}
                          value={pipelineParams.minChainLen ?? 10}
                          disabled={isRunning}
                          onChange={(e) =>
                            setPipelineParams((p) => ({
                              ...p,
                              minChainLen: Math.max(3, Math.min(30, Number(e.target.value) || 10)),
                            }))
                          }
                          className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Top reads in plots
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                          Number of highest-ranked candidate reads shown as colored chain overlays
                          in the scatter and RT plots.
                        </p>
                        <input
                          type="number"
                          min={4}
                          max={25}
                          value={pipelineParams.topNChains ?? 10}
                          disabled={isRunning}
                          onChange={(e) =>
                            setPipelineParams((p) => ({
                              ...p,
                              topNChains: Math.max(4, Math.min(25, Number(e.target.value) || 10)),
                            }))
                          }
                          className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Reference sequence — optional */}
                  <Card
                    title="Reference sequence (optional)"
                    subtitle="Leave blank for pure de-novo analysis. If provided, recovered reads are compared against this sequence to flag candidate modifications."
                  >
                    <textarea
                      value={referenceSequence}
                      onChange={(e) => setReferenceSequence(e.target.value)}
                      placeholder="GCUACGGCCAUACCACCCU… (A/U/G/C, T accepted as U)"
                      rows={6}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {referenceSequence.trim() && (
                      <p className="mt-1 text-xs text-gray-400">
                        {referenceSequence.replace(/\s/g, "").length} characters entered.
                      </p>
                    )}
                  </Card>
                </div>
              )}

              {/* Step 3 — Run button */}
              {selectedFile && !isRunning && (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleRunAnalysis}
                    className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
                  >
                    {phase === "pipeline_complete" ? "Re-run analysis" : "Run de-novo analysis"}
                  </button>
                  {phase === "pipeline_complete" && (
                    <span className="text-xs text-gray-400">
                      Change parameters above and re-run to update results.
                    </span>
                  )}
                </div>
              )}

              {/* Running indicator */}
              {isRunning && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
                  <p className="text-sm font-semibold text-blue-800 animate-pulse">
                    Running de-novo chain recovery pipeline…
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Block-wise Rel_I → nested ladder alignment → 5′/3′ classification.
                    Large files may take 30–60 s.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              LOCAL TWO-PHASE MODE  (upload → preview → run pipeline)
          ════════════════════════════════════════════════════════════════ */}
          {!IS_VERCEL_MODE && (
            <>
              <Card
                title="Upload deconvoluted LC-MS data"
                subtitle="Excel file with Monoisotopic Mass, Sum Intensity, and Apex RT columns."
              >
                <ExcelUploader onUploaded={handleExcelUploaded} />
              </Card>

              {uploadResult && phase !== "idle" && (
                <>
                  <Card
                    title="Reference sequence (optional)"
                    subtitle="Leave blank for de-novo analysis. Paste a known sequence (5′→3′, A/U/G/C) to compare against recovered reads."
                  >
                    <textarea
                      value={referenceSequence}
                      onChange={(e) => setReferenceSequence(e.target.value)}
                      placeholder="GCUACGGCCAUACCACCCU… (A/U/G/C, T accepted as U)"
                      rows={3}
                      disabled={isRunning || phase === "pipeline_complete"}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {referenceSequence.trim() && (
                      <p className="mt-1 text-xs text-gray-400">
                        {referenceSequence.replace(/\s/g, "").length} characters.
                        {phase === "pipeline_complete" && " Re-upload to run with this reference."}
                      </p>
                    )}
                  </Card>

                  <QCPreview
                    data={uploadResult}
                    onRunPipeline={handleRunPipeline}
                    pipelineRunning={isRunning}
                  />
                </>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SHARED — banners, download, result panels
          ════════════════════════════════════════════════════════════════ */}

          {pipelineError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Pipeline error:</strong> {pipelineError}
            </div>
          )}

          {uploadResult?.was_pre_subsampled && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <strong>Large file:</strong> {uploadResult.n_points.toLocaleString()} points loaded
              — top-50-per-block subset ({uploadResult.n_points_stored.toLocaleString()} points) used.
              Charge 2 data is preferred for sequencing analysis.
            </div>
          )}

          {pipelineMeta?.subsampled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Pipeline subsampled:</strong> ran on top-25-per-block subset
              ({pipelineMeta.nPipeline.toLocaleString()} / {pipelineMeta.nOriginal.toLocaleString()} points).
              Charge 2 is preferred for final analysis.
            </div>
          )}

          {/* Download banner */}
          {phase === "pipeline_complete" && (
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-green-800">Analysis complete</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {pipelineMeta && (
                    <>
                      {pipelineMeta.nChainsMin10} reads ≥ {pipelineMeta.minChainLenShown} nt
                      recovered ({pipelineMeta.nChainsTotal} total chains).{" "}
                    </>
                  )}
                  Excel includes candidate reads, decoded sequences, coverage analysis
                  {referenceSequence.trim() ? ", and reference comparison" : ""}.
                </p>
              </div>
              {excelB64 ? (
                <button
                  type="button"
                  onClick={downloadExcelBlob}
                  className="ml-4 shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                >
                  Download Excel
                </button>
              ) : uploadResult ? (
                <a
                  href={downloadResultsUrl(uploadResult.session_id)}
                  download
                  className="ml-4 shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                >
                  Download Excel
                </a>
              ) : null}
            </div>
          )}

          {/* Core view 1 — Rel_I scatter */}
          {uploadResult && phase !== "idle" && (
            <PeakScatterPlot
              rawScatter={uploadResult.scatter_points}
              topChains={topChainsForPlot}
              topParallel={topParallel}
              peakStatus={peakStatus}
              minChainLen={pipelineMeta?.minChainLenShown}
              nChainsTotal={pipelineMeta?.nChainsTotal}
              selectedReadRank={selectedReadRank}
              onSelectRead={selectRead}
            />
          )}

          {/* Core view 2 — Mass vs RT sigmoid */}
          {uploadResult && phase !== "idle" && (
            <MassRTPlot
              points={uploadResult.sigmoid_points}
              postPipeline={sigmoidPost}
              topChains={topChainsForPlot}
              minChainLen={pipelineMeta?.minChainLenShown}
            />
          )}

          {/* Core views 3 + 4 — coverage + candidate reads table */}
          {hasResults && (
            <>
              <CoverageByIntensity bins={coverageBins} />
              <TopParallelReads
                rows={topParallel}
                selectedReadRank={selectedReadRank}
                onSelectRead={selectRead}
              />
            </>
          )}

        </div>
      </div>
    </main>
  );
}
