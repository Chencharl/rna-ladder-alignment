"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { TopParallelRow, PeakStatusRow } from "../lib/types";
import type { ScatterPoint, ChainPoint } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Same rank-based palette as MassRTPlot for visual consistency
const TOP4_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#a855f7"];

interface Props {
  rawScatter: ScatterPoint[] | null;
  topChains: ChainPoint[] | null;
  topParallel: TopParallelRow[] | null;
  peakStatus: PeakStatusRow[] | null;
  minChainLen?: number;
  nChainsTotal?: number;
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
}

export function PeakScatterPlot({
  rawScatter, topChains, topParallel, peakStatus,
  minChainLen = 10, nChainsTotal, selectedReadRank,
}: Props) {

  const traces = useMemo(() => {
    const result: any[] = [];

    // ── Background scatter (all peaks, gray) ─────────────────────────────
    const bgSource = rawScatter || (peakStatus ? peakStatus.map(p => ({
      M: p.mass, Rel_I: p.rel_intensity, T: p.rt, block: p.block,
    })) : null);

    if (bgSource && bgSource.length > 0) {
      result.push({
        x: bgSource.map((p) => p.M),
        y: bgSource.map((p) => p.Rel_I),
        mode: "markers",
        type: bgSource.length > 5000 ? "scattergl" : "scatter",
        name: "All peaks",
        marker: { color: "#9ca3af", size: 3, opacity: 0.4 },
        hoverinfo: "text",
        text: bgSource.map((p) =>
          `Mass: ${p.M.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}<br>RT: ${p.T.toFixed(2)}`
        ),
      });
    }

    // ── Chain overlays: rank-based colors, top 4 bold ────────────────────
    if (topChains && topChains.length > 0) {
      const byChain = new Map<number, ChainPoint[]>();
      for (const p of topChains) {
        const arr = byChain.get(p.chain_index) ?? [];
        arr.push(p);
        byChain.set(p.chain_index, arr);
      }

      // Sort by read_rank (algorithm intensity rank); lower = higher priority
      const sortedChains = [...byChain.values()].sort(
        (a, b) => (a[0]?.read_rank ?? Infinity) - (b[0]?.read_rank ?? Infinity)
      );

      sortedChains.forEach((pts, idx) => {
        const sorted = [...pts].sort((a, b) => a.mass - b.mass);
        const n = sorted[0].n_points;
        const readRank = sorted[0].read_rank ?? (idx + 1);
        const isTop4 = idx < 4;
        const isSelected = selectedReadRank != null && readRank === selectedReadRank;
        const baseColor = isTop4 ? TOP4_COLORS[idx] : "#d1d5db";
        const color = isSelected ? "#f59e0b" : baseColor;
        const label = isTop4 ? `Read #${readRank} (${n} nt)` : "";

        result.push({
          x: sorted.map((p) => p.mass),
          y: sorted.map((p) => p.rel_i),
          mode: "lines+markers",
          type: "scatter",
          name: label,
          showlegend: isTop4,
          line: { color, width: isSelected ? 4 : (isTop4 ? 3 : 1.5) },
          marker: {
            color,
            size: isSelected ? 11 : (isTop4 ? 8 : 4),
            ...((isTop4 || isSelected) ? { line: { color: "#fff", width: 1.5 } } : {}),
          },
          hoverinfo: (isTop4 || isSelected) ? "text" : "skip",
          text: (isTop4 || isSelected) ? sorted.map((p) =>
            `<b>Read #${readRank} · ${n} nt</b><br>Mass: ${p.mass.toFixed(2)} Da<br>Rel.I: ${p.rel_i.toFixed(4)}<br>RT: ${p.rt.toFixed(2)} min`
          ) : [],
        });
      });

    } else if (!topChains && topParallel && topParallel.length > 0) {
      // Fallback: topParallel rows (local two-phase mode without chain data)
      const byRank = new Map<number, TopParallelRow[]>();
      for (const r of topParallel) {
        const list = byRank.get(r.read_rank) ?? [];
        list.push(r);
        byRank.set(r.read_rank, list);
      }

      const sortedRanks = [...byRank.entries()].sort((a, b) => a[0] - b[0]);

      sortedRanks.forEach(([rank, rows], idx) => {
        const sorted = rows.sort((a, b) => a.row_position - b.row_position);
        const isTop4 = idx < 4;
        const isSelected = selectedReadRank === rank;
        const color = isTop4 ? TOP4_COLORS[idx] : "#d1d5db";

        result.push({
          x: sorted.map((r) => r.mass),
          y: sorted.map((r) => r.rel_i),
          mode: "lines+markers",
          type: "scatter",
          name: isTop4 ? `Read #${rank}` : "",
          showlegend: isTop4,
          line: { color, width: isSelected ? 4 : (isTop4 ? 3 : 1.5) },
          marker: {
            color,
            size: isSelected ? 10 : (isTop4 ? 8 : 4),
            ...(isTop4 ? { line: { color: "#fff", width: 1.5 } } : {}),
          },
          hoverinfo: isTop4 ? "text" : "skip",
          text: isTop4 ? sorted.map((r) =>
            `<b>Read #${rank}</b><br>Mass: ${r.mass.toFixed(2)}<br>Rel.I: ${r.rel_i.toFixed(4)}<br>RT: ${r.rt.toFixed(2)}<br>Pos: ${r.row_position}/${sorted.length}`
          ) : [],
        });
      });
    }

    return result;
  }, [rawScatter, topChains, topParallel, peakStatus, selectedReadRank]);

  const hasData = (rawScatter && rawScatter.length > 0) ||
    (topParallel && topParallel.length > 0) || (peakStatus && peakStatus.length > 0);

  const nShown = topChains ? new Set(topChains.map((p) => p.chain_index)).size : null;
  const chainNote =
    nShown != null && nChainsTotal != null
      ? nShown > 0
        ? `${nShown} chain${nShown > 1 ? "s" : ""} with ≥${minChainLen} nt shown (${nChainsTotal} total recovered). Top 4 in bold colors (red/blue/green/purple by rank).`
        : `No chains with ≥${minChainLen} nt — ${nChainsTotal} shorter fragments recovered. Try reducing Min read length.`
      : "Gray = all peaks. Colored lines = top candidate reads.";

  return (
    <Card
      title="Relative Intensity vs. Mass"
      subtitle={`Block-wise Rel_I. ${chainNote}`}
    >
      {!hasData ? (
        <EmptyState>Upload a deconvoluted Excel file to see the scatter plot.</EmptyState>
      ) : (
        <>
          {nShown === 0 && nChainsTotal != null && nChainsTotal > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {nChainsTotal} chain{nChainsTotal > 1 ? "s" : ""} recovered but all are shorter
              than {minChainLen} nt. Reduce <strong>Min read length</strong> in the analysis
              parameters and re-run.
            </div>
          )}
          <div className="w-full" style={{ height: 520 }}>
            <Plot
              data={traces}
              layout={{
                autosize: true,
                margin: { l: 70, r: 20, t: 20, b: 60 },
                xaxis: {
                  title: { text: "Monoisotopic Mass, M (Da)", font: { size: 13 } },
                  gridcolor: "#e5e7eb", zeroline: false,
                },
                yaxis: {
                  title: { text: "Relative Intensity (linear)", font: { size: 13 } },
                  gridcolor: "#e5e7eb", zeroline: false,
                  range: [-0.02, 1.22], dtick: 0.2,
                },
                plot_bgcolor: "#ffffff",
                paper_bgcolor: "transparent",
                legend: {
                  orientation: "h" as const,
                  y: 1.12, x: 0.5, xanchor: "center" as const,
                  font: { size: 12 },
                  bgcolor: "rgba(255,255,255,0.85)",
                  bordercolor: "#e5e7eb", borderwidth: 1,
                },
                dragmode: "zoom" as const,
                hovermode: "closest" as const,
              }}
              config={{
                responsive: true,
                displayModeBar: true,
                modeBarButtonsToRemove: ["lasso2d", "select2d", "sendDataToCloud"] as any,
                displaylogo: false,
              }}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </>
      )}
    </Card>
  );
}
