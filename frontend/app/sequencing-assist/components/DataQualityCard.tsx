"use client";

import type { RtQuality, EmpiricalFDR, CoverageBin, TRNARefLibrary } from "../lib/api";

interface Props {
  rtQuality: RtQuality | null;
  fdr: EmpiricalFDR | null;
  coverageBins: CoverageBin[] | null;
  nChainsTotal: number;
  nChainsMin10: number;
  nConflict?: number;
  nAmbiguous?: number;
  tRNARefLibrary?: TRNARefLibrary | null;
}

type QualityLevel = "excellent" | "good" | "marginal" | "poor";

function gradeToLevel(grade: string): QualityLevel {
  if (grade === "excellent") return "excellent";
  if (grade === "good") return "good";
  if (grade === "marginal") return "marginal";
  return "poor";
}

function overallLevel(
  rtLevel: QualityLevel,
  coveragePct: number | null,
  fdrPct: number | null,
): QualityLevel {
  const levels: QualityLevel[] = [rtLevel];
  if (coveragePct != null) {
    if (coveragePct >= 80) levels.push("excellent");
    else if (coveragePct >= 60) levels.push("good");
    else if (coveragePct >= 30) levels.push("marginal");
    else levels.push("poor");
  }
  if (fdrPct != null) {
    if (fdrPct < 0.001) levels.push("excellent");
    else if (fdrPct < 0.1) levels.push("good");
    else if (fdrPct < 5) levels.push("marginal");
    else levels.push("poor");
  }
  const rank: Record<QualityLevel, number> = { excellent: 0, good: 1, marginal: 2, poor: 3 };
  return levels.sort((a, b) => rank[b] - rank[a])[0];
}

const LEVEL_STYLE: Record<QualityLevel, { border: string; bg: string; badge: string; dot: string; text: string; label: string }> = {
  excellent: {
    border: "border-green-200", bg: "bg-green-50",
    badge: "bg-green-100 border-green-300 text-green-800",
    dot: "bg-green-500", text: "text-green-800",
    label: "Excellent — suitable for high-confidence sequencing",
  },
  good: {
    border: "border-blue-200", bg: "bg-blue-50",
    badge: "bg-blue-100 border-blue-300 text-blue-800",
    dot: "bg-blue-500", text: "text-blue-800",
    label: "Good — suitable for routine sequencing analysis",
  },
  marginal: {
    border: "border-amber-200", bg: "bg-amber-50",
    badge: "bg-amber-100 border-amber-300 text-amber-800",
    dot: "bg-amber-500", text: "text-amber-800",
    label: "Marginal — proceed with caution; review RT plot and coverage",
  },
  poor: {
    border: "border-red-200", bg: "bg-red-50",
    badge: "bg-red-100 border-red-300 text-red-800",
    dot: "bg-red-400", text: "text-red-800",
    label: "Poor — data quality may not support reliable sequencing",
  },
};

interface MetricRowProps {
  label: string;
  value: string;
  note?: string;
  level?: QualityLevel;
}

function MetricRow({ label, value, note, level }: MetricRowProps) {
  const dotCls = level ? `inline-block w-2 h-2 rounded-full mr-1.5 shrink-0 ${LEVEL_STYLE[level].dot}` : "hidden";
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 flex items-center">
        <span className={dotCls} />
        {label}
      </span>
      <span className="text-xs font-medium text-right text-gray-800 shrink-0">
        {value}
        {note && <span className="text-gray-400 font-normal ml-1.5">{note}</span>}
      </span>
    </div>
  );
}

