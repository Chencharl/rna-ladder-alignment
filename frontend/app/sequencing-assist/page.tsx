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
} from "./lib/api";
import { runPipeline, downloadResultsUrl, IS_VERCEL_MODE } from "./lib/api";
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

  // Pipeline output state
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

  const selectReadAndExpand = useCallback((rank: number) => {
    setSelectedReadRank(rank);
  }, []);

  function resetPipelineState() {
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

  function handleExcelUploaded(result: UploadRawResponse) {
    setUploadResult(result);
    setPhase("excel_loaded");
    setPipelineError(null);
    resetPipelineState();
  }

  // Single-phase: upload + pipeline happen together on Vercel
  function handleExcelAnalyzed(result: AnalyzeResponse) {
    setUploadResult(result);
    setPhase("pipeline_complete");
    setPipelineError(null);
    setExcelB64(result.excel_b64 ?? null);
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
      setPhase("pipeline_complete");
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
      setPhase("excel_loaded");
    }
  }, [uploadResult, referenceSequence]);

  const hasResults = report || topParallel || decisions;

  function downloadExcelBlob() {
    if (!excelB64 || !uploadResult) return;
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelB64}`;
    link.download = uploadResult.filename.replace(/\.xlsx?$/i, "_results.xlsx");
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
              Upload a deconvoluted LC-MS Excel file. The pipeline computes
              block-wise relative intensity across 320 Da mass windows, recovers
              candidate short reads via nested ladder alignment, and visualizes
              the sigmoidal RT-mass curve with chain overlays and coverage analysis.
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
          {/* In Vercel mode: reference sequence is entered BEFORE upload so it runs in one shot */}
          {IS_VERCEL_MODE && (
            <Card
              title="Reference sequence (optional)"
              subtitle="Paste the known RNA sequence (5′→3′, A/U/G/C) before uploading. When provided the pipeline uses it to guide read extension and flags candidate modifications. Leave blank to run without reference."
            >
              <textarea
                value={referenceSequence}
                onChange={(e) => setReferenceSequence(e.target.value)}
                placeholder="GCUACGGCCAUACCACCCU... (A/U/G/C or T accepted as U)"
                rows={3}
                disabled={phase === "pipeline_running"}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              {referenceSequence.trim() && (
                <p className="mt-1 text-xs text-gray-400">
                  {referenceSequence.replace(/\s/g, "").length} characters entered.
                </p>
              )}
            </Card>
          )}

          {/* Upload card */}
          <Card
            title="Upload raw data"
            subtitle={
              IS_VERCEL_MODE
                ? "Upload a deconvoluted Excel file — the full pipeline runs automatically in one step."
                : "Deconvoluted Excel file with mass, intensity, and retention time columns."
            }
          >
            <ExcelUploader
              onUploaded={handleExcelUploaded}
              onAnalyzed={IS_VERCEL_MODE ? handleExcelAnalyzed : undefined}
              referenceSequence={referenceSequence}
            />
          </Card>

          {/* Two-phase only: reference input + QC preview + run button */}
          {!IS_VERCEL_MODE && uploadResult && phase !== "idle" && (
            <>
              <Card
                title="Reference sequence (optional)"
                subtitle="Paste the known RNA sequence (5′→3′, A/U/G/C). When provided, the pipeline uses it to guide read extension and compares recovered reads against it — mismatches indicate candidate modifications. Leave blank to run without reference."
              >
                <textarea
                  value={referenceSequence}
                  onChange={(e) => setReferenceSequence(e.target.value)}
                  placeholder="GCUACGGCCAUACCACCCU... (A/U/G/C or standard modification codes, T accepted as U)"
                  rows={3}
                  disabled={phase === "pipeline_running" || phase === "pipeline_complete"}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                />
                {referenceSequence.trim() && (
                  <p className="mt-1 text-xs text-gray-400">
                    {referenceSequence.replace(/\s/g, "").length} characters entered.
                    {phase === "pipeline_complete" && " Re-upload Excel to run with this reference."}
                  </p>
                )}
              </Card>

              <QCPreview
                data={uploadResult}
                onRunPipeline={handleRunPipeline}
                pipelineRunning={phase === "pipeline_running"}
              />
            </>
          )}

          {/* Download Excel — available after pipeline completes */}
          {phase === "pipeline_complete" && uploadResult && (
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-green-800">Pipeline complete — results ready</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Excel includes: candidate short reads with decoded nucleotide sequences, coverage
                  analysis, annotated peak table{referenceSequence.trim() ? ", and reference comparison" : ""}.
                </p>
              </div>
              {excelB64 ? (
                <button
                  type="button"
                  onClick={downloadExcelBlob}
                  className="ml-4 shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                >
                  Download Excel Results
                </button>
              ) : (
                <a
                  href={downloadResultsUrl(uploadResult.session_id)}
                  download
                  className="ml-4 shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                >
                  Download Excel Results
                </a>
              )}
            </div>
          )}

          {pipelineError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Pipeline error:</strong> {pipelineError}
            </div>
          )}

          {uploadResult?.was_pre_subsampled && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <strong>Large file:</strong> {uploadResult.n_points.toLocaleString()} points loaded — stored top-50-per-block
              ({uploadResult.n_points_stored.toLocaleString()} points) for efficient processing. Charge 1 data is dense;
              Charge 2 datasets are preferred for final sequencing analysis.
            </div>
          )}

          {pipelineMeta?.subsampled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Pipeline subsampled:</strong> Ran on top-25-per-block subset
              ({pipelineMeta.nPipeline.toLocaleString()} / {pipelineMeta.nOriginal.toLocaleString()} points).
              Charge 1 data has high false-coverage risk — Charge 2 is preferred.
            </div>
          )}

          {/* Core view (1 of 4): Scatter */}
          {uploadResult && phase !== "idle" && (
            <PeakScatterPlot
              rawScatter={uploadResult.scatter_points}
              topChains={topChainsForPlot}
              topParallel={topParallel}
              peakStatus={peakStatus}
              minChainLen={pipelineMeta?.minChainLenShown}
              nChainsTotal={pipelineMeta?.nChainsTotal}
              selectedReadRank={selectedReadRank}
              onSelectRead={selectReadAndExpand}
            />
          )}

          {/* Core view (2 of 4): Sigmoid */}
          {uploadResult && phase !== "idle" && (
            <MassRTPlot
              points={uploadResult.sigmoid_points}
              postPipeline={sigmoidPost}
              topChains={topChainsForPlot}
              minChainLen={pipelineMeta?.minChainLenShown}
            />
          )}

          {/* Core view (3 + 4 of 4): Coverage + candidate reads */}
          {hasResults && (
            <>
              <CoverageByIntensity bins={coverageBins} />

              <TopParallelReads
                rows={topParallel}
                selectedReadRank={selectedReadRank}
                onSelectRead={selectReadAndExpand}
              />
            </>
          )}

        </div>
      </div>
    </main>
  );
}
