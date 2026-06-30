"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { ClassificationDetail } from "./components/ClassificationDetail";
import { ComparePlot } from "./components/ComparePlot";
import { CoverageByIntensity } from "./components/CoverageByIntensity";
import { DecisionTable } from "./components/DecisionTable";
import { ExcelUploader } from "./components/ExcelUploader";
import { ExportPanel } from "./components/ExportPanel";
import { FileUploader } from "./components/FileUploader";
import { MassRTPlot } from "./components/MassRTPlot";
import { PeakScatterPlot } from "./components/PeakScatterPlot";
import { PeakStatusTable } from "./components/PeakStatusTable";
import { QCPreview } from "./components/QCPreview";
import { RunOverview } from "./components/RunOverview";
import { TopParallelReads } from "./components/TopParallelReads";
import { Card } from "./components/ui";
import type { UploadRawResponse, PipelineResponse, ChainPoint, CoverageBin, SigmoidPostPoint } from "./lib/api";
import { runPipeline, downloadResultsUrl } from "./lib/api";
import { loadFilesIntoRun } from "./lib/parse";
import type {
  BaseCallingReport,
  TopParallelRow,
  DecisionRow,
  ClassificationEvidenceRow,
  PeakStatusRow,
  LoadedRun,
} from "./lib/types";
import { EMPTY_RUN } from "./lib/types";

type Phase = "idle" | "excel_loaded" | "pipeline_running" | "pipeline_complete";

