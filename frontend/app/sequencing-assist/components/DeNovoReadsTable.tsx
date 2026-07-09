"use client";

import { useMemo, useState } from "react";
import type { TopParallelRow, DecisionRow, RefComparison } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip, PeakStatusChip, Pagination, fmt } from "./ui";

// ── Residue mass dictionary (mirrors api/sequencing-assist.py _RESIDUE_MASS) ─

const RESIDUE_MASSES: Record<string, number> = {
  A: 329.05252, U: 306.02530, G: 345.04743, C: 305.04129,
  D: 308.04095, "Um/m1Ψ": 320.04095, "s2U/s4U": 322.00246,
  mo5U: 336.03587, m5s2U: 336.01811, m5Um: 334.05660,
  mnm5U: 349.06750, ncm5U: 363.04677, mnm5s2U: 365.04466,
  mcm5U: 378.04643, cmo5U: 380.02570, cmnm5U: 393.05733,
  mcm5s2U: 394.02359, mchm5U: 394.04135, ncm5Um: 377.06242,
  acp3U: 407.07298, "cmnm5s2U": 409.03449, tm5U: 443.04000,
  tm5s2U: 459.01710, s2C: 321.01844, "m5C/Cm": 319.05694,
  ac4C: 347.05185, f5C: 333.03620, k2C: 433.13625,
  I: 330.03654, m1I: 344.05200, "mA/Am": 343.06817,
  i6A: 397.11512, io6A: 413.11003, ms2i6A: 443.10284,
  t6A: 474.09003, m6t6A: 488.10568, ms2t6A: 520.07775,
  "Ar(p)": 541.06111, yW: 469.09866, o2yW: 485.09395,
  "mG/Gm": 359.06308, "G'": 346.05740, m22G: 373.07873,
  m22Gm: 387.09438, archaeosine: 386.07398, Q: 471.11551,
  "manQ/galQ": 633.16834,
};
const DECODE_TOL = 0.07;
const CANONICAL = new Set(["A", "U", "G", "C"]);
const ISOBARIC_SET = new Set([
  "Um/m1Ψ", "s2U/s4U", "m5C/Cm", "mA/Am", "mG/Gm", "manQ/galQ",
  "mo5U", "m5s2U", "mcm5s2U", "mchm5U",
]);

interface DecodedStep {
  nt: string;
  delta: number;
  isIsobaric: boolean;
  isUnknown: boolean;
}

function decodeFromMasses(masses: number[]): DecodedStep[] {
  const sorted = [...masses].sort((a, b) => a - b);
  const steps: DecodedStep[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i] - sorted[i - 1];
    let bestNt = "";
    let bestDiff = DECODE_TOL;
    for (const [nt, m] of Object.entries(RESIDUE_MASSES)) {
      const d = Math.abs(delta - m);
      if (d < bestDiff) { bestDiff = d; bestNt = nt; }
    }
    steps.push({
      nt: bestNt || `?${delta.toFixed(0)}`,
      delta,
      isIsobaric: ISOBARIC_SET.has(bestNt),
      isUnknown: !bestNt,
    });
  }
  return steps;
}

