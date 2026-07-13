"use client";

import { useMemo } from "react";
import type { TopParallelRow } from "../lib/types";
import { Card, EmptyState } from "./ui";

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

interface ModCandidate {
  readRank: number;
  ladderCall: string;
  position: number;
  massBefore: number;
  massAfter: number;
  deltaMass: number;
  candidateMod: string;
  isIsobaric: boolean;
  isUnknown: boolean;
  massErrorMda: number;
  meanRelI: number;
  requiresManualReview: boolean;
}

function confidenceLabel(errorMda: number, isIsobaric: boolean, isUnknown: boolean): { label: string; cls: string } {
  if (isUnknown) return { label: "unresolved", cls: "bg-gray-100 text-gray-500" };
  if (isIsobaric) return { label: "isobaric", cls: "bg-amber-100 text-amber-700" };
  if (errorMda < 20) return { label: "high", cls: "bg-green-100 text-green-700" };
  if (errorMda < 50) return { label: "medium", cls: "bg-blue-100 text-blue-700" };
  return { label: "low", cls: "bg-gray-100 text-gray-500" };
}

export function ModificationCandidates({ rows }: { rows: TopParallelRow[] | null }) {
  const candidates = useMemo<ModCandidate[]>(() => {
    if (!rows) return [];

    const byRank = new Map<number, TopParallelRow[]>();
    for (const r of rows) {
      const list = byRank.get(r.read_rank) ?? [];
      list.push(r);
      byRank.set(r.read_rank, list);
    }

    const result: ModCandidate[] = [];

    for (const [rank, rs] of byRank) {
      const sorted = [...rs].sort((a, b) => a.mass - b.mass);
      const head = sorted[0];
      const ladderCall = head?.ladder_call ?? "";

      for (let i = 1; i < sorted.length; i++) {
        const delta = sorted[i].mass - sorted[i - 1].mass;

        let bestNt = "";
        let bestDiff = DECODE_TOL;
        let bestMass = 0;
        for (const [nt, m] of Object.entries(RESIDUE_MASSES)) {
          const d = Math.abs(delta - m);
          if (d < bestDiff) {
            bestDiff = d;
            bestNt = nt;
            bestMass = m;
          }
        }

        if (bestNt && CANONICAL.has(bestNt)) continue; // canonical — skip

        const isIsobaric = bestNt ? ISOBARIC_SET.has(bestNt) : false;
        const isUnknown = !bestNt;
        const meanRelI = (sorted[i - 1].rel_i + sorted[i].rel_i) / 2;

        result.push({
          readRank: rank,
          ladderCall,
          position: i,
          massBefore: sorted[i - 1].mass,
          massAfter: sorted[i].mass,
          deltaMass: delta,
          candidateMod: bestNt || `?${delta.toFixed(0)}`,
          isIsobaric,
          isUnknown,
          massErrorMda: bestDiff * 1000,
          meanRelI,
          requiresManualReview: isIsobaric || isUnknown,
        });
      }
    }

    return result.sort((a, b) =>
      a.readRank !== b.readRank ? a.readRank - b.readRank : a.position - b.position
    );
  }, [rows]);

  if (!rows) return null;
  if (candidates.length === 0) {
    return (
      <Card
        title="Modification Candidates"
        subtitle="Non-canonical residues decoded from consecutive mass differences."
      >
        <EmptyState>No modification candidates detected — all decoded positions matched canonical nucleotides (A/U/G/C).</EmptyState>
      </Card>
    );
  }

  const nIsobaric = candidates.filter((c) => c.isIsobaric).length;
  const nUnknown = candidates.filter((c) => c.isUnknown).length;
  const nDefinite = candidates.length - nIsobaric - nUnknown;

  return (
    <Card
      title="Modification Candidates"
      subtitle={`${candidates.length} position${candidates.length !== 1 ? "s" : ""} in candidate reads decoded as non-canonical residues. ${nDefinite > 0 ? `${nDefinite} unambiguous modification${nDefinite > 1 ? "s" : ""}. ` : ""}${nIsobaric > 0 ? `${nIsobaric} isobaric pair${nIsobaric > 1 ? "s" : ""} require orthogonal validation. ` : ""}${nUnknown > 0 ? `${nUnknown} unresolved (not in dictionary). ` : ""}Mass errors ≤70 mDa represent the algorithm resolution limit.`}
    >
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">modified (unambiguous)</span>
        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">isobaric — cannot distinguish by mass alone</span>
        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">unresolved — not in modification dictionary</span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="text-gray-400 text-left border-b border-gray-100">
              <th className="py-2 px-2 font-medium">Read #</th>
              <th className="py-2 px-2 font-medium">Orientation</th>
              <th className="py-2 px-2 font-medium text-right">Position</th>
              <th className="py-2 px-2 font-medium text-right">Observed ΔM (Da)</th>
              <th className="py-2 px-2 font-medium">Candidate modification</th>
              <th className="py-2 px-2 font-medium text-right">Mass error (mDa)</th>
              <th className="py-2 px-2 font-medium">Confidence</th>
              <th className="py-2 px-2 font-medium">Manual review?</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => {
              const conf = confidenceLabel(c.massErrorMda, c.isIsobaric, c.isUnknown);
              return (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-1.5 px-2 tabular-nums">{c.readRank}</td>
                  <td className="py-1.5 px-2 text-gray-500">{c.ladderCall || "—"}</td>
                  <td className="py-1.5 px-2 tabular-nums text-right">{c.position}</td>
                  <td className="py-1.5 px-2 tabular-nums text-right font-mono">
                    {c.deltaMass.toFixed(4)}
                  </td>
                  <td className="py-1.5 px-2">
                    <span
                      className={`font-medium px-1.5 py-0.5 rounded text-xs ${
                        c.isUnknown
                          ? "bg-gray-100 text-gray-600"
                          : c.isIsobaric
                          ? "bg-amber-100 text-amber-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                      title={
                        c.isIsobaric
                          ? `Isobaric pair — two or more modifications have this mass. Cannot distinguish by mass spectrometry alone.`
                          : c.isUnknown
                          ? `Mass delta ${c.deltaMass.toFixed(3)} Da not found in modification dictionary.`
                          : `Best match: ${c.candidateMod} (expected ${(RESIDUE_MASSES[c.candidateMod] ?? 0).toFixed(4)} Da)`
                      }
                    >
                      {c.candidateMod}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 tabular-nums text-right text-gray-500">
                    {c.isUnknown ? `>${(DECODE_TOL * 1000).toFixed(0)}` : c.massErrorMda.toFixed(1)}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${conf.cls}`}>{conf.label}</span>
                  </td>
                  <td className="py-1.5 px-2">
                    {c.requiresManualReview ? (
                      <span className="text-amber-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-300">No</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Modification candidates are derived from mass differences between consecutive chain points.
        Isobaric pairs (amber) share the same nominal mass and cannot be distinguished without orthogonal methods
        (e.g., MS/MS, metabolic labeling, or RiboMethSeq). Unresolved positions (gray) may represent novel
        modifications, adducts, or chain-building artifacts — treat with caution until validated.
      </p>
    </Card>
  );
}
