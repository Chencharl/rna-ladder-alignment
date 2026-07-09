"use client";

import { useMemo, useState } from "react";
import type { PeakStatusRow } from "../lib/types";
import { Card, EmptyState, Pagination, fmt } from "./ui";

const PAGE_SIZE = 20;

function suggestedAction(relIPct: number, rankPct: number): { text: string; color: string } {
  if (relIPct >= 50)
    return { text: "High priority — dominant unexplained signal. Possible co-eluting species or non-tRNA contaminant. Inspect RT and mass against known species.", color: "text-red-600" };
  if (relIPct >= 10)
    return { text: "Medium priority — significant unexplained signal. Check if explained by a lower-ranked read (increase Top reads in plots) or by a co-eluting fragment.", color: "text-amber-700" };
  if (rankPct >= 80)
    return { text: "In top 20% by signal intensity but below 10% threshold. Review if ladder coverage is low in this mass region.", color: "text-amber-600" };
  return { text: "Low priority — likely low-signal background peak.", color: "text-gray-400" };
}

export function UnexplainedPeaks({
  peakStatus,
  nChainsTotal,
}: {
  peakStatus: PeakStatusRow[] | null;
  nChainsTotal: number;
}) {
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const INTENSITY_FLOOR = 0.02; // 2% relative intensity

  const { unusedAboveFloor, totalUnused, totalPeaks, rankMap } = useMemo(() => {
    if (!peakStatus) return { unusedAboveFloor: [], totalUnused: 0, totalPeaks: 0, rankMap: new Map<number, number>() };

    const allSorted = [...peakStatus].sort((a, b) => b.rel_intensity - a.rel_intensity);
    const rankMap = new Map<number, number>();
    allSorted.forEach((r, i) => {
      // Use index as a unique key per row — peakStatus rows may have duplicate masses
      rankMap.set(i, Math.round(((allSorted.length - i) / allSorted.length) * 100));
    });

    const unused = peakStatus.filter((r) => r.peak_status === "unused");
    const unusedAboveFloor = unused
      .filter((r) => r.rel_intensity >= INTENSITY_FLOOR)
      .sort((a, b) => b.rel_intensity - a.rel_intensity);

    // Build rank percentile by position in full sorted list
    const sortedRelI = allSorted.map((r) => r.rel_intensity);

    return {
      unusedAboveFloor: unusedAboveFloor.map((r) => {
        // Binary search for percentile in sortedRelI (descending)
        let lo = 0, hi = sortedRelI.length - 1, pos = sortedRelI.length;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (sortedRelI[mid] >= r.rel_intensity) { pos = mid; lo = mid + 1; }
          else hi = mid - 1;
        }
        const rankPct = Math.round(((sortedRelI.length - pos) / sortedRelI.length) * 100);
        return { row: r, rankPct };
      }),
      totalUnused: unused.length,
      totalPeaks: peakStatus.length,
      rankMap,
    };
  }, [peakStatus]);

  const displayRows = showAll ? unusedAboveFloor : unusedAboveFloor.slice(0, 100);
  const pageCount = Math.ceil(displayRows.length / PAGE_SIZE);
  const pagedRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const nShown = displayRows.length;
  const nTotal = unusedAboveFloor.length;

  return (
    <Card
      title="Unexplained High-Intensity Peaks"
      subtitle={
        totalPeaks > 0
          ? `${nTotal} peaks above 2% relative intensity are not explained by any candidate read (${totalUnused} total unused peaks across all signal levels). These may represent co-eluting species, abundant modifications, or RNA fragments not captured by the current read set.`
          : "Run the pipeline to see peak status data."
      }
    >
      {nTotal === 0 ? (
        <EmptyState>
          {totalPeaks === 0
            ? "Run the pipeline to see peak status data."
            : nChainsTotal === 0
            ? "No peaks have been classified yet — pipeline found no candidate reads."
            : "No unexplained peaks above 2% intensity — all significant signals are accounted for by candidate reads."}
        </EmptyState>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
              <div className="text-lg font-bold tabular-nums text-gray-800">{nTotal}</div>
              <div className="text-xs text-gray-500">≥2% intensity, unused</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
              <div className="text-lg font-bold tabular-nums text-gray-800">{totalUnused}</div>
              <div className="text-xs text-gray-500">total unused peaks</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
              <div className="text-lg font-bold tabular-nums text-gray-800">
                {totalPeaks > 0 ? Math.round((totalUnused / totalPeaks) * 100) : 0}%
              </div>
              <div className="text-xs text-gray-500">fraction unused</div>
            </div>
            {unusedAboveFloor.filter(({ row }) => row.rel_intensity >= 0.1).length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                <div className="text-lg font-bold tabular-nums text-amber-700">
                  {unusedAboveFloor.filter(({ row }) => row.rel_intensity >= 0.1).length}
                </div>
                <div className="text-xs text-amber-600">≥10% intensity, unassigned</div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[620px]">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-100">
                  <th className="py-2 px-2 font-medium w-8">#</th>
                  <th className="py-2 px-2 font-medium">Mass (Da)</th>
                  <th className="py-2 px-2 font-medium text-right">Rel.I (%)</th>
                  <th className="py-2 px-2 font-medium text-right">RT (min)</th>
                  <th className="py-2 px-2 font-medium text-right">Block</th>
                  <th className="py-2 px-2 font-medium text-right">Intensity rank</th>
                  <th className="py-2 px-2 font-medium">In read?</th>
                  <th className="py-2 px-2 font-medium">Suggested action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ row, rankPct }, i) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + i + 1;
                  const relIPct = row.rel_intensity * 100;
                  const action = suggestedAction(relIPct, rankPct);
                  return (
                    <tr key={globalIdx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1.5 px-2 text-gray-400 tabular-nums">{globalIdx}</td>
                      <td className="py-1.5 px-2 font-mono tabular-nums">{row.mass.toFixed(2)}</td>
                      <td className={`py-1.5 px-2 tabular-nums text-right font-medium ${
                        relIPct >= 50 ? "text-red-600" : relIPct >= 10 ? "text-amber-600" : "text-gray-500"
                      }`}>
                        {relIPct.toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">{fmt(row.rt, 2)}</td>
                      <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">{row.block}</td>
                      <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                        top {100 - rankPct + 1}%
                      </td>
                      <td className="py-1.5 px-2">
                        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">No</span>
                      </td>
                      <td className={`py-1.5 px-2 max-w-[220px] leading-tight ${action.color}`}>
                        {action.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            onChange={(p) => setPage(p)}
          />

          {nTotal > 100 && !showAll && (
            <button
              type="button"
              onClick={() => { setShowAll(true); setPage(1); }}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800"
            >
              Show all {nTotal} unexplained peaks (currently showing top 100 by intensity)
            </button>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Peaks are classified as "unused" when no candidate read chain connects through them.
            High-intensity unused peaks warrant manual review — they may indicate a dominant co-eluting RNA species,
            carry-over from a prior run, or a short read that falls below the current minimum length filter.
          </p>
        </>
      )}
    </Card>
  );
}
