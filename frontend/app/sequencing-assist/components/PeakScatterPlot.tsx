"use client";

import { useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type { TopParallelRow, PeakStatusRow } from "../lib/types";
import type { ScatterPoint, ChainPoint } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Call-type colours — consistent across scatter and sigmoid
const CALL_COLORS: Record<string, string> = {
  "5'":       "#1a56db",  // strong blue
  "3'":       "#7e3af2",  // purple
  ambiguous:  "#d97706",  // amber
  conflict:   "#c81e1e",  // red
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
  minChainLen?: number;        // passed from pipeline response (min_chain_len_shown)
  nChainsTotal?: number;       // total chains before filter (n_chains_total)
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
}

export function PeakScatterPlot({
  rawScatter,
  topChains,
  topParallel,
  peakStatus,
  minChainLen = 10,
  nChainsTotal,
  selectedReadRank,
  onSelectRead,
}: Props) {

  const traces = useMemo(() => {
    const result: any[] = [];

    // ── Background cloud (Step 5 scatter) ────────────────────────────────
    const bgSource = rawScatter || (peakStatus ? peakStatus.map(p => ({
      M: p.mass, Rel_I: p.rel_intensity, T: p.rt, block: p.block,
    })) : null);

    if (bgSource && bgSource.length > 0) {
      const useGl = bgSource.length > 5000;
      result.push({
        x: bgSource.map((p) => p.M),
        y: bgSource.map((p) => p.Rel_I),
        mode: "markers",
        type: useGl ? "scattergl" : "scatter",
        name: "All peaks",
        legendgroup: "bg",
        marker: useGl
          ? { color: "#1a56db", size: 3, opacity: 0.35 }
          : { color: "rgba(0,0,0,0)", size: 5, line: { color: "#1a56db", width: 0.8 }, symbol: "circle-open" },
        hoverinfo: "text",
        text: bgSource.map((p) =>
          `Mass: ${p.M.toFixed(4)}<br>Rel.I: ${p.Rel_I.toFixed(4)}<br>RT: ${p.T.toFixed(2)}<br>Block: ${p.block}`
        ),
      });
    }

    // ── Chain overlays with GROUPED legend ───────────────────────────────
    const chainsSource = topChains ?? null;

    if (chainsSource && chainsSource.length > 0) {
      const byChain = new Map<number, ChainPoint[]>();
      for (const p of chainsSource) {
        const list = byChain.get(p.chain_index) ?? [];
        list.push(p);
        byChain.set(p.chain_index, list);
      }

      // One invisible dummy trace per call type → single legend entry per type
      const typesPresent = new Set(
        [...byChain.values()].map((pts) => normalizeCall(pts[0]?.ladder_type))
      );
      for (const callType of ["5'", "3'", "ambiguous", "conflict"]) {
        if (!typesPresent.has(callType)) continue;
        result.push({
          x: [], y: [],
          mode: "lines+markers",
          type: "scatter",
          name: callType,
          legendgroup: callType,
          showlegend: true,
          line: { color: CALL_COLORS[callType], width: 2.5 },
          marker: { color: CALL_COLORS[callType], size: 7 },
        });
      }

      for (const [chainIdx, pts] of byChain) {
        const sorted = pts.sort((a, b) => a.mass - b.mass);
        const call = normalizeCall(sorted[0].ladder_type);
        const color = CALL_COLORS[call] ?? "#888";
        const n = sorted[0].n_points;

        result.push({
          x: sorted.map((p) => p.mass),
          y: sorted.map((p) => p.rel_i),
          mode: "lines+markers",
          type: "scatter",
          name: `#${chainIdx + 1} ${call} (${n}nt)`,
          legendgroup: call,
          showlegend: false,           // legend handled by the dummy trace above
          line: { color, width: 2.5 },
          marker: { color, size: 7, line: { color: "#fff", width: 1 } },
          hoverinfo: "text",
          text: sorted.map((p) =>
            `<b>Chain #${chainIdx + 1} · ${call} · ${n} nt</b><br>` +
            `Mass: ${p.mass.toFixed(2)} Da<br>` +
            `Rel.I: ${p.rel_i.toFixed(4)}<br>` +
            `RT: ${p.rt.toFixed(2)} min`
          ),
        });
      }
    } else if (!topChains && topParallel && topParallel.length > 0) {
      // Fallback: advanced-upload mode using top_parallel_reads_long
      const byRank = new Map<number, TopParallelRow[]>();
      for (const r of topParallel) {
        const list = byRank.get(r.read_rank) ?? [];
        list.push(r);
        byRank.set(r.read_rank, list);
      }

      const typesPresent = new Set(
        [...byRank.values()].map((rows) => normalizeCall(rows[0]?.ladder_call))
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

      for (const [rank, rows] of byRank) {
        const sorted = rows.sort((a, b) => a.row_position - b.row_position);
        const call = normalizeCall(sorted[0].ladder_call);
        const isSelected = selectedReadRank === rank;
        const color = CALL_COLORS[call] ?? "#888";
        result.push({
          x: sorted.map((r) => r.mass),
          y: sorted.map((r) => r.rel_i),
          mode: "lines+markers", type: "scatter",
          name: `#${rank} ${call}`, legendgroup: call, showlegend: false,
          line: { color, width: isSelected ? 3.5 : 2.5 },
          marker: { color, size: isSelected ? 9 : 7, line: { color: "#fff", width: 1 } },
          opacity: isSelected ? 1 : 0.85,
          customdata: sorted.map(() => rank),
          hoverinfo: "text",
          text: sorted.map((r) =>
            `<b>Read #${rank} (${call})</b><br>Mass: ${r.mass.toFixed(4)}<br>Rel.I: ${r.rel_i.toFixed(4)}<br>RT: ${r.rt.toFixed(4)}<br>Pos: ${r.row_position}/${sorted.length}`
          ),
        });
      }
    }

    return result;
  }, [rawScatter, topChains, topParallel, peakStatus, selectedReadRank]);

  // Label annotations: one per chain, positioned above the first point
  const annotations = useMemo(() => {
    const out: any[] = [];
    const src = topChains ?? null;
    if (!src) return out;
    const byChain = new Map<number, ChainPoint[]>();
    for (const p of src) {
      const list = byChain.get(p.chain_index) ?? [];
      list.push(p);
      byChain.set(p.chain_index, list);
    }
    for (const [chainIdx, pts] of byChain) {
      const sorted = pts.sort((a, b) => a.mass - b.mass);
      const call = normalizeCall(sorted[0].ladder_type);
      const n = sorted[0].n_points;
      const first = sorted[0];
      out.push({
        x: first.mass,
        y: Math.min(first.rel_i + 0.07, 1.18),
        text: `#${chainIdx + 1} ${call}<br><span style="font-size:8px">${n}nt</span>`,
        showarrow: false,
        font: { size: 9, color: CALL_COLORS[call] ?? "#666" },
        xanchor: "center",
      });
    }
    return out;
  }, [topChains]);

  const handleClick = useCallback(
    (event: any) => {
      const pt = event.points?.[0];
      if (pt?.customdata) onSelectRead(pt.customdata as number);
    },
    [onSelectRead]
  );

  const hasData =
    (rawScatter && rawScatter.length > 0) ||
    (topParallel && topParallel.length > 0) ||
    (peakStatus && peakStatus.length > 0);

  // Dynamic subtitle showing chain quality
  const nShown = topChains
    ? new Set(topChains.map((p) => p.chain_index)).size
    : null;
  const chainNote =
    nShown != null && nChainsTotal != null
      ? nShown > 0
        ? `${nShown} chain${nShown > 1 ? "s" : ""} with ≥${minChainLen} ladder positions shown (${nChainsTotal} total recovered).`
        : `No chains with ≥${minChainLen} ladder positions found — ${nChainsTotal} shorter fragments recovered but not plotted.`
      : "Open circles = all data points. Colored lines = candidate short reads (≥10 ladder positions).";

  return (
    <Card
      title="Relative Intensity vs. Mass"
      subtitle={`Block-wise Rel_I (Step 5). ${chainNote}`}
    >
      {!hasData ? (
        <EmptyState>Upload a deconvoluted Excel file to see the scatter plot.</EmptyState>
      ) : (
        <>
          {nShown === 0 && nChainsTotal != null && nChainsTotal > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {nChainsTotal} chain{nChainsTotal > 1 ? "s" : ""} were recovered but all have fewer than {minChainLen} ladder
              positions — this suggests insufficient signal for confident base-calling. Check data quality or
              try a Charge 2 dataset.
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
                  bordercolor: "#e5e7eb",
                  borderwidth: 1,
                },
                annotations,
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
        </>
      )}
    </Card>
  );
}
