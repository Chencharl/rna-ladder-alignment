"use client";

import { useMemo, useState } from "react";
import type { ProphetMatchingResult, ProphetMatchingRow } from "../lib/api";
import { Card, EmptyState, Pagination } from "./ui";

const PAGE_SIZE = 30;

function CoverageBar({ rows }: { rows: ProphetMatchingRow[] }) {
  const CELL_W = 10;
  const total = rows.length;
  if (total === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-medium text-gray-500">5′ ladder</span>
        <div className="flex flex-wrap gap-0.5">
          {rows.map((r) => {
            const cls = !r.in_range_5p
              ? "bg-gray-100"
              : r.hit_5p
              ? "bg-blue-500"
              : "bg-gray-200";
            return (
              <div
                key={r.position}
                title={`Pos ${r.position} ${r.residue}: ${!r.in_range_5p ? "out of range" : r.hit_5p ? `observed ${r.obs_mass_5p?.toFixed(2)} Da` : "not detected"}`}
                style={{ width: CELL_W, height: CELL_W }}
                className={`rounded-sm ${cls}`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500">3′ ladder</span>
        <div className="flex flex-wrap gap-0.5">
          {rows.map((r) => {
            const cls = !r.in_range_3p
              ? "bg-gray-100"
              : r.hit_3p
              ? "bg-purple-500"
              : "bg-gray-200";
            return (
              <div
                key={r.position}
                title={`Pos ${r.position} ${r.residue}: ${!r.in_range_3p ? "out of range" : r.hit_3p ? `observed ${r.obs_mass_3p?.toFixed(2)} Da` : "not detected"}`}
                style={{ width: CELL_W, height: CELL_W }}
                className={`rounded-sm ${cls}`}
              />
            );
          })}
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> 5′ hit
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-purple-500" /> 3′ hit
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-200" /> not detected
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-100" /> outside 2–23 kDa
        </span>
      </div>
    </div>
  );
}

export function ProphetMatchingView({ result }: { result: ProphetMatchingResult | null }) {
  const [page, setPage] = useState(1);
  const [showLadder, setShowLadder] = useState<"both" | "5p" | "3p">("both");
  const [missOnly, setMissOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!result) return [];
    return result.rows.filter((r) => {
      if (missOnly) {
        const miss5 = r.in_range_5p && !r.hit_5p;
        const miss3 = r.in_range_3p && !r.hit_3p;
        return miss5 || miss3;
      }
      return true;
    });
  }, [result, missOnly]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!result) {
    return (
      <Card
        title="Reference-Guided Ladder Matching"
        subtitle="Provide a reference sequence in the input above to enable prophet matching — a position-by-position comparison of theoretical vs. observed fragment masses."
      >
        <EmptyState>No reference sequence provided. Enter the RNA sequence (A/U/G/C) in the reference field above and re-run the analysis.</EmptyState>
      </Card>
    );
  }

  if (result.n_positions === 0) {
    return (
      <Card title="Reference-Guided Ladder Matching" subtitle="">
        <EmptyState>Reference sequence could not be parsed — ensure it contains valid nucleotide symbols (A, U, G, C and standard modification codes).</EmptyState>
      </Card>
    );
  }

  const { n_positions, n_in_range_5p, n_in_range_3p, n_5p_hits, n_3p_hits,
          coverage_5p_pct, coverage_3p_pct, best_consecutive_5p, best_consecutive_3p, tolerance_da } = result;

  return (
    <Card
      title="Reference-Guided Ladder Matching"
      subtitle={`Position-by-position comparison of theoretical and observed fragment masses for the provided ${n_positions}-nt reference. Tolerance ±${tolerance_da * 1000} mDa. ${n_in_range_5p} positions fall in the 2–23 kDa analysis window for the 5′ ladder, ${n_in_range_3p} for the 3′ ladder.`}
    >
      {/* Summary stats */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center min-w-[90px]">
          <div className="text-lg font-bold tabular-nums text-blue-700">{n_5p_hits}/{n_in_range_5p}</div>
          <div className="text-xs text-blue-500">5′ positions hit</div>
          <div className="text-xs font-medium text-blue-700">{coverage_5p_pct}%</div>
        </div>
        <div className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-center min-w-[90px]">
          <div className="text-lg font-bold tabular-nums text-purple-700">{n_3p_hits}/{n_in_range_3p}</div>
          <div className="text-xs text-purple-500">3′ positions hit</div>
          <div className="text-xs font-medium text-purple-700">{coverage_3p_pct}%</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center min-w-[90px]">
          <div className="text-lg font-bold tabular-nums text-blue-800">{best_consecutive_5p} nt</div>
          <div className="text-xs text-blue-500">longest consecutive 5′ run</div>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-center min-w-[90px]">
          <div className="text-lg font-bold tabular-nums text-purple-800">{best_consecutive_3p} nt</div>
          <div className="text-xs text-purple-500">longest consecutive 3′ run</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center min-w-[90px]">
          <div className="text-lg font-bold tabular-nums text-gray-700">{n_positions} nt</div>
          <div className="text-xs text-gray-500">reference length</div>
        </div>
      </div>

      {/* Coverage bar */}
      <CoverageBar rows={result.rows} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-3 items-center">
        <span className="text-xs text-gray-400">Show:</span>
        {(["both", "5p", "3p"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { setShowLadder(v); setPage(1); }}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              showLadder === v
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
          >
            {v === "both" ? "Both ladders" : v === "5p" ? "5′ only" : "3′ only"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setMissOnly((p) => !p); setPage(1); }}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            missOnly
              ? "bg-amber-100 text-amber-700 border-amber-300"
              : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
          }`}
        >
          {missOnly ? "Showing misses only" : "Show misses only"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-gray-400 text-left border-b border-gray-100">
              <th className="py-2 px-2 font-medium w-10">Pos</th>
              <th className="py-2 px-2 font-medium w-8">Nt</th>
              {(showLadder === "both" || showLadder === "5p") && <>
                <th className="py-2 px-2 font-medium text-blue-600">5′ Theor. (Da)</th>
                <th className="py-2 px-2 font-medium text-blue-600">5′ Obs. (Da)</th>
                <th className="py-2 px-2 font-medium text-blue-600 text-right">Δ (mDa)</th>
                <th className="py-2 px-2 font-medium text-blue-600 text-right">Rel.I</th>
                <th className="py-2 px-2 font-medium text-blue-600 text-right">RT (min)</th>
                <th className="py-2 px-2 font-medium text-blue-600 text-center">5′ hit?</th>
              </>}
              {(showLadder === "both" || showLadder === "3p") && <>
                <th className="py-2 px-2 font-medium text-purple-600">3′ Theor. (Da)</th>
                <th className="py-2 px-2 font-medium text-purple-600">3′ Obs. (Da)</th>
                <th className="py-2 px-2 font-medium text-purple-600 text-right">Δ (mDa)</th>
                <th className="py-2 px-2 font-medium text-purple-600 text-right">Rel.I</th>
                <th className="py-2 px-2 font-medium text-purple-600 text-right">RT (min)</th>
                <th className="py-2 px-2 font-medium text-purple-600 text-center">3′ hit?</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r) => (
              <tr key={r.position} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-1.5 px-2 tabular-nums text-gray-400">{r.position}</td>
                <td className="py-1.5 px-2 font-mono font-bold text-gray-700">{r.residue}</td>
                {(showLadder === "both" || showLadder === "5p") && <>
                  <td className={`py-1.5 px-2 tabular-nums font-mono ${!r.in_range_5p ? "text-gray-300" : "text-gray-600"}`}>
                    {r.in_range_5p ? r.theor_mass_5p.toFixed(4) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums font-mono">
                    {r.hit_5p ? (
                      <span className="text-blue-700 font-medium">{r.obs_mass_5p?.toFixed(4)}</span>
                    ) : r.in_range_5p ? (
                      <span className="text-gray-300">NA</span>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {r.hit_5p ? r.delta_mda_5p?.toFixed(1) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {r.hit_5p && r.obs_rel_i_5p != null ? (r.obs_rel_i_5p * 100).toFixed(1) + "%" : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {r.hit_5p ? r.obs_rt_5p?.toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {!r.in_range_5p ? (
                      <span className="text-gray-300 text-xs">○</span>
                    ) : r.hit_5p ? (
                      <span className="text-blue-600 font-bold">✓</span>
                    ) : (
                      <span className="text-gray-300">✗</span>
                    )}
                  </td>
                </>}
                {(showLadder === "both" || showLadder === "3p") && <>
                  <td className={`py-1.5 px-2 tabular-nums font-mono ${!r.in_range_3p ? "text-gray-300" : "text-gray-600"}`}>
                    {r.in_range_3p ? r.theor_mass_3p.toFixed(4) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums font-mono">
                    {r.hit_3p ? (
                      <span className="text-purple-700 font-medium">{r.obs_mass_3p?.toFixed(4)}</span>
                    ) : r.in_range_3p ? (
                      <span className="text-gray-300">NA</span>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {r.hit_3p ? r.delta_mda_3p?.toFixed(1) : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {r.hit_3p && r.obs_rel_i_3p != null ? (r.obs_rel_i_3p * 100).toFixed(1) + "%" : "—"}
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {r.hit_3p ? r.obs_rt_3p?.toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {!r.in_range_3p ? (
                      <span className="text-gray-300 text-xs">○</span>
                    ) : r.hit_3p ? (
                      <span className="text-purple-600 font-bold">✓</span>
                    ) : (
                      <span className="text-gray-300">✗</span>
                    )}
                  </td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <EmptyState>No rows match the current filter.</EmptyState>
      )}

      <Pagination page={page} pageCount={pageCount} onChange={(p) => setPage(p)} />

      <p className="text-xs text-gray-400 mt-3">
        Prophet matching computes theoretical fragment masses for every position in the reference sequence
        (5′ ladder: 5′-phosphate terminus, seed +97.98 Da; 3′ ladder: cyclic-phosphate terminus, seed −61.96 Da)
        and searches observed peaks within ±{tolerance_da * 1000} mDa. A position is "hit" when any observed
        peak falls within this window. Unlike de novo chain building, consecutive hits are not required —
        a long read is reported when many non-consecutive positions are independently confirmed.
        All calls require validation against orthogonal data (sequencing, metabolic labeling).
      </p>
    </Card>
  );
}
