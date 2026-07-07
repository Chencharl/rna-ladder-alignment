"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { CoverageBin, CoverageByMassRange, EmpiricalFDR } from "../lib/api";
import { Card, EmptyState } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

function pctColor(pct: number) {
  if (pct >= 80) return "text-green-700 font-semibold";
  if (pct >= 50) return "text-yellow-700 font-semibold";
  if (pct >= 20) return "text-orange-600 font-semibold";
  return "text-red-600 font-semibold";
}

function barColor(pct: number) {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#f59e0b";
  if (pct >= 20) return "#f97316";
  return "#ef4444";
}

export function CoverageByIntensity({
  bins,
  byMassRange,
  fdrEstimate,
}: {
  bins: CoverageBin[] | null;
  byMassRange?: CoverageByMassRange[] | null;
  fdrEstimate?: EmpiricalFDR | null;
}) {
  const [showCounts, setShowCounts] = useState(false);

  if (!bins || bins.length === 0) {
    return (
      <Card
        title="Coverage by Intensity Threshold"
        subtitle="Run the pipeline to see coverage."
      >
        <EmptyState>No coverage data available.</EmptyState>
      </Card>
    );
  }

  // Bins arrive ordered: >10%, >5%, >2%, All peaks.
  // Plotly horizontal bar puts first item at the bottom, so reverse for top-to-bottom.
  const reversed = [...bins].reverse();
  const labels = reversed.map((b) => b.label);
  const values = reversed.map((b) => (showCounts ? b.matched : b.pct));
  const texts = reversed.map((b) =>
    showCounts ? `${b.matched}/${b.total}` : `${b.pct}%`
  );
  const hoverTexts = reversed.map(
    (b) => `${b.label}<br>${b.matched}/${b.total} peaks matched (${b.pct}%)`
  );

  // "All peaks" is the last bin (cumulative – largest set)
  const allBin = bins[bins.length - 1];
  const totalAll = allBin?.total ?? 0;
  const totalMatched = allBin?.matched ?? 0;
  const overallPct = allBin?.pct?.toFixed(1) ?? "—";

  return (
    <Card
      title="Coverage by Intensity Threshold"
      subtitle={`${totalMatched.toLocaleString()}/${totalAll.toLocaleString()} peaks in the 2,000–23,000 Da range explained by candidate reads (${overallPct}% overall). High-intensity peaks (>10% of max) should approach 100% in well-resolved hydrolysis data.`}
    >
      {/* ── Bar chart ── */}
      <div className="flex justify-end mb-2 gap-2">
        <button
          type="button"
          onClick={() => setShowCounts(false)}
          className={`text-xs px-2 py-1 rounded border ${
            !showCounts
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-200"
          }`}
        >
          % matched
        </button>
        <button
          type="button"
          onClick={() => setShowCounts(true)}
          className={`text-xs px-2 py-1 rounded border ${
            showCounts
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-200"
          }`}
        >
          counts
        </button>
      </div>

      <div className="w-full" style={{ height: 220 }}>
        <Plot
          data={[
            {
              y: labels,
              x: values,
              type: "bar",
              orientation: "h",
              marker: { color: reversed.map((b) => barColor(b.pct)) },
              text: texts,
              textposition: "outside",
              hoverinfo: "text",
              hovertext: hoverTexts,
            } as any,
          ]}
          layout={{
            autosize: true,
            margin: { l: 160, r: 70, t: 10, b: showCounts ? 40 : 50 },
            xaxis: {
              title: {
                text: showCounts ? "Matched count" : "Matched (%)",
                font: { size: 11 },
              },
              range: showCounts ? undefined : [0, 115],
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

      {/* ── Mass-range breakdown table ── */}
      {byMassRange && byMassRange.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Coverage by mass range
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200">
                    Mass range
                  </th>
                  {byMassRange[0].thresholds.map((t) => (
                    <th
                      key={t.threshold}
                      className="text-center px-3 py-2 font-medium text-gray-600 border border-gray-200"
                    >
                      {t.threshold}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byMassRange.map((row) => (
                  <tr key={row.mass_range} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-700 border border-gray-200 whitespace-nowrap">
                      {row.mass_range}
                    </td>
                    {row.thresholds.map((t) => (
                      <td
                        key={t.threshold}
                        className={`text-center px-3 py-2 border border-gray-200 ${pctColor(t.pct)}`}
                        title={`${t.matched}/${t.total} peaks`}
                      >
                        {t.total === 0 ? "—" : `${t.pct}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Thresholds relative to the global maximum intensity in the 2,000–23,000 Da range.
            Well-resolved hydrolysis data should show ≥97% in the 5–23 kDa rows at the &gt;10% level.
          </p>
        </div>
      )}

      {/* ── Empirical FDR panel ── */}
      {fdrEstimate && (
        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-800 mb-1">
            Chain-level false-discovery rate estimate
          </p>
          <p className="text-xs text-blue-700 mb-2">
            Random mass-step match rate:{" "}
            <span className="font-mono font-semibold">
              {fdrEstimate.p_step_null_pct.toFixed(2)}%
            </span>{" "}
            ({fdrEstimate.n_pairs_tested.toLocaleString()} peak-pair differences evaluated).
          </p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(fdrEstimate.fdr_by_chain_length_pct).map(([len, fdr]) => (
              <div key={len} className="text-center">
                <div className="text-xs text-blue-500">{len}-nt chain</div>
                <div
                  className={`text-xs font-mono font-semibold ${
                    fdr < 1e-6 ? "text-green-700" : fdr < 0.01 ? "text-yellow-700" : "text-red-600"
                  }`}
                >
                  {fdr < 1e-10 ? "<10⁻¹⁰%" : fdr < 1e-6 ? `${fdr.toExponential(1)}%` : `${fdr.toFixed(4)}%`}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-500 mt-2 italic">
            FDR is the probability a chain of that length arose entirely from random mass coincidence.
            Chains ≥10 positions are statistically robust under these data parameters.
          </p>
        </div>
      )}
    </Card>
  );
}
