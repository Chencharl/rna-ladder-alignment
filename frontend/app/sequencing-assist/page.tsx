"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";
import { CoverageByIntensity } from "./components/CoverageByIntensity";
import { ComparisonPanel } from "./components/ComparisonPanel";
import { DataQualityCard } from "./components/DataQualityCard";
import { ExcelUploader } from "./components/ExcelUploader";
import { MassRTPlot } from "./components/MassRTPlot";
import { PeakScatterPlot } from "./components/PeakScatterPlot";
import { QCPreview } from "./components/QCPreview";
import { RunOverview } from "./components/RunOverview";
import { ModificationProfile } from "./components/ModificationProfile";
import { MethodsGuide } from "./components/MethodsGuide";
import { TopParallelReads } from "./components/TopParallelReads";
import { SequenceAssembly } from "./components/SequenceAssembly";
import { Card } from "./components/ui";
import type {
  UploadRawResponse,
  PipelineResponse,
  AnalyzeResponse,
  ChainPoint,
  CoverageBin,
  CoverageByMassRange,
  EmpiricalFDR,
  RtQuality,
  ModCount,
  SigmoidPostPoint,
  PipelineParams,
  TRNARefLibrary,
} from "./lib/api";
import { runPipeline, downloadResultsUrl, analyzeFile, IS_VERCEL_MODE, LARGE_FILE_THRESHOLD_BYTES } from "./lib/api";
import type {
  BaseCallingReport,
  TopParallelRow,
  DecisionRow,
  ClassificationEvidenceRow,
  PeakStatusRow,
  RefComparison,
} from "./lib/types";