export function DataQualityCard({ rtQuality, fdr, coverageBins, nChainsTotal, nChainsMin10, nConflict, nAmbiguous, tRNARefLibrary }: Props) {
  const rtLevel: QualityLevel = rtQuality ? gradeToLevel(rtQuality.grade) : "poor";
  const topBin = coverageBins?.find(b => b.label.includes(">10%"));
  const coveragePct = topBin ? topBin.pct : null;
  const fdrAt10 = fdr?.fdr_by_chain_length_pct?.["10"] ?? null;
  const overall = overallLevel(rtLevel, coveragePct, fdrAt10);
  const style = LEVEL_STYLE[overall];

  const refMatchPct = tRNARefLibrary?.loaded ? tRNARefLibrary.match_pct : null;
  const isBulkLikely = refMatchPct != null && refMatchPct > 5 && refMatchPct < 60;

  const issues: string[] = [];
  if (rtQuality && (rtQuality.grade === "marginal" || rtQuality.grade === "flat/poor")) {
    issues.push("RT trend is weak — chains may reflect incomplete separation rather than true ladder structure.");
  }
  if (coveragePct != null && coveragePct < 50) {
    issues.push(`Only ${coveragePct}% of high-signal peaks matched — consider lowering Min Read Length or checking for co-eluting contaminants.`);
  }
  if (nConflict != null && nConflict > 0 && nChainsMin10 > 0 && nConflict / nChainsMin10 > 0.5) {
    issues.push("More than half of reads are unclassified (conflict/ambiguous). Charge 2 data and/or shorter analysis window may improve classification.");
  }
  if (isBulkLikely) {
    issues.push(
      `${refMatchPct}% of peaks match the 46-family tRNA reference library — consistent with a multi-species mixture. ` +
      "De-novo reads from bulk data may contain cross-species connections; interpret chains with caution and cross-reference against the reference library."
    );
  }

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
        <p className={`text-sm font-semibold ${style.text}`}>Data Quality Assessment</p>
        <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full border ${style.badge}`}>
          {overall.charAt(0).toUpperCase() + overall.slice(1)}
        </span>
      </div>

      <p className={`text-xs ${style.text} mb-3 leading-relaxed`}>{style.label}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        {/* RT quality */}
        <MetricRow
          label="RT separation quality"
          value={rtQuality ? `${rtQuality.grade} (R² = ${rtQuality.r2.toFixed(3)})` : "—"}
          note={rtQuality ? `slope = ${rtQuality.slope > 0 ? "+" : ""}${rtQuality.slope.toFixed(2)} min/log-Da` : undefined}
          level={rtLevel}
        />

        {/* Coverage */}
        <MetricRow
          label="Coverage at >10% signal"
          value={coveragePct != null ? `${coveragePct}%` : "—"}
          note={topBin ? `(${topBin.matched} / ${topBin.total} peaks)` : undefined}
          level={coveragePct != null ? (coveragePct >= 80 ? "excellent" : coveragePct >= 60 ? "good" : coveragePct >= 30 ? "marginal" : "poor") : undefined}
        />

        {/* FDR */}
        <MetricRow
          label="Empirical FDR (length-10 chains)"
          value={fdrAt10 != null ? `${fdrAt10 < 0.0001 ? "<0.0001" : fdrAt10.toFixed(4)}%` : "—"}
          note={fdrAt10 != null && fdrAt10 < 0.001 ? "virtually zero" : undefined}
          level={fdrAt10 != null ? (fdrAt10 < 0.001 ? "excellent" : fdrAt10 < 0.1 ? "good" : fdrAt10 < 5 ? "marginal" : "poor") : undefined}
        />

        {/* Reads recovered */}
        <MetricRow
          label="Reads ≥10 positions"
          value={`${nChainsMin10} of ${nChainsTotal} total`}
          note={nChainsMin10 === 0 ? "try lowering min read length" : undefined}
          level={nChainsMin10 >= 5 ? "excellent" : nChainsMin10 >= 2 ? "good" : nChainsMin10 >= 1 ? "marginal" : "poor"}
        />

        {/* tRNA reference library match */}
        {tRNARefLibrary?.loaded && (
          <MetricRow
            label="tRNA reference library match"
            value={`${tRNARefLibrary.match_pct}%`}
            note={`(${tRNARefLibrary.n_peaks_matched} / ${tRNARefLibrary.n_peaks_total} peaks)`}
            level={
              tRNARefLibrary.match_pct >= 60 ? "excellent" :
              tRNARefLibrary.match_pct >= 30 ? "good" :
              tRNARefLibrary.match_pct >= 10 ? "marginal" : "poor"
            }
          />
        )}
      </div>

      {issues.length > 0 && (
        <div className="mt-3 border-t border-amber-200 pt-2.5 space-y-1">
          {issues.map((issue, i) => (
            <p key={i} className="text-xs text-amber-800 flex gap-1.5">
              <span className="shrink-0">⚠</span>
              <span>{issue}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
