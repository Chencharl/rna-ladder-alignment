"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SigmoidPoint, SigmoidPostPoint, ChainPoint } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const CALL_COLORS: Record<string, string> = {
  "5'": "#0000CC",
  "3'": "#9900CC",
  ambiguous: "#FF8C00",
  conflict: "#CC0000",
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
}

export function MassRTPlot({ points, postPipeline, topChains }: Props) {
  const traces = useMemo(() => {
    const result: any[] = [];

    // Background scatter — use post-pipeline data if available (has status coloring)
    const bgData = postPipeline || points;
    if (!bgData || bgData.length === 0) return result;

    if (postPipeline) {
      const matched = postPipeline.filter((p) => p.status !== "unused" && p.status !== "unknown");
      const unmatched = postPipeline.filter((p) => p.status === "unused" || p.status === "unknown");

      if (unmatched.length > 0) {
        result.push({
          x: unmatched.map((p) => p.M),
          y: unmatched.map((p) => p.T),
          mode: "markers",
          type: unmatched.length > 5000 ? "scattergl" : "scatter",
          name: "Unmatched",
          marker: { color: "#9ca3af", size: 3, opacity: 0.4 },
          hoverinfo: "text",
          text: unmatched.map((p) =>
            `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}<br>Status: ${p.status}`
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
          marker: { color: "#3b82f6", size: 5, opacity: 0.7 },
          hoverinfo: "text",
          text: matched.map((p) =>
            `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}<br>Status: ${p.status}`
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
        marker: {
          color: points.map((p) => p.Rel_I),
          colorscale: "Viridis",
          size: 3,
          opacity: 0.5,
          colorbar: { title: "Rel_I", thickness: 12, len: 0.5 },
        },
        hoverinfo: "text",
        text: points.map((p) =>
          `Mass: ${p.M.toFixed(2)}<br>RT: ${p.T.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`
        ),
      });
    }

    // Chain overlays on the sigmoid plot
    if (topChains && topChains.length > 0) {
      const byChain = new Map<number, ChainPoint[]>();
      for (const p of topChains) {
        const list = byChain.get(p.chain_index) ?? [];
        list.push(p);
        byChain.set(p.chain_index, list);
      }

      for (const [chainIdx, pts] of byChain) {
        const sorted = pts.sort((a, b) => a.mass - b.mass);
        const call = normalizeCall(sorted[0].ladder_type);
        const color = CALL_COLORS[call] || "#666";

        result.push({
          x: sorted.map((p) => p.mass),
          y: sorted.map((p) => p.rt),
          mode: "lines+markers",
          type: "scatter",
          name: `#${chainIdx + 1} ${call}`,
          line: { color, width: 2 },
          marker: { color, size: 5 },
          hoverinfo: "text",
          text: sorted.map((p) =>
            `<b>Chain #${chainIdx + 1} (${call})</b><br>Mass: ${p.mass.toFixed(2)}<br>RT: ${p.rt.toFixed(2)}<br>Rel.I: ${p.rel_i.toFixed(4)}`
          ),
        });
      }
    }

    return result;
  }, [points, postPipeline, topChains]);

  // Region annotation shapes
  const shapes = useMemo(() => {
    const s: any[] = [];
    // RT > 20 min zone (likely artifacts)
    s.push({
      type: "rect",
      xref: "paper", x0: 0, x1: 1,
      yref: "y", y0: 20, y1: 25,
      fillcolor: "rgba(239,68,68,0.06)",
      line: { color: "rgba(239,68,68,0.3)", width: 1, dash: "dash" },
    });
    return s;
  }, []);

  const annotations = useMemo(() => {
    const a: any[] = [];
    a.push({
      x: 0.98, xref: "paper", xanchor: "right",
      y: 21, yref: "y",
      text: "RT > 20 min — likely artifacts",
      showarrow: false,
      font: { size: 10, color: "#ef4444" },
    });
    return a;
  }, []);

  const hasData = (points && points.length > 0) || (postPipeline && postPipeline.length > 0);

  return (
    <Card
      title="Mass vs. Retention Time"
      subtitle="The sigmoidal curve shows the RT-mass relationship for RNA fragments. Colored lines = candidate short reads traced through RT space. Gray = unmatched peaks."
    >
      {!hasData ? (
        <EmptyState>Upload data to see the RT-mass sigmoid curve.</EmptyState>
      ) : (
        <div className="w-full" style={{ height: 500 }}>
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 60, r: 20, t: 20, b: 55 },
              xaxis: { title: { text: "Monoisotopic Mass, M (Da)", font: { size: 12 } }, gridcolor: "#e5e7eb" },
              yaxis: { title: { text: "Retention Time (min)", font: { size: 12 } }, gridcolor: "#e5e7eb" },
              plot_bgcolor: "#fff",
              paper_bgcolor: "transparent",
              legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { size: 10 } },
              shapes,
              annotations,
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