type Phase = "idle" | "excel_loaded" | "parsing_large_file" | "pipeline_running" | "pipeline_complete";

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
    minRelI: 5,
    precursorMass: undefined,
  });

  // Pipeline output
  const [report, setReport] = useState<BaseCallingReport | null>(null);
  const [topParallel, setTopParallel] = useState<TopParallelRow[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[] | null>(null);
  const [classificationEvidence, setClassificationEvidence] = useState<ClassificationEvidenceRow[] | null>(null);
  const [peakStatus, setPeakStatus] = useState<PeakStatusRow[] | null>(null);
  const [topChainsForPlot, setTopChainsForPlot] = useState<ChainPoint[] | null>(null);
  const [coverageBins, setCoverageBins] = useState<CoverageBin[] | null>(null);
  const [coverageMassRange, setCoverageMassRange] = useState<CoverageByMassRange[] | null>(null);
  const [empiricalFdr, setEmpiricalFdr] = useState<EmpiricalFDR | null>(null);
  const [rtQuality, setRtQuality] = useState<RtQuality | null>(null);
  const [modCounts, setModCounts] = useState<ModCount[] | null>(null);
  const [sigmoidPost, setSigmoidPost] = useState<SigmoidPostPoint[] | null>(null);
  const [pipelineMeta, setPipelineMeta] = useState<{
    subsampled: boolean; nOriginal: number; nPipeline: number;
    nChainsTotal: number; nChainsMin10: number; minChainLenShown: number;
  } | null>(null);
  const [selectedReadRank, setSelectedReadRank] = useState<number | null>(null);
  const [refComparisons, setRefComparisons] = useState<Record<string, RefComparison> | null>(null);
  const [tRNARefLibrary, setTRNARefLibrary] = useState<TRNARefLibrary | null>(null);
  const [referenceSequence, setReferenceSequence] = useState("");
  const [progressStage, setProgressStage] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Comparison mode (Tier 3) ─────────────────────────────────────────────
  const [showCompare, setShowCompare] = useState(false);
  const [compareFile, setCompareFile] = useState<File | null>(null);
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareChains, setCompareChains] = useState<ChainPoint[] | null>(null);
  const [compareCoverage, setCompareCoverage] = useState<CoverageBin[] | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const selectRead = useCallback((rank: number) => setSelectedReadRank(rank), []);

  const PROGRESS_STAGES = [
    "Parsing Excel and computing block-wise Rel_I…",
    "Building nested mass-ladder chains…",
    "Classifying 5′/3′ ladder orientation…",
    "Computing coverage and decoding modifications…",
    "Finalising results and generating Excel report…",
  ];

  // Clears pipeline output but NOT uploadResult (callers set that themselves)
  function resetPipelineOutput() {
    setReport(null);
    setTopParallel(null);
    setDecisions(null);
    setClassificationEvidence(null);
    setPeakStatus(null);
    setTopChainsForPlot(null);
    setCoverageBins(null);
    setCoverageMassRange(null);
    setEmpiricalFdr(null);
    setRtQuality(null);
    setModCounts(null);
    setSigmoidPost(null);
    setPipelineMeta(null);
    setSelectedReadRank(null);
    setRefComparisons(null);
    setTRNARefLibrary(null);
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
    setCoverageMassRange(result.coverage_by_mass_range ?? null);
    setEmpiricalFdr(result.empirical_fdr ?? null);
    setRtQuality(result.rt_quality ?? null);
    setModCounts(result.mod_counts ?? null);
    setSigmoidPost(result.sigmoid_post_pipeline ?? null);
    setPipelineMeta({
      subsampled: result.was_subsampled,
      nOriginal: result.n_original_points,
      nPipeline: result.n_pipeline_points,
      nChainsTotal: result.n_chains_total ?? 0,
      nChainsMin10: result.n_chains_min_10 ?? 0,
      minChainLenShown: result.min_chain_len_shown ?? 10,
    });
    setRefComparisons((result as any).reference_comparisons ?? null);
    setTRNARefLibrary((result as any).tRNA_ref_library ?? null);
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
    const isLargeFile = selectedFile.size > LARGE_FILE_THRESHOLD_BYTES;
    setPhase(isLargeFile ? "parsing_large_file" : "pipeline_running");
    setPipelineError(null);
    try {
      const result = await analyzeFile(
        selectedFile,
        referenceSequence,
        pipelineParams,
        isLargeFile ? () => setPhase("pipeline_running") : undefined,
      );
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

  async function handleRunComparison() {
    if (!compareFile) return;
    setCompareRunning(true);
    setCompareError(null);
    try {
      const result = await analyzeFile(compareFile, "", pipelineParams);
      setCompareChains(result.top_chains_for_plot ?? null);
      setCompareCoverage(result.coverage_by_intensity ?? null);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompareRunning(false);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const hasResults = !!(report || topParallel || decisions);
  const isRunning = phase === "pipeline_running" || phase === "parsing_large_file";

  useEffect(() => {
    if (isRunning) {
      setProgressStage(0);
      progressTimer.current = setInterval(() => {
        setProgressStage((s) => Math.min(s + 1, PROGRESS_STAGES.length - 1));
      }, 9000);
    } else {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgressStage(0);
    }
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Signal threshold (% of block max)
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                          Only peaks with relative intensity ≥ this value are used as chain seeds.
                          5% removes low-signal noise while retaining all meaningful peaks.
                          Set to 0 to use all peaks.
                        </p>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step={1}
                          value={pipelineParams.minRelI ?? 5}
                          disabled={isRunning}
                          onChange={(e) =>
                            setPipelineParams((p) => ({
                              ...p,
                              minRelI: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
                        />
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Intact RNA mass (Da){" "}
                          <span className="font-normal text-gray-400 text-xs">optional</span>
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                          If the measured intact/precursor mass is known, the algorithm uses it
                          as a physical closure check: the 5′ and 3′ terminal masses should sum
                          to the intact mass. Activates a +0.10 pairing-score bonus when they do.
                          Leave blank for pure de-novo analysis.
                        </p>
                        <input
                          type="number"
                          min={1000}
                          max={200000}
                          step={1}
                          placeholder="e.g. 23517"
                          value={pipelineParams.precursorMass ?? ""}
                          disabled={isRunning}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setPipelineParams((p) => ({
                              ...p,
                              precursorMass: v === "" ? undefined : Math.max(1000, Number(v) || 1000),
                            }));
                          }}
                          className="w-36 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
                        />
                        {pipelineParams.precursorMass != null && (
                          <p className="mt-1 text-xs text-blue-600">
                            Closure scoring active — 5′+3′ terminal masses will be compared to {pipelineParams.precursorMass.toLocaleString()} Da.
                          </p>
                        )}
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

              {/* Running indicator — staged progress */}
              {isRunning && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    <p className="text-sm font-semibold text-blue-800 animate-pulse">
                      {phase === "parsing_large_file"
                        ? `Parsing ${selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(1) : ""}  MB file locally — extracting M/I/T columns…`
                        : PROGRESS_STAGES[progressStage]}
                    </p>
                  </div>
                  {phase === "pipeline_running" && (
                    <div className="flex gap-1">
                      {PROGRESS_STAGES.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                            i <= progressStage ? "bg-blue-500" : "bg-blue-200"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {phase === "parsing_large_file"
                      ? "File is read locally in your browser — nothing is uploaded yet."
                      : "Large files may take 30–60 s on first run."}
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

          {uploadResult?.data_type_warning?.likely_intact && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <strong>Data type warning — results may not be valid.</strong> This file appears
              to contain intact RNA mass data (mass range{" "}
              {uploadResult.mass_range[0].toLocaleString()}–
              {uploadResult.mass_range[1].toLocaleString()} Da). The ladder algorithm requires
              hydrolysis ladder data (2,000–23,000 Da). The pipeline has been restricted to the
              2,000–23,000 Da region; peaks outside that range are excluded from chain recovery.
              {uploadResult.data_type_warning.reasons.length > 0 && (
                <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-xs text-red-700">
                  {uploadResult.data_type_warning.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Download / completion banner */}
          {phase === "pipeline_complete" && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800 mb-2">Analysis complete</p>

                  {/* Stat chips */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pipelineMeta && (
                      <span className="inline-flex items-center rounded-full bg-white border border-green-200 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        {pipelineMeta.nChainsMin10} reads ≥ {pipelineMeta.minChainLenShown} nt
                      </span>
                    )}
                    {(report as any)?.read_call_counts && (
                      <>
                        <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {(report as any).read_call_counts["5prime"]} × 5′
                        </span>
                        <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                          {(report as any).read_call_counts["3prime"]} × 3′
                        </span>
                        {(report as any).read_call_counts.ambiguous > 0 && (
                          <span className="inline-flex items-center rounded-full bg-yellow-50 border border-yellow-200 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                            {(report as any).read_call_counts.ambiguous} ambiguous
                          </span>
                        )}
                      </>
                    )}
                    {coverageBins && (() => {
                      const top = coverageBins.find(b => b.label.includes(">10%"));
                      return top && top.total > 0 ? (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${top.pct >= 80 ? "bg-green-100 border-green-300 text-green-800" : "bg-orange-50 border-orange-200 text-orange-700"}`}>
                          {top.pct}% coverage (&gt;10% threshold)
                        </span>
                      ) : null;
                    })()}
                    {modCounts && (() => {
                      const mods = modCounts.filter(m => !m.is_canonical && !m.is_unknown);
                      return mods.length > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          {mods.length} modification type{mods.length > 1 ? "s" : ""} found
                        </span>
                      ) : null;
                    })()}
                    {pipelineParams.precursorMass && (
                      <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                        Closure scoring active ({pipelineParams.precursorMass.toLocaleString()} Da)
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400">
                    Excel includes candidate reads, decoded sequences, coverage analysis, and modification profile
                    {referenceSequence.trim() ? " + reference comparison" : ""}.
                  </p>
                </div>

                {excelB64 ? (
                  <button
                    type="button"
                    onClick={downloadExcelBlob}
                    className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                  >
                    Download Excel
                  </button>
                ) : uploadResult ? (
                  <a
                    href={downloadResultsUrl(uploadResult.session_id)}
                    download
                    className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
                  >
                    Download Excel
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {/* Data quality assessment — immediate verdict on file suitability */}
          {hasResults && (
            <DataQualityCard
              rtQuality={rtQuality}
              fdr={empiricalFdr}
              coverageBins={coverageBins}
              nChainsTotal={pipelineMeta?.nChainsTotal ?? 0}
              nChainsMin10={pipelineMeta?.nChainsMin10 ?? 0}
              nConflict={(report as any)?.read_call_counts?.conflict ?? 0}
              nAmbiguous={(report as any)?.read_call_counts?.ambiguous ?? 0}
              tRNARefLibrary={tRNARefLibrary}
            />
          )}

          {/* Run overview — read call breakdown + peak usage */}
          {hasResults && <RunOverview report={report} />}

          {/* Primary output — decoded sequence from best 5′ and 3′ reads */}
          {hasResults && (
            <SequenceAssembly rows={topParallel} refComparisons={refComparisons} />
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
              selectedReadRank={selectedReadRank}
              rtQuality={rtQuality}
            />
          )}

          {/* Core views 3 + 4 — coverage + candidate reads table */}
          {hasResults && (
            <>
              <CoverageByIntensity bins={coverageBins} byMassRange={coverageMassRange} fdrEstimate={empiricalFdr} />
              <TopParallelReads
                rows={topParallel}
                selectedReadRank={selectedReadRank}
                onSelectRead={selectRead}
              />
              <ModificationProfile counts={modCounts} />
            </>
          )}

          {/* Methods guide — always visible so users can read the algorithm description */}
          <MethodsGuide />

          {/* ── Tier 3: Sample comparison ── */}
          {IS_VERCEL_MODE && phase === "pipeline_complete" && (
            <div>
              {!showCompare ? (
                <button
                  type="button"
                  onClick={() => setShowCompare(true)}
                  className="w-full rounded-xl border-2 border-dashed border-gray-200 px-6 py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  + Compare with a second sample (e.g. HEK vs HepG2, cell line vs tissue)
                </button>
              ) : (
                <Card
                  title="Sample B — Upload second file for comparison"
                  subtitle={`Sample A is "${selectedFile?.name ?? "File A"}". Upload a second file to overlay candidate reads and compare coverage side-by-side.`}
                >
                  <ExcelUploader
                    onUploaded={() => {}}
                    onFileSelected={(f) => {
                      setCompareFile(f);
                      setCompareChains(null);
                      setCompareCoverage(null);
                      setCompareError(null);
                    }}
                    currentFile={compareFile}
                    isRunning={compareRunning}
                  />
                  {compareFile && !compareRunning && (
                    <div className="mt-3 flex gap-3 items-center">
                      <button
                        type="button"
                        onClick={handleRunComparison}
                        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                      >
                        {compareChains ? "Re-run comparison" : "Run comparison"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCompare(false);
                          setCompareFile(null);
                          setCompareChains(null);
                          setCompareCoverage(null);
                        }}
                        className="text-sm text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {compareRunning && (
                    <p className="mt-3 text-sm text-indigo-600 animate-pulse">
                      Running pipeline on Sample B…
                    </p>
                  )}
                  {compareError && (
                    <p className="mt-3 text-sm text-red-600">Error: {compareError}</p>
                  )}
                </Card>
              )}
            </div>
          )}

          {/* ── Comparison overlay ── */}
          {showCompare && compareChains && topChainsForPlot && (
            <ComparisonPanel
              labelA={selectedFile?.name?.replace(/\.xlsx?$/i, "") ?? "Sample A"}
              labelB={compareFile?.name?.replace(/\.xlsx?$/i, "") ?? "Sample B"}
              chainsA={topChainsForPlot}
              chainsB={compareChains}
              coverageA={coverageBins}
              coverageB={compareCoverage}
            />
          )}

        </div>
      </div>
    </main>
  );
}
