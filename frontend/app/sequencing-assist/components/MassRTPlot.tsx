"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SigmoidPoint, SigmoidPostPoint, ChainPoint } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Top-4 candidate reads get visually distinct bold colors
const TOP4_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#a855f7"];

// Unexplained high-intensity threshold (block-normalized Rel_I ≥ 0.5)
const HIGH_INTENSITY_THRESH = 0.5;

interface Props {
  points: SigmoidPoint[] | null;
  postPipeline: SigmoidPostPoint[] | null;
  topChains: ChainPoint[] | null;
  minChainLen?: number;
  selectedReadRank?: number | null;
}

export function MassRTPlot({ points, postPipeline, topChains, minChainLen = 10, selectedReadRank }: Props) {
  const rtStats = useMemo(() => {
    const src = postPipeline || points;
    if (!src || src.length === 0) return null;
    const rts = src.map((p) => p.T).filter((v) => Number.isFinite(v));
    const sorted = [...rts].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const spread = max - min;
    const p10 = sorted[Math.floor(rts.length * 0.1)];
    const p90 = sorted[Math.floor(rts.length * 0.9)];
    return { min, max, spread, iqr: p90 - p10, hasHighRT: max > 18 };
  }, [points, postPipeline]);

  const traces = useMemo(() => {
    const result: any[] = [];

    // ── Background scatter ────────────────────────────────────────────────
    if (postPipeline && postPipeline.length > 0) {
      const unmatched = postPipeline.filter(
        (p) => p.status === "unused" || p.status === "unknown"
      );
      const matched = postPipeline.filter(
        (p) => p.status !== "unused" && p.status !== "unknown"
      );
      const lowUnmatched = unmatched.filter((p) => p.Rel_I < HIGH_INTENSITY_THRESH);
      const highUnmatched = unmatched.filter((p) => p.Rel_I >= HIGH_INTENSITY_THRESH);

      if (lowUnmatched.length > 0) {
        result.push({
          x: lowUnmatched.map((p) => p.M),
          y: lowUnmatched.map((p) => p.T),
          mode: "markers",
          type: lowUnmatched.length > 5000 ? "scattergl" : "scatter",
          name: "Unmatched (low intensity)",
          marker: { color: "#9ca3af", size: 3, opacity: 0.35 },
          hoverinfo: "text",
          text: lowUnmatched.map((p) =>
            `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`
          ),
        });
      }

      if (matched.length > 0) {
        result.push({
          x: matched.map((p) => p.M),
          y: matched.map((p) => p.T),
          mode: "markers",
          type: "scatter",
          name: "Matched",
          marker: { color: "#93c5fd", size: 4, opacity: 0.65 },
          hoverinfo: "text",
          text: matched.map((p) =>
            `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`
          ),
        });
      }

      // Orange diamonds = unexplained high-intensity peaks
      if (highUnmatched.length > 0) {
        result.push({
          x: highUnmatched.map((p) => p.M),
          y: highUnmatched.map((p) => p.T),
          mode: "markers",
          type: "scatter",
          name: "Unexplained high-intensity",
          marker: {
            color: "#f97316",
            size: 9,
            opacity: 0.9,
            symbol: "diamond",
            line: { color: "#c2410c", width: 1.5 },
          },
          hoverinfo: "text",
          text: highUnmatched.map((p) =>
            `<b>Unexplained high-intensity</b><br>` +
            `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>` +
            `Rel.I: ${p.Rel_I.toFixed(4)} ≥ ${HIGH_INTENSITY_THRESH} (unmatched)`
          ),
        });
      }
    } else if (points && points.length > 0) {
      result.push({
        x: points.map((p) => p.M),
        y: points.map((p) => p.T),
        mode: "markers",
        type: points.length > 5000 ? "scattergl" : "scatter",
        name: "All peaks",
        marker: {
          color: points.map((p) => p.Rel_I),
          colorscale: "Viridis",
          size: 3, opacity: 0.55,
          colorbar: { title: "Rel_I", thickness: 12, len: 0.5 },
        },
        hoverinfo: "text",
        text: points.map((p) =>
          `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`
        ),
      });
    }

    // ── Chain overlays ────────────────────────────────────────────────────
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
          y: sorted.map((p) => p.rt),
          mode: "lines+markers",
          type: "scatter",
          name: label,
          showlegend: isTop4,
          line: { color, width: isSelected ? 4 : (isTop4 ? 3 : 1.5) },
          marker: {
            color,
            size: isSelected ? 11 : (isTop4 ? 9 : 5),
            ...((isTop4 || isSelected) ? { line: { color: "#fff", width: 1.5 } } : {}),
          },
          hoverinfo: "text",
          text: sorted.map((p) =>
            `<b>Read #${readRank}${isTop4 ? ` · ${n} nt` : ""}</b><br>` +
            `Mass: ${p.mass.toFixed(2)} Da<br>` +
            `RT: ${p.rt.toFixed(2)} min<br>` +
            `Rel.I: ${p.rel_i.toFixed(4)}`
          ),
        });
      });
    }

    return result;
  }, [points, postPipeline, topChains, selectedReadRank]);

  const shapes = useMemo(() => {
    if (!rtStats?.hasHighRT) return [];
    return [{
      type: "rect",
      xref: "paper", x0: 0, x1: 1,
      yref: "y", y0: 20, y1: Math.max(rtStats.max + 1, 25.5),
      fillcolor: "rgba(239,68,68,0.06)",
      line: { color: "rgba(239,68,68,0.3)", width: 1, dash: "dash" },
    }];
  }, [rtStats]);

  const layoutAnnotations = useMemo(() => {
    if (!rtStats?.hasHighRT) return [];
    return [{
      x: 0.98, xref: "paper", xanchor: "right",
      y: 21, yref: "y",
      text: "RT > 20 min — likely artifacts",
      showarrow: false,
      font: { size: 10, color: "#ef4444" },
    }];
  }, [rtStats]);

  const yAxisRange = useMemo(() => {
    if (!rtStats) return [0, 25];
    return [
      Math.max(0, rtStats.min - 1),
      rtStats.hasHighRT
        ? Math.max(rtStats.max + 1, 25.5)
        : rtStats.max + Math.max(rtStats.spread * 0.08, 1),
    ];
  }, [rtStats]);

  const isFlat = rtStats != null && rtStats.iqr < 3;
  const hasData = (points && points.length > 0) || (postPipeline && postPipeline.length > 0);

  const subtitle = isFlat
    ? `RT spread: ${rtStats!.spread.toFixed(1)} min (compressed). The sigmoidal shape requires a reversed-phase ion-pairing gradient. Top 4 reads = bold colored lines; orange diamonds = unexplained high-intensity unmatched peaks.`
    : "RT increases with fragment mass (sigmoidal). Bold colored lines = top 4 candidate reads. Orange diamonds = unexplained high-intensity peaks (Rel_I ≥ 0.5, unmatched). Gray = low-intensity unmatched.";

  return (
    <Card title="Mass vs. Retention Time" subtitle={subtitle}>
      {isFlat && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <strong>Flat RT distribution detected.</strong> All fragments elute within a{" "}
          {rtStats!.iqr.toFixed(1)} min window — the sigmoidal separation requires a
          length-dependent gradient. The Rel_I scatter plot still reflects signal intensity correctly.
        </div>
      )}
      {!hasData ? (
        <EmptyState>Upload data to see the RT–mass curve.</EmptyState>
      ) : (
        <div className="w-full" style={{ height: 520 }}>
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 60, r: 20, t: 20, b: 55 },
              xaxis: {
                title: { text: "Monoisotopic Mass, M (Da)", font: { size: 12 } },
                gridcolor: "#e5e7eb",
              },
              yaxis: {
                title: { text: "Retention Time (min)", font: { size: 12 } },
                gridcolor: "#e5e7eb",
                range: yAxisRange,
              },
              plot_bgcolor: "#fff",
              paper_bgcolor: "transparent",
              legend: {
                orientation: "h" as const,
                y: 1.14, x: 0.5, xanchor: "center" as const,
                font: { size: 12 },
                bgcolor: "rgba(255,255,255,0.85)",
                bordercolor: "#e5e7eb", borderwidth: 1,
              },
              shapes,
              annotations: layoutAnnotations,
              hovermode: "closest",
              dragmode: "zoom",
            }}
            config={{ responsive: true, displayModeBar: true, displaylogo: false }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
    </Card>
  );
}
