"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { ScatterPoint } from "../lib/api";
import { Card } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  label1: string;
  label2: string;
  scatter1: ScatterPoint[];
  scatter2: ScatterPoint[];
}

export function ComparePlot({ label1, label2, scatter1, scatter2 }: Props) {
  // Find peaks shared between samples: mass within 0.05 Da tolerance
  const { only1, only2, shared } = useMemo(() => {
    const masses2 = scatter2.map((p) => p.M);
    const TOL = 0.05;
    const only1: ScatterPoint[] = [];
    const shared: ScatterPoint[] = [];
    for (const p of scatter1) {
      const match = masses2.some((m) => Math.abs(m - p.M) < TOL);
      (match ? shared : only1).push(p);
    }
    const masses1 = scatter1.map((p) => p.M);
    const only2 = scatter2.filter((p) => !masses1.some((m) => Math.abs(m - p.M) < TOL));
    return { only1, only2, shared };
  }, [scatter1, scatter2]);

  return (
    <Card
      title="Sample Comparison — Relative Intensity vs. Mass"
      subtitle={`Blue = ${label1} only (${only1.length} unique). Red = ${label2} only (${only2.length} unique). Green = shared (${shared.length} peaks within 0.05 Da).`}
    >
      <div className="w-full" style={{ height: 480 }}>
        <Plot
          data={[
            {
              x: shared.map((p) => p.M),
              y: shared.map((p) => p.Rel_I),
              mode: "markers",
              type: "scattergl",
              name: `Shared (${shared.length})`,
              marker: { color: "#22c55e", size: 4, opacity: 0.55 },
              hoverinfo: "text",
              text: shared.map((p) => `M: ${p.M.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`),
            },
            {
              x: only1.map((p) => p.M),
              y: only1.map((p) => p.Rel_I),
              mode: "markers",
              type: "scattergl",
              name: `${label1} only (${only1.length})`,
              marker: { color: "#3b82f6", size: 4, opacity: 0.55 },
              hoverinfo: "text",
              text: only1.map((p) => `M: ${p.M.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`),
            },
            {
              x: only2.map((p) => p.M),
              y: only2.map((p) => p.Rel_I),
              mode: "markers",
              type: "scattergl",
              name: `${label2} only (${only2.length})`,
              marker: { color: "#ef4444", size: 4, opacity: 0.55 },
              hoverinfo: "text",
              text: only2.map((p) => `M: ${p.M.toFixed(2)}<br>Rel.I: ${p.Rel_I.toFixed(4)}`),
            },
          ] as any[]}
          layout={{
            autosize: true,
            margin: { l: 60, r: 20, t: 20, b: 55 },
            xaxis: { title: { text: "Monoisotopic Mass, M (Da)", font: { size: 12 } }, gridcolor: "#e5e7eb" },
            yaxis: { title: { text: "Relative Intensity (linear)", font: { size: 12 } }, gridcolor: "#e5e7eb", range: [-0.02, 1.15] },
            plot_bgcolor: "#fff",
            paper_bgcolor: "transparent",
            legend: { orientation: "h", y: 1.1, x: 0.5, xanchor: "center", font: { size: 11 } },
            hovermode: "closest",
            dragmode: "zoom",
          }}
          config={{ responsive: true, displayModeBar: true, displaylogo: false }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </Card>
  );
}
