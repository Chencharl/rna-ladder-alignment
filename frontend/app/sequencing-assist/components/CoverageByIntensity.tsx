"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { CoverageBin } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export function CoverageByIntensity({ bins }: { bins: CoverageBin[] | null }) {
  const [showCounts, setShowCounts] = useState(false);

  if (!bins || bins.length === 0) {
    return (
      <Card title="Coverage by Intensity" subtitle="Run the pipeline to see intensity-percentile coverage.">
        <EmptyState>No coverage data available.</EmptyState>
      </Card>
    );
  }

  // Reverse so highest intensity (top 0-2%) is at top of horizontal bar chart
  const reversed = [...bins].reverse();
  const labels = reversed.map((b) => b.label);
  const values = reversed.map((b) => showCounts ? b.matched : b.pct);
  const texts = reversed.map((b) => showCounts ? `${b.matched}/${b.total}` : `${b.pct}%`);
  const hoverTexts = reversed.map((b) => `${b.label}<br>${b.matched}/${b.total} peaks matched (${b.pct}%)`);

  const totalAll = bins.reduce((s, b) => s + b.total, 0);
  const totalMatched = bins.reduce((s, b) => s + b.matched, 0);
  const overallPct = totalAll > 0 ? ((totalMatched / totalAll) * 100).toFixed(1) : "—";

  return (
    <Card
      title="Coverage by Intensity Percentile"
      subtitle={`${totalMatched.toLocaleString()}/${totalAll.toLocaleString()} peaks explained by candidate short reads (${overallPct}% overall). High-intensity peaks should have higher coverage — low top-bin coverage suggests unsequenced isoforms or partial modifications.`}
    >
      <div className="flex justify-end mb-2 gap-2">
        <button
          type="button"
          onClick={() => setShowCounts(false)}
          className={`text-xs px-2 py-1 rounded border ${!showCounts ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}
        >
          % matched
        </button>
        <button
          type="button"
          onClick={() => setShowCounts(true)}
          className={`text-xs px-2 py-1 rounded border ${showCounts ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}
        >
          counts
        </button>
      </div>

      <div className="w-full" style={{ height: 300 }}>
        <Plot
          data={[
            {
              y: labels,
              x: values,
              type: "bar",
              orientation: "h",
              marker: {
                color: reversed.map((b) =>
                  b.pct >= 80 ? "#22c55e" : b.pct >= 50 ? "#f59e0b" : b.pct >= 20 ? "#f97316" : "#ef4444"
                ),
              },
              text: texts,
              textposition: "outside",
              hoverinfo: "text",
              hovertext: hoverTexts,
            } as any,
          ]}
          layout={{
            autosize: true,
            margin: { l: 110, r: 60, t: 10, b: showCounts ? 40 : 50 },
            xaxis: {
              title: { text: showCounts ? "Matched count" : "Matched (%)", font: { size: 11 } },
              range: showCounts ? undefined : [0, 108],
              gridcolor: "#e5e7eb",
            },
            yaxis: { tickfont: { size: 11 } },
            plot_bgcolor: "#fff",
            paper_bgcolor: "transparent",
          }}
          config={{ responsive: true, displayModeBar: false }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </Card>
  );
}
