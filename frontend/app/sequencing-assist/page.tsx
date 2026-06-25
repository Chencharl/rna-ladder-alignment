"use client";

import Link from "next/link";
import { useState } from "react";
import { ClassificationDetail } from "./components/ClassificationDetail";
import { DecisionTable } from "./components/DecisionTable";
import { ExportPanel } from "./components/ExportPanel";
import { FileUploader } from "./components/FileUploader";
import { PeakStatusTable } from "./components/PeakStatusTable";
import { RunOverview } from "./components/RunOverview";
import { TopParallelReads } from "./components/TopParallelReads";
import { Card } from "./components/ui";
import { loadFilesIntoRun } from "./lib/parse";
import { EMPTY_RUN, type LoadedRun } from "./lib/types";

export default function SequencingAssist() {
  const [run, setRun] = useState<LoadedRun>(EMPTY_RUN);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [selectedReadRank, setSelectedReadRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    setLoading(true);
    setLoadError(null);
    try {
      const { run: updated, unmatched: notMatched } = await loadFilesIntoRun(files, run);
      setRun(updated);
      setUnmatched(notMatched);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const hasCore = !!run.report || !!run.topParallel || !!run.decisions;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sequencing Assist</h1>
            <p className="mt-1 text-sm text-gray-500">
              Load a base-calling run's output files to inspect top reads, understand 5′/3′ calls,
              and decide what evidence is trustworthy.
            </p>
          </div>
          <Link href="/" className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800 mt-1">
            &larr; Ladder Alignment
          </Link>
        </div>

        <div className="space-y-5">
          <Card title="Load run output" subtitle="Files come from trna_nested_algorithm.py's output folder.">
            <FileUploader run={run} onFiles={handleFiles} unmatched={unmatched} />
            {loading && <p className="mt-3 text-sm text-gray-400">Reading files…</p>}
            {loadError && (
              <p className="mt-3 text-sm text-red-600">Couldn't read one of the files: {loadError}</p>
            )}
          </Card>

          {hasCore && (
            <>
              <RunOverview report={run.report} />

              <TopParallelReads
                rows={run.topParallel}
                selectedReadRank={selectedReadRank}
                onSelectRead={setSelectedReadRank}
              />

              <DecisionTable
                decisions={run.decisions}
                topParallel={run.topParallel}
                selectedReadRank={selectedReadRank}
                onSelectRead={setSelectedReadRank}
              />

              <ClassificationDetail
                selectedReadRank={selectedReadRank}
                classificationEvidence={run.classificationEvidence}
                decisions={run.decisions}
              />

              <PeakStatusTable rows={run.peakStatus} onSelectRead={setSelectedReadRank} />

              <ExportPanel run={run} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