function NtToken({ step }: { step: DecodedStep }) {
  const base = "inline-block px-1 py-0.5 rounded text-xs font-mono leading-none mr-0.5 mb-0.5 cursor-default";
  if (step.isUnknown) {
    return (
      <span className={`${base} bg-gray-100 text-gray-500 border border-gray-300`}
        title={`Unresolved Δmass = ${step.delta.toFixed(3)} Da — not in modification dictionary`}>
        {step.nt}
      </span>
    );
  }
  if (step.isIsobaric) {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 border border-amber-300`}
        title={`Isobaric pair — cannot distinguish by mass alone: ${step.nt} (Δ${step.delta.toFixed(3)} Da). Orthogonal validation required.`}>
        {step.nt}
      </span>
    );
  }
  const isCanonical = CANONICAL.has(step.nt);
  return (
    <span className={`${base} ${isCanonical ? "bg-blue-50 text-blue-800 border border-blue-200" : "bg-purple-50 text-purple-800 border border-purple-200"}`}
      title={`${step.nt} — Δmass = ${step.delta.toFixed(4)} Da`}>
      {step.nt}
    </span>
  );
}

// ── Evidence panel (expanded row) ─────────────────────────────────────────────

function EvidencePanel({
  rank,
  rows,
  decoded,
  decision,
  refComparison,
}: {
  rank: number;
  rows: TopParallelRow[];
  decoded: DecodedStep[];
  decision: DecisionRow | null;
  refComparison: RefComparison | null;
}) {
  const sorted = [...rows].sort((a, b) => a.mass - b.mass);
  const masses = sorted.map((r) => r.mass);
  const nIsobaric = decoded.filter((s) => s.isIsobaric).length;
  const nUnknown = decoded.filter((s) => s.isUnknown).length;
  const ladderCall = rows[0]?.ladder_call ?? "";
  const directionNote =
    ladderCall === "5'"
      ? "5′→3′ direction"
      : ladderCall === "3'"
      ? "3′→5′ direction (read right-to-left for canonical 5′→3′)"
      : "";

  return (
    <div className="bg-slate-50 border-t border-blue-100 px-5 py-4 space-y-5">

      {/* Decoded sequence */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">
          Decoded sequence — {decoded.length} step{decoded.length !== 1 ? "s" : ""}
          {directionNote && <span className="font-normal text-gray-400 ml-1">({directionNote})</span>}
        </p>
        <div className="flex flex-wrap">
          {decoded.map((step, i) => <NtToken key={i} step={step} />)}
        </div>
        {nIsobaric > 0 && (
          <p className="text-xs text-amber-600 mt-1.5">
            {nIsobaric} amber position{nIsobaric > 1 ? "s are" : " is"} an isobaric pair — mass spectrometry alone cannot resolve the modification identity. Requires orthogonal validation (e.g., MS/MS fragmentation or metabolic labeling).
          </p>
        )}
        {nUnknown > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            {nUnknown} gray position{nUnknown > 1 ? "s have" : " has"} an unresolved mass difference — not in the current modification dictionary. May indicate a novel modification, adduct, or chain artifact.
          </p>
        )}
      </div>

      {/* Peak-level evidence table */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">
          Peak-level evidence ({rows.length} mass points · {masses[0]?.toFixed(0)}–{masses[masses.length - 1]?.toFixed(0)} Da)
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-xs min-w-[560px]">
            <thead className="bg-white">
              <tr className="text-gray-400 text-left">
                <th className="py-1.5 px-2 font-medium">#</th>
                <th className="py-1.5 px-2 font-medium">Mass (Da)</th>
                <th className="py-1.5 px-2 font-medium">ΔMass (Da)</th>
                <th className="py-1.5 px-2 font-medium">Residue</th>
                <th className="py-1.5 px-2 font-medium text-right">Rel.I (%)</th>
                <th className="py-1.5 px-2 font-medium text-right">RT (min)</th>
                <th className="py-1.5 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {sorted.map((r, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1 px-2 text-gray-400 tabular-nums">{r.row_position}</td>
                  <td className="py-1 px-2 tabular-nums font-mono">{r.mass.toFixed(2)}</td>
                  <td className="py-1 px-2 tabular-nums text-gray-400">
                    {i > 0 && decoded[i - 1]
                      ? <span title={`Δmass = ${decoded[i - 1].delta.toFixed(5)} Da`}>{decoded[i - 1].delta.toFixed(3)}</span>
                      : <span className="text-gray-300">seed</span>}
                  </td>
                  <td className="py-1 px-2">
                    {i > 0 && decoded[i - 1]
                      ? <NtToken step={decoded[i - 1]} />
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="py-1 px-2 tabular-nums text-right">{(r.rel_i * 100).toFixed(1)}</td>
                  <td className="py-1 px-2 tabular-nums text-right">{fmt(r.rt, 2)}</td>
                  <td className="py-1 px-2">
                    <PeakStatusChip status={r.peak_status || null} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Classification evidence + warnings */}
      {(decision?.evidence_short || rows[0]?.evidence_short || decision?.warning_short || rows[0]?.warning_short) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(decision?.evidence_short || rows[0]?.evidence_short) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Classification evidence</p>
              <p className="text-xs text-gray-600">{decision?.evidence_short || rows[0]?.evidence_short}</p>
            </div>
          )}
          {(decision?.warning_short || rows[0]?.warning_short) && (
            <div>
              <p className="text-xs font-semibold text-amber-600 mb-1">Warnings</p>
              <p className="text-xs text-amber-700">{decision?.warning_short || rows[0]?.warning_short}</p>
            </div>
          )}
        </div>
      )}
      {decision?.suggested_action && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Suggested action</p>
          <p className="text-xs text-gray-600">{decision.suggested_action}</p>
        </div>
      )}

      {/* Reference sequence comparison */}
      {refComparison && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">
            Reference comparison — identity {(refComparison.identity * 100).toFixed(1)}%
            {refComparison.orientation_corrected && (
              <span className="font-normal text-gray-400 ml-1">(3′ chain reversed to 5′→3′ before alignment)</span>
            )}
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white px-3 py-2">
            <p className="text-xs text-gray-400 mb-1">Read →</p>
            <div className="flex flex-wrap gap-0.5 font-mono text-xs mb-1">
              {refComparison.aligned_read.map((nt, i) => {
                const ref = refComparison.aligned_reference[i];
                const mm = nt !== ref;
                return (
                  <span key={i}
                    className={`px-0.5 rounded ${mm ? "bg-red-100 text-red-700 font-bold" : "text-gray-500"}`}
                    title={mm ? `Position ${i + 1}: read "${nt}" vs reference "${ref}"` : undefined}>
                    {nt}
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mb-1">Reference →</p>
            <div className="flex flex-wrap gap-0.5 font-mono text-xs text-blue-600/60">
              {refComparison.aligned_reference.map((nt, i) => (
                <span key={i} className="px-0.5">{nt}</span>
              ))}
            </div>
            {refComparison.mismatches.length > 0 && (
              <p className="text-xs text-red-600 mt-2">
                {refComparison.mismatches.length} mismatch{refComparison.mismatches.length > 1 ? "es" : ""} at position{refComparison.mismatches.length > 1 ? "s" : ""}{" "}
                {refComparison.mismatches.map((m) => m.position + 1).join(", ")} — possible modifications or sequencing artefacts.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main De Novo Reads Table ──────────────────────────────────────────────────

const PAGE_SIZE = 15;

interface TableGroup {
  rank: number;
  rows: TopParallelRow[];
  decoded: DecodedStep[];
  decision: DecisionRow | null;
  meanRelI: number;
  nIsobaric: number;
  nUnknown: number;
  hasModifications: boolean;
  callString: string;
  head: TopParallelRow | undefined;
  massMin: number;
  massMax: number;
  readLength: number;
  ntLength: number;
}

interface DecisionOnlyRow {
  rank: number;
  decision: DecisionRow;
}

export function DeNovoReadsTable({
  rows,
  decisions,
  nChainsTotal,
  minChainLen,
  selectedReadRank,
  onSelectRead,
  refComparisons,
}: {
  rows: TopParallelRow[] | null;
  decisions: DecisionRow[] | null;
  nChainsTotal: number;
  minChainLen: number;
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
  refComparisons: Record<string, RefComparison> | null;
}) {
  const [expandedRank, setExpandedRank] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Precompute decision lookup
  const decisionMap = useMemo(() => {
    const m = new Map<number, DecisionRow>();
    for (const d of decisions ?? []) m.set(d.read_rank, d);
    return m;
  }, [decisions]);

  // Precompute topParallel groups (for detail view)
  const detailMap = useMemo(() => {
    const m = new Map<number, TableGroup>();
    if (!rows) return m;
    const byRank = new Map<number, TopParallelRow[]>();
    for (const r of rows) {
      const list = byRank.get(r.read_rank) ?? [];
      list.push(r);
      byRank.set(r.read_rank, list);
    }
    for (const [rank, rs] of byRank) {
      const sorted = rs.sort((a, b) => a.mass - b.mass);
      const masses = sorted.map((r) => r.mass);
      const decoded = decodeFromMasses(masses);
      const decision = decisionMap.get(rank) ?? null;
      const meanRelI = rs.reduce((s, r) => s + r.rel_i, 0) / rs.length;
      const nIsobaric = decoded.filter((s) => s.isIsobaric).length;
      const nUnknown = decoded.filter((s) => s.isUnknown).length;
      const hasModifications = decoded.some((s) => !CANONICAL.has(s.nt) && !s.isUnknown);
      const callString = decoded.map((s) => (s.isUnknown ? "?" : s.nt)).join("");
      m.set(rank, {
        rank, rows: sorted, decoded, decision, meanRelI,
        nIsobaric, nUnknown, hasModifications, callString,
        head: sorted[0],
        massMin: masses[0] ?? 0,
        massMax: masses[masses.length - 1] ?? 0,
        readLength: sorted.length,
        ntLength: decoded.length,
      });
    }
    return m;
  }, [rows, decisionMap]);

  // Build unified row list: decisions (all) + detailMap (extra detail)
  // Prefer decisions-sourced rows when available (covers all filtered reads).
  // Fall back to detailMap entries not in decisions.
  const allRows: (TableGroup | DecisionOnlyRow)[] = useMemo(() => {
    const ranksFromDecisions = new Set<number>();
    const result: (TableGroup | DecisionOnlyRow)[] = [];

    if (decisions && decisions.length > 0) {
      for (const d of decisions) {
        ranksFromDecisions.add(d.read_rank);
        const detail = detailMap.get(d.read_rank);
        if (detail) {
          result.push({ ...detail, decision: d });
        } else {
          result.push({ rank: d.read_rank, decision: d } as DecisionOnlyRow);
        }
      }
    }

    // Include any detailMap entries not already covered by decisions
    for (const [rank, group] of detailMap) {
      if (!ranksFromDecisions.has(rank)) {
        result.push(group);
      }
    }

    return result.sort((a, b) => a.rank - b.rank);
  }, [decisions, detailMap]);

  const pageCount = Math.ceil(allRows.length / PAGE_SIZE);
  const pagedRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleExpand(rank: number) {
    const next = expandedRank === rank ? null : rank;
    setExpandedRank(next);
    onSelectRead(rank);
  }

  function isTableGroup(r: TableGroup | DecisionOnlyRow): r is TableGroup {
    return "rows" in r;
  }

  const nShown = allRows.length;

  return (
    <Card
      title="De Novo Candidate Reads"
      subtitle={
        nChainsTotal > nShown
          ? `${nChainsTotal.toLocaleString()} total reads recovered; ${nShown} passed the ≥${minChainLen} nt filter. Orientation labels (5′/3′/ambiguous/conflict) reflect algorithmic scoring — not confirmed sequence identities. All require experimental validation.`
          : `${nShown} candidate read${nShown !== 1 ? "s" : ""} passed the ≥${minChainLen} nt filter. Orientation labels (5′/3′/ambiguous/conflict) reflect algorithmic scoring — not confirmed sequence identities.`
      }
    >
      {allRows.length === 0 ? (
        <EmptyState>
          {nChainsTotal > 0
            ? `${nChainsTotal.toLocaleString()} candidate reads recovered, but all are shorter than the current ≥${minChainLen} nt filter. Lower "Min read length" in parameters and re-run to see shorter reads.`
            : "Run the analysis pipeline to see de novo candidate reads."}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-xs text-gray-400 text-left border-b border-gray-100">
                  <th className="py-2 px-2 font-medium w-8">#</th>
                  <th className="py-2 px-2 font-medium">Orientation</th>
                  <th className="py-2 px-2 font-medium">Confidence</th>
                  <th className="py-2 px-2 font-medium text-right">Peaks</th>
                  <th className="py-2 px-2 font-medium text-right">NT decoded</th>
                  <th className="py-2 px-2 font-medium text-right">Avg Rel.I</th>
                  <th className="py-2 px-2 font-medium">Mass range</th>
                  <th className="py-2 px-2 font-medium">Decoded call</th>
                  <th className="py-2 px-2 font-medium">Warning</th>
                  <th className="py-2 px-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.flatMap((r) => {
                  const isGroup = isTableGroup(r);
                  const dec = isGroup ? r.decision : r.decision;
                  const expanded = expandedRank === r.rank;
                  const selected = selectedReadRank === r.rank;

                  const ladderCall = isGroup ? r.head?.ladder_call : dec?.ladder_call;
                  const confidenceTier = isGroup ? r.head?.confidence_tier : dec?.confidence_tier;
                  const peaks = isGroup ? r.readLength : dec?.read_length ?? 0;
                  const ntDecoded = isGroup ? r.ntLength : (dec?.read_length ? dec.read_length - 1 : 0);
                  const meanRelI = isGroup ? r.meanRelI : dec?.mean_rel_i ?? 0;
                  const callString = isGroup ? r.callString : null;
                  const massRange = isGroup ? `${r.massMin.toFixed(0)}–${r.massMax.toFixed(0)} Da` : "—";
                  const warning = isGroup ? r.head?.warning_short : dec?.warning_short;
                  const hasModifications = isGroup ? r.hasModifications : false;
                  const nIsobaric = isGroup ? r.nIsobaric : 0;

                  const rowEl = (
                    <tr
                      key={r.rank}
                      className={`border-b border-gray-50 transition-colors ${
                        selected ? "bg-blue-50/40" : "hover:bg-gray-50/50"
                      }`}
                    >
                      <td className="py-2 px-2 text-gray-400 text-xs tabular-nums">{r.rank}</td>
                      <td className="py-2 px-2">
                        <LadderChip call={ladderCall} size="sm" />
                      </td>
                      <td className="py-2 px-2">
                        <ConfidenceChip tier={confidenceTier} />
                      </td>
                      <td className="py-2 px-2 tabular-nums text-right text-xs">{peaks}</td>
                      <td className="py-2 px-2 tabular-nums text-right text-xs">{ntDecoded}</td>
                      <td className="py-2 px-2 tabular-nums text-right text-xs">
                        {meanRelI > 0 ? `${(meanRelI * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500 tabular-nums whitespace-nowrap">{massRange}</td>
                      <td className="py-2 px-2">
                        {callString != null ? (
                          <span
                            className="font-mono text-xs text-gray-600 truncate block max-w-[160px]"
                            title={callString}
                          >
                            {callString.length > 18 ? callString.slice(0, 16) + "…" : callString}
                            {hasModifications && (
                              <span className="ml-1 text-purple-500" title="Contains modified nucleotides">✦</span>
                            )}
                            {nIsobaric > 0 && (
                              <span className="ml-0.5 text-amber-500" title={`${nIsobaric} isobaric position(s)`}>⚠</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs max-w-[160px]">
                        {warning ? (
                          <span className="text-amber-600 truncate block" title={warning}>
                            {warning.length > 40 ? warning.slice(0, 38) + "…" : warning}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isGroup ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(r.rank)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${
                              expanded
                                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {expanded ? "▲ Hide" : "Inspect ▼"}
                          </button>
                        ) : (
                          <span
                            className="text-xs text-gray-300"
                            title="Increase 'Top reads in plots' to load peak detail for this read"
                          >
                            not in top-N
                          </span>
                        )}
                      </td>
                    </tr>
                  );

                  const evidenceEl =
                    expanded && isGroup ? (
                      <tr key={`${r.rank}-ev`}>
                        <td colSpan={10} className="p-0">
                          <EvidencePanel
                            rank={r.rank}
                            rows={r.rows}
                            decoded={r.decoded}
                            decision={r.decision}
                            refComparison={refComparisons?.[String(r.rank)] ?? null}
                          />
                        </td>
                      </tr>
                    ) : null;

                  return evidenceEl ? [rowEl, evidenceEl] : [rowEl];
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            onChange={(p) => { setPage(p); setExpandedRank(null); }}
          />

          {nChainsTotal > nShown && (
            <p className="text-xs text-gray-400 mt-2">
              {(nChainsTotal - nShown).toLocaleString()} additional reads are below the ≥{minChainLen} nt filter.
              Lower "Min read length" and re-run to include them.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
