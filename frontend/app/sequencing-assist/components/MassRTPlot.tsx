"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SigmoidPoint, SigmoidPostPoint, ChainPoint } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const CALL_COLORS: Record<string, string> = {
  "5'":      "#1a56db",
  "3'":      "#7e3af2",
  ambiguous: "#d97706",
  conflict:  "#c81e1e",
};

function normalizeCall(raw: string): string {
  const v = raw.toLowerCase();
  if (v.includes("5")) return "5'";
  if (v.includes("3")) return "3'";
  if (v.includes("conflict")) return "conflict";
  return "ambiguous";
}

interface Props {
  points: SigmoidPoint[] | null;
  postPipeline: SigmoidPostPoint[] | null;
  topChains: ChainPoint[] | null;
  minChainLen?: number;
}

export function MassRTPlot({ points, postPipeline, topChains, minChainLen = 10 }: Props) {
  // ── Compute RT range from actual data for adaptive axis ───────────────────
  const rtStats = useMemo(() => {
    const src = postPipeline || points;
    if (!src || src.length === 0) return null;
    const rts = src.map((p) => p.T).filter((v) => Number.isFinite(v));
    const min = Math.min(...rts);
    const max = Math.max(...rts);
    const spread = max - min;
    const p10 = [...rts].sort((a, b) => a - b)[Math.floor(rts.length * 0.1)];
    const p90 = [...rts].sort((a, b) => a - b)[Math.floor(rts.length * 0.9)];
    const iqr = p90 - p10;  // 80% interquartile range
    return { min, max, spread, iqr, hasHighRT: max > 18 };
  }, [points, postPipeline]);

  const traces = useMemo(() => {
    const result: any[] = [];
    const bgData = postPipeline || points;
    if (!bgData || bgData.length === 0) return result;

    if (postPipeline) {
      const matched   = postPipeline.filter((p) => p.status !== "unused" && p.status !== "unknown");
      const unmatched = postPipeline.filter((p) => p.status === "unused" || p.status === "unknown");

      if (unmatched.length > 0) {
        result.push({
          x: unmatched.map((p) => p.M),
          y: unmatched.map((p) => p.T),
          mode: "markers",
          type: unmatched.length > 5000 ? "scattergl" : "scatter",
          name: "Unmatched",
          legendgroup: "unmatched",
          marker: { color: "#9ca3af", size: 3, opacity: 0.4 },
          hoverinfo: "text",
          text: unmatched.map((p) =>
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
          legendgroup: "matched",
          marker: { color: "#3b82f6", size: 5, opacity: 0.75 },
          hoverinfo: "text",
          text: matched.map((p) =>
            `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}<br>${p.status}`
          ),
        });
      }
    } else if (points) {
      result.push({
        x: points.map((p) => p.M),
        y: points.map((p) => p.T),
        mode: "markers",
        type: points.length > 5000 ? "scattergl" : "scatter",
        name: "All peaks",
        legendgroup: "bg",
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

    // ── Chain overlays (grouped legend same as scatter plot) ─────────────
    if (topChains && topChains.length > 0) {
      const byChain = new Map<number, ChainPoint[]>();
      for (const p of topChains) {
        const list = byChain.get(p.chain_index) ?? [];
        list.push(p);
        byChain.set(p.chain_index, list);
      }

      const typesPresent = new Set(
        [...byChain.values()].map((pts) => normalizeCall(pts[0].ladder_type))
      );
      for (const callType of ["5'", "3'", "ambiguous", "conflict"]) {
        if (!typesPresent.has(callType)) continue;
        result.push({
          x: [], y: [], mode: "lines+markers", type: "scatter",
          name: callType, legendgroup: callType, showlegend: true,
          line: { color: CALL_COLORS[callType], width: 2.5 },
          marker: { color: CALL_COLORS[callType], size: 7 },
        });
      }

      for (const [chainIdx, pts] of byChain) {
        const sorted = pts.sort((a, b) => a.mass - b.mass);
        const call = normalizeCall(sorted[0].ladder_type);
        const n = sorted[0].n_points;
        const color = CALL_COLORS[call] ?? "#666";
        result.push({
          x: sorted.map((p) => p.mass),
          y: sorted.map((p) => p.rt),
          mode: "lines+markers",
          type: "scatter",
          name: `#${chainIdx + 1} ${call}`,
          legendgroup: call,
          showlegend: false,
          line: { color, width: 2.5 },
          marker: { color, size: 7, line: { color: "#fff", width: 1 } },
          hoverinfo: "text",
          text: sorted.map((p) =>
            `<b>Chain #${chainIdx + 1} · ${call} · ${n} nt</b><br>` +
            `Mass: ${p.mass.toFixed(2)} Da<br>` +
            `RT: ${p.rt.toFixed(2)} min<br>` +
            `Rel.I: ${p.rel_i.toFixed(4)}`
          ),
        });
      }
    }

    return result;
  }, [points, postPipeline, topChains]);

  // ── Artifact zone — only drawn when data actually reaches RT > 18 min ──
  const shapes = useMemo(() => {
    if (!rtStats?.hasHighRT) return [];
    const yMax = Math.max(rtStats.max + 1, 25.5);
    return [{
      type: "rect",
      xref: "paper", x0: 0, x1: 1,
      yref: "y", y0: 20, y1: yMax,
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

  // ── Adaptive y-axis: tight around data, not a fixed 0-25 ─────────────
  const yAxisRange = useMemo(() => {
    if (!rtStats) return [0, 25];
    const lo = Math.max(0, rtStats.min - 1);
    const hi = rtStats.hasHighRT
      ? Math.max(rtStats.max + 1, 25.5)
      : rtStats.max + Math.max(rtStats.spread * 0.08, 1);
    return [lo, hi];
  }, [rtStats]);

  const isFlat = rtStats != null && rtStats.iqr < 3;

  const hasData = (points && points.length > 0) || (postPipeline && postPipeline.length > 0);

  // ── Subtitle reflects data quality ───────────────────────────────────
  const subtitle = isFlat
    ? `RT spread: ${rtStats!.spread.toFixed(1)} min (compressed). This gradient does not separate fragments by length — the sigmoidal RT–mass curve requires a reversed-phase ion-pairing method. Colored lines = chains traced through RT space.`
    : "The sigmoidal curve shows RT increasing with fragment mass. Colored lines = candidate short reads traced through RT space. Gray = unmatched peaks.";

  return (
    <Card title="Mass vs. Retention Time" subtitle={subtitle}>
      {isFlat && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <strong>Flat RT distribution detected.</strong> All fragments elute within a{" "}
          {rtStats!.iqr.toFixed(1)} min window — the sigmoidal shape depends on a
          length-dependent gradient. The scatter plot above still shows the Rel_I pattern correctly.
        </div>
      )}
      {!hasData ? (
        <EmptyState>Upload data to see the RT–mass curve.</EmptyState>
      ) : (
        <div className="w-full" style={{ height: 500 }}>
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
                y: 1.12, x: 0.5, xanchor: "center" as const,
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