function CompareSection({ sessionId, primaryScatter }: { sessionId: string | null; primaryScatter: import("./lib/api").ScatterPoint[] | null }) {
  const [show, setShow] = useState(false);
  const [compareUpload, setCompareUpload] = useState<UploadRawResponse | null>(null);
  const [compareName, setCompareName] = useState("");

  if (!primaryScatter) return null;

  return (
    <div className="border-t border-gray-200 pt-4">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        {show ? "Hide" : "Compare with a second sample"} (e.g. HEK vs HepG2)
      </button>
      {show && (
        <div className="mt-4 space-y-4">
          <Card title="Load second sample" subtitle="Upload a second deconvoluted Excel file to overlay on the scatter and sigmoid plots.">
            <ExcelUploader onUploaded={(r) => { setCompareUpload(r); setCompareName(r.filename.replace(/\.xlsx?$/i, "")); }} />
          </Card>
          {compareUpload && primaryScatter && (
            <ComparePlot
              label1="Sample 1"
              label2={compareName || "Sample 2"}
              scatter1={primaryScatter}
              scatter2={compareUpload.scatter_points}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function SequencingAssist() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadResult, setUploadResult] = useState<UploadRawResponse | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Pipeline output state — populated from backend response
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

  // Advanced section: detail tables, export, sample comparison, and the
  // legacy manual file-upload flow — collapsed by default so the primary
  // view stays to the four panels reviewed first: scatter, sigmoid,
  // coverage, candidate reads.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedRun, setAdvancedRun] = useState<LoadedRun>(EMPTY_RUN);
  const [advancedUnmatched, setAdvancedUnmatched] = useState<string[]>([]);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const selectReadAndExpand = useCallback((rank: number) => {
    setSelectedReadRank(rank);
    setShowAdvanced(true);
  }, []);

  function handleExcelUploaded(result: UploadRawResponse) {
    setUploadResult(result);
    setPhase("excel_loaded");
    setPipelineError(null);
    // Reset pipeline outputs
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

      // Map report
      setReport(result.report as unknown as BaseCallingReport);

      // Map CSV-like arrays directly — they come as records from the backend
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
  }, [uploadResult]);

  // Advanced mode: manual file upload handler
  async function handleAdvancedFiles(files: File[]) {
    setAdvancedLoading(true);
    setAdvancedError(null);
    try {
      const { run: updated, unmatched } = await loadFilesIntoRun(files, advancedRun);
      setAdvancedRun(updated);
      setAdvancedUnmatched(unmatched);
      // Populate dashboard panels from manually uploaded files
      if (updated.report) setReport(updated.report);
      if (updated.topParallel) setTopParallel(updated.topParallel);
      if (updated.decisions) setDecisions(updated.decisions);
      if (updated.classificationEvidence) setClassificationEvidence(updated.classificationEvidence);
      if (updated.peakStatus) setPeakStatus(updated.peakStatus);
      setPhase("pipeline_complete");
    } catch (err) {
      setAdvancedError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdvancedLoading(false);
    }
  }

  const hasResults = report || topParallel || decisions;

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
              Upload a deconvoluted LC-MS Excel file. The Python backend computes
              block-wise relative intensity (Dr. Jiang's nested algorithm), recovers
              candidate short reads, and visualizes the sigmoidal RT-mass curve
              with chain overlays and coverage analysis.
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
          {/* Phase 0: Upload Excel */}
          <Card
            title="Upload raw data"
            subtitle="Deconvoluted Excel file with mass, intensity, and retention time columns."
          >
            <ExcelUploader onUploaded={handleExcelUploaded} />
          </Card>

          {/* Phase 1: QC Preview + Run Pipeline button */}
          {uploadResult && phase !== "idle" && (
            <>
              {/* Optional reference sequence — activates Step 6.6 in the algorithm */}
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

          {/* Download Excel — available immediately after pipeline completes */}
          {phase === "pipeline_complete" && uploadResult && (
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-green-800">Pipeline complete — results ready</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Excel includes: candidate short reads with decoded nucleotide sequences, coverage
                  analysis, annotated peak table{referenceSequence.trim() ? ", and reference comparison" : ""}.
                </p>
              </div>
              <a
                href={downloadResultsUrl(uploadResult.session_id)}
                download
                className="ml-4 shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
              >
                Download Excel Results
              </a>
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

          {/* Core view (1 of 4): Scatter plot — shows immediately after Excel upload */}
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

          {/* Core view (2 of 4): Sigmoid — shows immediately after upload, upgrades after pipeline */}
          {uploadResult && phase !== "idle" && (
            <MassRTPlot
              points={uploadResult.sigmoid_points}
              postPipeline={sigmoidPost}
              topChains={topChainsForPlot}
              minChainLen={pipelineMeta?.minChainLenShown}
            />
          )}

          {/* Core view (3 + 4 of 4): Coverage and candidate reads — need pipeline output */}
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

          {/* Advanced: detail tables, export, sample comparison, legacy upload */}
          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              {showAdvanced ? "Hide advanced" : "Show advanced: evidence detail, export, compare samples"}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-6">
                {hasResults && (
                  <>
                    <RunOverview report={report} />

                    <ClassificationDetail
                      selectedReadRank={selectedReadRank}
                      classificationEvidence={classificationEvidence}
                      decisions={decisions}
                    />

                    <DecisionTable
                      decisions={decisions}
                      topParallel={topParallel}
                      selectedReadRank={selectedReadRank}
                      onSelectRead={setSelectedReadRank}
                    />

                    <PeakStatusTable rows={peakStatus} onSelectRead={setSelectedReadRank} />

                    <ExportPanel run={advancedRun} />
                  </>
                )}

                {phase === "pipeline_complete" && (
                  <CompareSection sessionId={uploadResult?.session_id ?? null} primaryScatter={uploadResult?.scatter_points ?? null} />
                )}

                <Card
                  title="Load pipeline output files"
                  subtitle="If you already have output files from trna_nested_algorithm.py, upload them here."
                >
                  <FileUploader run={advancedRun} onFiles={handleAdvancedFiles} unmatched={advancedUnmatched} />
                  {advancedLoading && <p className="mt-3 text-sm text-gray-400 animate-pulse">Reading files...</p>}
                  {advancedError && <p className="mt-3 text-sm text-red-600">{advancedError}</p>}
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
