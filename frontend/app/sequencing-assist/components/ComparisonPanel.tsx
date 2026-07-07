"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { ChainPoint, CoverageBin } from "../lib/api";
import { Card } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  labelA: string;
  labelB: string;
  chainsA: ChainPoint[] | null;
  chainsB: ChainPoint[] | null;
  coverageA: CoverageBin[] | null;
  coverageB: CoverageBin[] | null;
}

// Two chains "overlap" if their mass ranges share ≥50% of the shorter range.
function massOverlapFraction(a: ChainPoint[], b: ChainPoint[]): number {
  const aMin = Math.min(...a.map((p) => p.mass));
  const aMax = Math.max(...a.map((p) => p.mass));
  const bMin = Math.min(...b.map((p) => p.mass));
  const bMax = Math.max(...b.map((p) => p.mass));
  const overlapLo = Math.max(aMin, bMin);
  const overlapHi = Math.min(aMax, bMax);
  if (overlapHi <= overlapLo) return 0;
  const overlap = overlapHi - overlapLo;
  const shorter = Math.min(aMax - aMin, bMax - bMin);
  return shorter > 0 ? overlap / shorter : 0;
}

export function ComparisonPanel({ labelA, labelB, chainsA, chainsB, coverageA, coverageB }: Props) {
  // Group chains by read_rank
  const groupsA = useMemo(() => {
    if (!chainsA) return new Map<number, ChainPoint[]>();
    const m = new Map<number, ChainPoint[]>();
    for (const p of chainsA) {
      const arr = m.get(p.read_rank) ?? [];
      arr.push(p);
      m.set(p.read_rank, arr);
    }
    return m;
  }, [chainsA]);

  const groupsB = useMemo(() => {
    if (!chainsB) return new Map<number, ChainPoint[]>();
    const m = new Map<number, ChainPoint[]>();
    for (const p of chainsB) {
      const arr = m.get(p.read_rank) ?? [];
      arr.push(p);
      m.set(p.read_rank, arr);
    }
    return m;
  }, [chainsB]);

  // Classify chains: A-only, B-only, shared (≥50% mass overlap)
  const { sharedA, uniqueA, sharedB, uniqueB } = useMemo(() => {
    const bVals = [...groupsB.values()];
    const aVals = [...groupsA.values()];
    const pairedB = new Set<number>();

    const sharedA: number[] = [];
    const uniqueA: number[] = [];

    for (const [rankA, ptsA] of groupsA.entries()) {
      let bestOverlap = 0;
      let bestRankB = -1;
      for (const [rankB, ptsB] of groupsB.entries()) {
        const ov = massOverlapFraction(ptsA, ptsB);
        if (ov > bestOverlap) { bestOverlap = ov; bestRankB = rankB; }
      }
      if (bestOverlap >= 0.5) {
        sharedA.push(rankA);
        pairedB.add(bestRankB);
      } else {
        uniqueA.push(rankA);
      }
    }

    const sharedB: number[] = [];
    const uniqueB: number[] = [];
    for (const [rankB] of groupsB.entries()) {
      if (pairedB.has(rankB)) sharedB.push(rankB);
      else uniqueB.push(rankB);
    }

    return { sharedA, uniqueA, sharedB, uniqueB };
  }, [groupsA, groupsB]);

  // Build Plotly traces
  const traces = useMemo(() => {
    const result: any[] = [];

    const addChainTraces = (
      groups: Map<number, ChainPoint[]>,
      ranks: number[],
      color: string,
      namePrefix: string,
      dash: string,
    ) => {
      ranks.forEach((rank, i) => {
        const pts = [...(groups.get(rank) ?? [])].sort((a, b) => a.mass - b.mass);
        if (pts.length === 0) return;
        result.push({
          x: pts.map((p) => p.mass),
          y: pts.map((p) => p.rel_i),
          mode: "lines+markers",
          type: "scatter",
          name: i === 0 ? namePrefix : "",
          showlegend: i === 0,
          line: { color, width: 2, dash },
          marker: { color, size: 6, line: { color: "#fff", width: 1 } },
          hoverinfo: "text",
          text: pts.map(
            (p) => `Read #${rank} · ${namePrefix}<br>Mass: ${p.mass.toFixed(2)} Da<br>Rel.I: ${p.rel_i.toFixed(4)}`
          ),
        });
      });
    };

    // Shared chains (green — reproducible signal)
    addChainTraces(groupsA, sharedA, "#22c55e", `Shared (${labelA})`, "solid");
    addChainTraces(groupsB, sharedB, "#16a34a", `Shared (${labelB})`, "dot");
    // Unique to A (blue)
    addChainTraces(groupsA, uniqueA, "#3b82f6", `${labelA} only`, "solid");
    // Unique to B (red)
    addChainTraces(groupsB, uniqueB, "#ef4444", `${labelB} only`, "solid");

    return result;
  }, [groupsA, groupsB, sharedA, sharedB, uniqueA, uniqueB, labelA, labelB]);

  // Coverage summary table rows
  const coverageSummary = useMemo(() => {
    const rows: { label: string; pctA: number | null; pctB: number | null }[] = [];
    const labelsA = coverageA?.map((b) => b.label) ?? [];
    const labelsB = coverageB?.map((b) => b.label) ?? [];
    const allLabels = Array.from(new Set([...labelsA, ...labelsB]));
    for (const lbl of allLabels) {
      const a = coverageA?.find((b) => b.label === lbl);
      const b = coverageB?.find((b) => b.label === lbl);
      rows.push({ label: lbl, pctA: a?.pct ?? null, pctB: b?.pct ?? null });
    }
    return rows;
  }, [coverageA, coverageB]);

  const totalA = groupsA.size;
  const totalB = groupsB.size;

  return (
    <Card
      title="Sample Comparison"
      subtitle={`Overlay of candidate reads from two samples. Green = reproducible (mass-overlap ≥50%); blue = ${labelA}-only; red = ${labelB}-only. Shared reads represent conserved RNA modification sites.`}
    >
      {/* ── Stats bar ── */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          <span className="text-gray-600">{labelA}: <strong>{totalA}</strong> reads</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span className="text-gray-600">{labelB}: <strong>{totalB}</strong> reads</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span className="text-gray-600">Shared: <strong>{sharedA.length}</strong> reads</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-300 inline-block" />
          <span className="text-gray-600">{labelA}-only: <strong>{uniqueA.length}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-300 inline-block" />
          <span className="text-gray-600">{labelB}-only: <strong>{uniqueB.length}</strong></span>
        </div>
      </div>

      {/* ── Overlay scatter ── */}
      {traces.length > 0 ? (
        <div className="w-full" style={{ height: 420 }}>
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 55, r: 20, t: 20, b: 50 },
              xaxis: {
                title: { text: "Monoisotopic Mass (Da)", font: { size: 12 } },
                gridcolor: "#e5e7eb",
              },
              yaxis: {
                title: { text: "Block-wise Rel_I", font: { size: 12 } },
                gridcolor: "#e5e7eb",
              },
              plot_bgcolor: "#fff",
              paper_bgcolor: "transparent",
              legend: {
                orientation: "h" as const,
                y: 1.12, x: 0.5, xanchor: "center" as const,
                font: { size: 11 },
                bgcolor: "rgba(255,255,255,0.85)",
                bordercolor: "#e5e7eb",
                borderwidth: 1,
              },
              hovermode: "closest",
            }}
            config={{ responsive: true, displayModeBar: true, displaylogo: false }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No chain data to compare yet.</p>
      )}

      {/* ── Coverage comparison table ── */}
      {coverageSummary.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Coverage comparison
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200">Intensity bin</th>
                  <th className="text-center px-3 py-2 font-medium text-blue-700 border border-gray-200">{labelA}</th>
                  <th className="text-center px-3 py-2 font-medium text-red-700 border border-gray-200">{labelB}</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 border border-gray-200">Δ</th>
                </tr>
              </thead>
              <tbody>
                {coverageSummary.map((row) => {
                  const delta =
                    row.pctA != null && row.pctB != null
                      ? (row.pctA - row.pctB).toFixed(1)
                      : "—";
                  const deltaNum = row.pctA != null && row.pctB != null ? row.pctA - row.pctB : null;
                  return (
                    <tr key={row.label} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700 border border-gray-200 whitespace-nowrap">
                        {row.label}
                      </td>
                      <td className="text-center px-3 py-2 border border-gray-200 font-medium text-blue-700">
                        {row.pctA != null ? `${row.pctA}%` : "—"}
                      </td>
                      <td className="text-center px-3 py-2 border border-gray-200 font-medium text-red-700">
                        {row.pctB != null ? `${row.pctB}%` : "—"}
                      </td>
                      <td
                        className={`text-center px-3 py-2 border border-gray-200 font-mono font-medium ${
                          deltaNum == null ? "text-gray-400"
                          : deltaNum > 5 ? "text-blue-600"
                          : deltaNum < -5 ? "text-red-600"
                          : "text-gray-600"
                        }`}
                      >
                        {deltaNum == null ? "—" : (deltaNum > 0 ? `+${delta}` : delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
