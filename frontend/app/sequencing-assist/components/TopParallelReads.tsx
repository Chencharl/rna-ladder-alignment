import { useMemo, useState } from "react";
import type { TopParallelRow } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip, Pagination, PeakStatusChip, fmt } from "./ui";

const PAGE_SIZE = 6;

// ── Client-side mass-difference sequence decoder ──────────────────────────────
// Mirrors _RESIDUE_MASS / _DECODE_TOL in api/sequencing-assist.py exactly.
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
  "Ar(p)": 541.06111, yW: 212.01060, o2yW: 602.13737,
  "mG/Gm": 359.06308, "G'": 346.05740, m22G: 373.07873,
  m22Gm: 387.09438, archaeosine: 386.07398, Q: 471.11551,
  "manQ/galQ": 633.16834,
};
const DECODE_TOL = 0.07;

// Isobaric pairs: mass-indistinguishable modifications at this tolerance
const ISOBARIC_SET = new Set([
  "Um/m1Ψ", "s2U/s4U", "m5C/Cm", "mA/Am", "mG/Gm", "manQ/galQ",
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
  const base =
    "inline-block px-1 py-0.5 rounded text-xs font-mono leading-none mr-0.5 mb-0.5 cursor-default";
  if (step.isUnknown) {
    return (
      <span
        className={`${base} bg-gray-100 text-gray-500 border border-gray-300`}
        title={`Unresolved Δmass = ${step.delta.toFixed(3)} Da`}
      >
        {step.nt}
      </span>
    );
  }
  if (step.isIsobaric) {
    return (
      <span
        className={`${base} bg-amber-100 text-amber-800 border border-amber-300`}
        title={`Isobaric pair — cannot distinguish by mass alone: ${step.nt} (Δ${step.delta.toFixed(3)} Da)`}
      >
        {step.nt}
      </span>
    );
  }
  const canonical = ["A", "U", "G", "C"].includes(step.nt);
  return (
    <span
      className={`${base} ${
        canonical
          ? "bg-blue-50 text-blue-800 border border-blue-200"
          : "bg-purple-50 text-purple-800 border border-purple-200"
      }`}
      title={`${step.nt} — Δmass = ${step.delta.toFixed(3)} Da`}
    >
      {step.nt}
    </span>
  );
}

export function TopParallelReads({
  rows,
  selectedReadRank,
  onSelectRead,
}: {
  rows: TopParallelRow[] | null;
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
}) {
  const [expandedRank, setExpandedRank] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const groups = useMemo(() => {
    if (!rows) return [];
    const byRank = new Map<number, TopParallelRow[]>();
    for (const r of rows) {
      const list = byRank.get(r.read_rank) ?? [];
      list.push(r);
      byRank.set(r.read_rank, list);
    }
    return Array.from(byRank.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rank, rs]) => {
        const sorted = rs.sort((a, b) => a.row_position - b.row_position);
        const masses = sorted.map((r) => r.mass);
        const decoded = decodeFromMasses(masses);
        const nIsobaric = decoded.filter((s) => s.isIsobaric).length;
        const nUnknown = decoded.filter((s) => s.isUnknown).length;
        return { rank, rows: sorted, decoded, nIsobaric, nUnknown };
      });
  }, [rows]);

  const pageCount = Math.ceil(groups.length / PAGE_SIZE);
  const pagedGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card
      title="Candidate Short Reads"
      subtitle={`${groups.length} read${groups.length !== 1 ? "s" : ""} recovered. Decoded sequences from consecutive mass differences — isobaric pairs (amber) need orthogonal validation. Peak tables collapse by default.`}
    >
      {groups.length === 0 ? (
        <EmptyState>Run the analysis pipeline to see candidate short reads.</EmptyState>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pagedGroups.map((g) => {
            const head = g.rows[0];
            const selected = selectedReadRank === g.rank;
            const expanded = expandedRank === g.rank;
            const hasModifications = g.decoded.some((s) => !["A", "U", "G", "C"].includes(s.nt) && !s.isUnknown);

            return (
              <div
                key={g.rank}
                className={`rounded-lg border p-3 transition-all ${
                  selected ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"
                }`}
              >
                {/* ── Header row ── */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-800">Read #{g.rank}</span>
                    <LadderChip call={head.ladder_call} size="sm" />
                    <ConfidenceChip tier={head.confidence_tier} />
                    {hasModifications && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                        modified
                      </span>
                    )}
                    {g.nIsobaric > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200"
                        title={`${g.nIsobaric} position(s) are isobaric pairs — mass alone cannot resolve the modification identity`}
                      >
                        {g.nIsobaric}x isobaric
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectRead(g.rank)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0"
                  >
                    Inspect &rarr;
                  </button>
                </div>

                {head.candidate_partner_rank != null && (
                  <p className="text-xs text-gray-500 mb-2">
                    Candidate partner: Read #{head.candidate_partner_rank}
                  </p>
                )}

                {/* ── Decoded sequence ── */}
                <div className="mb-2">
                  <p className="text-xs text-gray-400 mb-1">Decoded sequence (5′→3′ direction if 5′-call):</p>
                  <div className="flex flex-wrap gap-0">
                    {g.decoded.map((step, i) => (
                      <NtToken key={i} step={step} />
                    ))}
                  </div>
                  {g.nUnknown > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {g.nUnknown} unresolved position{g.nUnknown > 1 ? "s" : ""} — mass delta not in modification dictionary.
                    </p>
                  )}
                </div>

                {/* ── Expand/collapse peak table ── */}
                <button
                  type="button"
                  onClick={() => setExpandedRank(expanded ? null : g.rank)}
                  className="text-xs text-gray-400 hover:text-gray-600 mb-1"
                >
                  {expanded ? "▲ Hide peak table" : "▼ Show peak table"}
                </button>

                {expanded && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 text-left">
                        <th className="py-1 pr-2 font-medium">#</th>
                        <th className="py-1 pr-2 font-medium">Mass</th>
                        <th className="py-1 pr-2 font-medium">Rel.I</th>
                        <th className="py-1 pr-2 font-medium">RT</th>
                        <th className="py-1 pr-2 font-medium">Residue</th>
                        <th className="py-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1 pr-2 text-gray-400">{r.row_position}</td>
                          <td className="py-1 pr-2 tabular-nums">{fmt(r.mass, 2)}</td>
                          <td className="py-1 pr-2 tabular-nums">{fmt(r.rel_i, 3)}</td>
                          <td className="py-1 pr-2 tabular-nums">{fmt(r.rt, 2)}</td>
                          <td className="py-1 pr-2">
                            {i > 0 && g.decoded[i - 1] ? (
                              <NtToken step={g.decoded[i - 1]} />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-1">
                            <PeakStatusChip status={r.peak_status || null} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* ── Evidence / warning ── */}
                {(head.evidence_short || head.warning_short) && (
                  <div className="mt-2 space-y-1">
                    {head.evidence_short && (
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-gray-500">Evidence: </span>
                        {head.evidence_short}
                      </p>
                    )}
                    {head.warning_short && (
                      <p className="text-xs text-amber-600">
                        <span className="font-semibold">Warning: </span>
                        {head.warning_short}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={(p) => { setPage(p); setExpandedRank(null); }} />
        </>
      )}
    </Card>
  );
}
