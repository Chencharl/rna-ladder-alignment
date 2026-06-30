"use client";

import dynamic from "next/dynamic";
import type { BaseCallingReport } from "../lib/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export function ReadCallDonut({ report }: { report: BaseCallingReport }) {
  const rc = report.read_call_counts;
  const values = [rc["5prime"] ?? 0, rc["3prime"] ?? 0, rc.ambiguous ?? 0, rc.conflict ?? 0];
  const labels = ["5′", "3′", "Ambiguous", "Conflict"];
  const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

  return (
    <div style={{ height: 220 }}>
      <Plot
        data={[
          {
            values,
            labels,
            type: "pie" as const,
            hole: 0.5,
            marker: { colors },
            textinfo: "label+value" as const,
            textposition: "outside" as const,
            hovertemplate: "%{label}: %{value} reads (%{percent})<extra></extra>",
          },
        ]}
        layout={{
          autosize: true,
          margin: { l: 10, r: 10, t: 10, b: 10 },
          showlegend: false,
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          annotations: [
            {
              text: `${values.reduce((a, b) => a + b, 0)}<br>reads`,
              showarrow: false,
              font: { size: 16, color: "#374151" },
            },
          ],
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export function PeakUsageDonut({ report }: { report: BaseCallingReport }) {
  const ps = report.peak_status_counts;
  const values = [
    ps.primary_used ?? 0,
    ps.ambiguous_retained ?? 0,
    ps.conflict_retained ?? 0,
    ps.reference_reused ?? 0,
    ps.unused ?? 0,
  ];
  const labels = ["Primary", "Ambiguous", "Conflict", "Ref. reused", "Unused"];
  const colors = ["#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#9ca3af"];

  return (
    <div style={{ height: 220 }}>
      <Plot
        data={[
          {
            values,
            labels,
            type: "pie" as const,
            hole: 0.5,
            marker: { colors },
            textinfo: "label+value" as const,
            textposition: "outside" as const,
            hovertemplate: "%{label}: %{value} peaks (%{percent})<extra></extra>",
          },
        ]}
        layout={{
          autosize: true,
          margin: { l: 10, r: 10, t: 10, b: 10 },
          showlegend: false,
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          annotations: [
            {
              text: `${values.reduce((a, b) => a + b, 0)}<br>peaks`,
              showarrow: false,
              font: { size: 16, color: "#374151" },
            },
          ],
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
