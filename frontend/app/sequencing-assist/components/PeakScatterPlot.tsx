"use client";

import { useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type { TopParallelRow, PeakStatusRow } from "../lib/types";
import type { ScatterPoint, ChainPoint } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const CALL_COLORS: Record<string, string> = {
  "5'": "#0000CC",
  "3'": "#9900CC",
  ambiguous: "#FF8C00",
  conflict: "#CC0000",
};

const CALL_LINE_COLORS: Record<string, string> = {
  "5'": "#2222FF",
  "3'": "#AA44DD",
  ambiguous: "#FFAA33",
  conflict: "#FF3333",
};

function normalizeCall(raw: string | null | undefined): string {
  if (!raw) return "ambiguous";
  const v = String(raw).toLowerCase();
  if (v.includes("5")) return "5'";
  if (v.includes("3")) return "3'";
  if (v.includes("conflict")) return "conflict";
  return "ambiguous";
}

interface Props {
  rawScatter: ScatterPoint[] | null;
  topChains: ChainPoint[] | null;
  topParallel: TopParallelRow[] | null;
  peakStatus: PeakStatusRow[] | null;
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
}

export function PeakScatterPlot({ rawScatter, topChains, topParallel, peakStatus, selectedReadRank, onSelectRead }: Props) {
  const traces = useMemo(() => {
    const result: any[] = [];

    // Background cloud from raw upload (Step 5 visualization)
    // Uses regular scatter (not gl) with open circles for the reference look.
    // For >15k points, uses scattergl with filled markers (WebGL can't render open circles well).
    if (rawScatter && rawScatter.length > 0) {
      const useGl = rawScatter.length > 5000;
      result.push({
        x: rawScatter.map((p) => p.M),
        y: rawScatter.map((p) => p.Rel_I),
        mode: "markers",
        type: useGl ? "scattergl" : "scatter",
        name: "All peaks",
        marker: useGl
          ? { color: "#1B6B7D", size: 3, opacity: 0.5 }
          : { color: "rgba(0,0,0,0)", size: 5, line: { color: "#1B6B7D", width: 1 }, symbol: "circle-open" },
        hoverinfo: "text",
        text: rawScatter.map((p) =>
          `Mass: ${p.M.toFixed(4)}<br>Rel.I: ${p.Rel_I.toFixed(4)}<br>RT: ${p.T.toFixed(4)}<br>Block: ${p.block}`
        ),
      });
    } else if (peakStatus && peakStatus.length > 0) {
      const useGl = peakStatus.length > 5000;
      result.push({
        x: peakStatus.map((p) => p.mass),
        y: peakStatus.map((p) => p.rel_intensity),
        mode: "markers",
        type: useGl ? "scattergl" : "scatter",
        name: "All peaks",
        marker: useGl
          ? { color: "#1B6B7D", size: 3, opacity: 0.5 }
          : { color: "rgba(0,0,0,0)", size: 5, line: { color: "#1B6B7D", width: 1 }, symbol: "circle-open" },
        hoverinfo: "text",
        text: peakStatus.map((p) =>
          `Mass: ${p.mass.toFixed(4)}<br>Rel.I: ${p.rel_intensity.toFixed(4)}<br>RT: ${p.rt.toFixed(4)}<br>Block: ${p.block}<br>Status: ${p.peak_status}`
        ),
      });
    }

    // Top chains by length from pipeline (primary overlay for real data)
    if (topChains && topChains.length > 0) {
      const byChain = new Map<number, ChainPoint[]>();
      for (const p of topChains) {
        const list = byChain.get(p.chain_index) ?? [];
        list.push(p);
        byChain.set(p.chain_index, list);
      }

      const palette = ["#0000CC", "#9900CC", "#008800", "#CC0000", "#FF8C00", "#0088CC", "#CC00CC", "#888800", "#00CCCC", "#CC4400"];
      let colorIdx = 0;
      for (const [chainIdx, points] of byChain) {
        const sorted = points.sort((a, b) => a.mass - b.mass);
        const call = normalizeCall(sorted[0].ladder_type);
        const color = CALL_LINE_COLORS[call] || palette[colorIdx % palette.length];
        const markerColor = CALL_COLORS[call] || palette[colorIdx % palette.length];

        result.push({
          x: sorted.map((p) => p.mass),
          y: sorted.map((p) => p.rel_i),
          mode: "lines+markers",
          type: "scatter",
          name: `#${chainIdx + 1} ${call} (${sorted.length}pt)`,
          line: { color, width: 2 },
          marker: { color: markerColor, size: 6 },
          hoverinfo: "text",
          text: sorted.map((p) =>
            `<b>Chain #${chainIdx + 1} (${call})</b><br>Mass: ${p.mass.toFixed(2)}<br>Rel.I: ${p.rel_i.toFixed(4)}<br>RT: ${p.rt.toFixed(2)}<br>Length: ${p.n_points} pts`
          ),
        });
        colorIdx++;
      }
    }

    // Chain overlays from top_parallel_reads_long (fallback for advanced upload mode)
    if (!topChains && topParallel && topParallel.length > 0) {
      const byRank = new Map<number, TopParallelRow[]>();
      for (const r of topParallel) {
        const list = byRank.get(r.read_rank) ?? [];
        list.push(r);
        byRank.set(r.read_rank, list);
      }

      for (const [rank, rows] of byRank) {
        const sorted = rows.sort((a, b) => a.row_position - b.row_position);
        const call = normalizeCall(sorted[0].ladder_call);
        const isSelected = selectedReadRank === rank;
        const color = CALL_LINE_COLORS[call] || "#999";
        const markerColor = CALL_COLORS[call] || "#999";

        // Connected line + filled markers for this chain
        result.push({
          x: sorted.map((r) => r.mass),
          y: sorted.map((r) => r.rel_i),
          mode: "lines+markers",
          type: "scatter",
          name: `#${rank} ${call}`,
          line: {
            color: color,
            width: isSelected ? 3 : 2,
          },
          marker: {
            color: markerColor,
            size: isSelected ? 8 : 5,
            line: { width: 0 },
          },
          opacity: isSelected ? 1.0 : 0.85,
          customdata: sorted.map(() => rank),
          hoverinfo: "text",
          text: sorted.map((r) =>
            `<b>Read #${rank} (${call})</b><br>Mass: ${r.mass.toFixed(4)}<br>Rel.I: ${r.rel_i.toFixed(4)}<br>RT: ${r.rt.toFixed(4)}<br>Call: ${r.call}<br>Pos: ${r.row_position}/${sorted.length}`
          ),
        });

        // Add a label annotation for the first point of each chain
        // (handled via layout.annotations below)
      }
    }

    return result;
  }, [rawScatter, topChains, topParallel, peakStatus, selectedReadRank]);

  const annotations = useMemo(() => {
    const result: any[] = [];

    // Labels from topChains (primary)
    if (topChains && topChains.length > 0) {
      const byChain = new Map<number, ChainPoint[]>();
      for (const p of topChains) {
        const list = byChain.get(p.chain_index) ?? [];
        list.push(p);
        byChain.set(p.chain_index, list);
      }
      for (const [chainIdx, points] of byChain) {
        const sorted = points.sort((a, b) => a.mass - b.mass);
        const call = normalizeCall(sorted[0].ladder_type);
        const first = sorted[0];
        result.push({
          x: first.mass,
          y: Math.min(first.rel_i + 0.06, 1.15),
          text: `#${chainIdx + 1} ${call}`,
          showarrow: false,
          font: { size: 9, color: CALL_COLORS[call] || "#666" },
          xanchor: "center",
        });
      }
    } else if (topParallel) {
      // Fallback labels from topParallel
      const byRank = new Map<number, TopParallelRow[]>();
      for (const r of topParallel) {
        const list = byRank.get(r.read_rank) ?? [];
        list.push(r);
        byRank.set(r.read_rank, list);
      }
      for (const [rank, rows] of byRank) {
        const sorted = rows.sort((a, b) => a.row_position - b.row_position);
        const call = normalizeCall(sorted[0].ladder_call);
        const first = sorted[0];
        result.push({
          x: first.mass,
          y: Math.min(first.rel_i + 0.06, 1.15),
          text: `#${rank} ${call}`,
          showarrow: false,
          font: { size: 9, color: CALL_COLORS[call] || "#666" },
          xanchor: "center",
        });
      }
    }

    return result;
  }, [topChains, topParallel]);

  const handleClick = useCallback(
    (event: any) => {
      const point = event.points?.[0];
      if (point?.customdata) {
        onSelectRead(point.customdata as number);
      }
    },
    [onSelectRead]
  );

  const hasData = (rawScatter && rawScatter.length > 0) || (topParallel && topParallel.length > 0) || (peakStatus && peakStatus.length > 0);

  return (
    <Card
      title="Relative Intensity vs. Mass"
      subtitle="Block-wise relative intensity (Step 5). Open circles = all data points. Colored lines = candidate short reads from the pipeline. Click a chain to inspect."
    >
      {!hasData ? (
        <EmptyState>Run the pipeline or upload Peak_Status.csv to see the scatter plot.</EmptyState>
      ) : (
        <div className="w-full" style={{ height: 550 }}>
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 70, r: 20, t: 30, b: 60 },
              xaxis: {
                title: { text: "Monoisotopic Mass, M (Da)", font: { size: 13 } },
                gridcolor: "#e5e7eb",
                zeroline: false,
              },
              yaxis: {
                title: { text: "Relative Intensity (linear)", font: { size: 13 } },
                gridcolor: "#e5e7eb",
                zeroline: false,
                range: [-0.02, 1.2],
                dtick: 0.2,
              },
              plot_bgcolor: "#ffffff",
              paper_bgcolor: "transparent",
              legend: {
                orientation: "h" as const,
                y: 1.14,
                x: 0.5,
                xanchor: "center" as const,
                font: { size: 11 },
              },
              annotations: annotations,
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
            onClick={handleClick}
          />
        </div>
      )}
    </Card>
  );
}
