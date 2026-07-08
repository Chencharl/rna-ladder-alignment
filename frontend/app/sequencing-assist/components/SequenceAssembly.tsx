"use client";
import { useMemo, useState } from "react";
import type { TopParallelRow, RefComparison } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip } from "./ui";

// ─── Residue token styling ────────────────────────────────────────────────────

const CANONICAL = new Set(["A", "U", "G", "C"]);

// Formal isobaric pairs — single dictionary entries that share a monoisotopic
// mass and cannot be distinguished without orthogonal chemistry.
const ISOBARIC_KEYS = new Set([
  "Um/m1Ψ", "s2U/s4U", "m5C/Cm", "mA/Am", "mG/Gm", "manQ/galQ",
]);

// A gap step spans >1 residue in a single observed mass difference
// (intermediate peaks missing from the ladder).  These show "/" but are NOT
// isobaric — the label lists all inferred residues summed together.
function isGapStep(call: string): boolean {
  return call.includes("/") && !ISOBARIC_KEYS.has(call);
}

function isAmbiguous(call: string): boolean {
  // Isobaric: same mass, two chemical identities — cannot resolve by mass.
  return ISOBARIC_KEYS.has(call);
}

// Count inferred components in a gap step (e.g. "A/G/C" → 3)
function gapStepCount(call: string): number {
  return call.split("/").length;
}

function tokenStyle(call: string): string {
  const base = "inline-block px-1.5 py-0.5 rounded text-xs font-mono border leading-none cursor-default shrink-0";
  if (call.startsWith("?"))  return `${base} bg-gray-100 text-gray-500 border-gray-300`;
  if (isGapStep(call))       return `${base} bg-teal-50 text-teal-700 border-teal-300 border-dashed`;
  if (isAmbiguous(call))     return `${base} bg-amber-100 text-amber-800 border-amber-300`;
  if (CANONICAL.has(call))   return `${base} bg-blue-50 text-blue-800 border-blue-200`;
  return `${base} bg-purple-50 text-purple-800 border-purple-200`;
}

function tokenTitle(call: string, delta: number): string {
  const expected = RESIDUE_MASSES[call];
  const obs = `Δ = ${delta.toFixed(3)} Da`;
  const errStr = expected != null
    ? `, err = ${Math.abs(delta - expected).toFixed(4)} Da`
    : "";
  if (call.startsWith("?")) return `Unresolved — ${obs} (not in modification dictionary)`;
  if (isGapStep(call)) {
    const n = gapStepCount(call);
    const missing = n - 1;
    return `Gap step (${missing} missing ladder rung${missing > 1 ? "s" : ""}): combined Δ = ${delta.toFixed(3)} Da, inferred as ${call.split("/").join(" + ")}. Residue order within gap is unknown. Confirm with orthogonal data.`;
  }
  if (isAmbiguous(call))    return `Isobaric pair — cannot distinguish ${call} by mass alone; ${obs}${errStr}; requires orthogonal validation`;
  if (CANONICAL.has(call))  return `${call} — ${obs}${errStr}`;
  return `Modified: ${call} — ${obs}${errStr}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Subset of residue masses used only for error calculation in tooltips.
// Full dictionary lives in TopParallelReads.tsx; keep in sync if masses change.
const RESIDUE_MASSES: Record<string, number> = {
  A:329.05252,U:306.02530,G:345.04743,C:305.04129,
  D:308.04095,"Um/m1Ψ":320.04095,"s2U/s4U":322.00246,
  mo5U:336.03587,m5s2U:336.01811,m5Um:334.05660,
  mnm5U:349.06750,ncm5U:363.04677,mnm5s2U:365.04466,
  mcm5U:378.04643,cmo5U:380.02570,cmnm5U:393.05733,
  mcm5s2U:394.02359,mchm5U:394.04135,ncm5Um:377.06242,
  acp3U:407.07298,cmnm5s2U:409.03449,tm5U:443.04000,
  tm5s2U:459.01710,s2C:321.01844,"m5C/Cm":319.05694,
  ac4C:347.05185,f5C:333.03620,k2C:433.13625,
  I:330.03654,m1I:344.05200,"mA/Am":343.06817,
  i6A:397.11512,io6A:413.11003,ms2i6A:443.10284,
  t6A:474.09003,m6t6A:488.10568,ms2t6A:520.07775,
  "Ar(p)":541.06111,yW:469.09866,o2yW:485.09395,
  "mG/Gm":359.06308,"G'":346.05740,m22G:373.07873,
  m22Gm:387.09438,archaeosine:386.07398,Q:471.11551,
  "manQ/galQ":633.16834,
};

interface SeqStep {
  call: string;
  mass: number;  // absolute fragment mass
  delta: number; // mass difference from previous fragment (= observed residue mass)
}

interface AssembledChain {
  rank: number;
  ladderCall: string;
  tier: string;
  partnerRank: number | null;
  steps: SeqStep[];   // already oriented 5′→3′
  nPoints: number;
}

// ─── Helper: build sequence text for clipboard ───────────────────────────────

function seqText(steps: SeqStep[]): string {
  return steps.map(s => s.call).join("-");
}

function copy(text: string, onDone: () => void) {
  navigator.clipboard?.writeText(text).then(onDone).catch(() => {});
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepToken({ step }: { step: SeqStep }) {
  return (
    <span className={tokenStyle(step.call)} title={tokenTitle(step.call, step.delta)}>
      {step.call}
    </span>
  );
}

interface ChainStripProps {
  chain: AssembledChain;
  is5prime: boolean;
  partnerLabel?: string;
  refComp?: RefComparison | null;
  copied: boolean;
  onCopy: () => void;
}

function RefAlignmentRow({ refComp, is5prime }: { refComp: RefComparison; is5prime: boolean }) {
  const [open, setOpen] = useState(false);
  const identity = Math.round(refComp.identity * 100);
  const n = refComp.mismatches.length;
  // 3' chains are now orientation-corrected in the API (reversed to 5'→3' before aligning).
  // Only add a note if somehow we received an un-corrected 3' alignment.
  const orientationNote = (!is5prime && !refComp.orientation_corrected)
    ? " (⚠ 3′→5′ order — re-run to get corrected alignment)"
    : "";
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        {open ? "▲" : "▼"}
        {" "}Reference alignment: <span className={`font-semibold ${identity >= 80 ? "text-green-600" : identity >= 60 ? "text-amber-600" : "text-red-600"}`}>{identity}% identity</span>
        {n > 0 && <span className="text-gray-400">· {n} mismatch{n > 1 ? "es" : ""} (candidate modification sites)</span>}
        {n === 0 && <span className="text-green-600">· all positions match</span>}
        {orientationNote && <span className="text-amber-600">{orientationNote}</span>}
      </button>
      {open && (
        <div className="mt-1.5 text-xs space-y-0.5">
          {n === 0 ? (
            <p className="text-green-600 italic">No mismatches — recovered sequence matches reference exactly.</p>
          ) : (
            <>
              <p className="text-gray-400 italic mb-1">Mismatched positions are candidate sites for RNA modifications, editing, or isoforms:</p>
              {refComp.mismatches.map((mm, i) => (
                <div key={i} className="flex items-center gap-2 pl-1">
                  <span className="text-gray-400 tabular-nums w-12">pos {mm.position}</span>
                  <span className="font-mono px-1 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800">{mm.read}</span>
                  <span className="text-gray-400">vs ref</span>
                  <span className="font-mono px-1 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">{mm.reference}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChainStrip({ chain, is5prime, partnerLabel, refComp, copied, onCopy }: ChainStripProps) {
  const accent = is5prime ? "blue" : "purple";
  const containerCls = `rounded-lg border p-3 ${
    is5prime ? "bg-blue-50 border-blue-100" : "bg-purple-50 border-purple-100"
  }`;
  const labelCls = `text-sm font-bold ${is5prime ? "text-blue-700" : "text-purple-700"}`;
  const endCls = `text-xs font-mono font-bold ${is5prime ? "text-blue-600" : "text-purple-600"} shrink-0`;

  const nMods = chain.steps.filter(s => !CANONICAL.has(s.call) && !s.call.startsWith("?") && !isGapStep(s.call)).length;
  const nUnknown = chain.steps.filter(s => s.call.startsWith("?")).length;
  const nGaps = chain.steps.filter(s => isGapStep(s.call)).length;

  return (
    <div className={containerCls}>
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={labelCls}>
            {is5prime ? "5′ Read" : "3′ Read"} — Read #{chain.rank}
          </span>
          <LadderChip call={chain.ladderCall as any} size="sm" />
          <ConfidenceChip tier={chain.tier} />
          {partnerLabel && (
            <span className="text-xs text-gray-500 italic">{partnerLabel}</span>
          )}
          <span className="text-xs text-gray-400 tabular-nums">
            {chain.steps.length} steps
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors shrink-0"
        >
          {copied ? "✓ Copied" : "Copy sequence"}
        </button>
      </div>

      {/* Sequence strip */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className={endCls}>{is5prime ? "5′—" : "←5′"}</span>
        {chain.steps.length === 0 ? (
          <span className="text-xs text-gray-400 italic">
            Chain seed only — no extension steps recovered at current length threshold.
          </span>
        ) : (
          chain.steps.map((step, i) => <StepToken key={i} step={step} />)
        )}
        <span className={endCls}>{is5prime ? "→…" : "—3′"}</span>
      </div>

      {/* Modification / gap / unknown summary */}
      {(nMods > 0 || nUnknown > 0 || nGaps > 0) && (
        <p className="text-xs text-gray-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {nMods > 0 && (
            <span className="text-purple-700 font-medium">{nMods} modified position{nMods > 1 ? "s" : ""}</span>
          )}
          {nGaps > 0 && (
            <span className="text-teal-700 font-medium">{nGaps} gap step{nGaps > 1 ? "s" : ""} (missing rungs)</span>
          )}
          {nUnknown > 0 && (
            <span className="text-gray-400">{nUnknown} unresolved</span>
          )}
        </p>
      )}

      {/* Reference comparison — only shown when reference was provided */}
      {refComp && <RefAlignmentRow refComp={refComp} is5prime={is5prime} />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SequenceAssembly({
  rows,
  refComparisons,
}: {
  rows: TopParallelRow[] | null;
  refComparisons?: Record<string, RefComparison> | null;
}) {
  const [copied5, setCopied5] = useState(false);
  const [copied3, setCopied3] = useState(false);

  const { chain5, chain3 } = useMemo<{
    chain5: AssembledChain | null;
    chain3: AssembledChain | null;
  }>(() => {
    if (!rows || rows.length === 0) return { chain5: null, chain3: null };

    // Group rows by read_rank
    const groups = new Map<number, TopParallelRow[]>();
    for (const r of rows) {
      const g = groups.get(r.read_rank) ?? [];
      g.push(r);
      groups.set(r.read_rank, g);
    }

    const tierRank = (t: string) => t === "high" ? 0 : t === "medium" ? 1 : 2;

    const assembled: AssembledChain[] = Array.from(groups.entries()).map(([rank, rs]) => {
      const sorted = [...rs].sort((a, b) => a.row_position - b.row_position);
      const head = sorted[0];
      // row_position 0 is the seed fragment — its "call" is "(seed)", skip it.
      // Positions 1..N each carry the residue label for that extension step.
      const seedMass = sorted.find(r => r.row_position === 0)?.mass ?? 0;
      const nonSeed = sorted.filter(r => r.row_position > 0 && r.call !== "(seed)");
      const steps: SeqStep[] = nonSeed.map((r, i) => ({
        call: r.call,
        mass: r.mass,
        delta: r.mass - (i > 0 ? nonSeed[i - 1].mass : seedMass),
      }));
      return {
        rank,
        ladderCall: head.ladder_call,
        tier: head.confidence_tier,
        partnerRank: head.candidate_partner_rank ?? null,
        steps,
        nPoints: sorted.length,
      };
    });

    // Match ladder direction (handle "5′" / "5prime" / "5'" variants)
    const is5 = (c: AssembledChain) => String(c.ladderCall).startsWith("5");
    const is3 = (c: AssembledChain) => String(c.ladderCall).startsWith("3");

    const fives  = assembled.filter(is5).sort((a, b) =>
      tierRank(a.tier) - tierRank(b.tier) || a.rank - b.rank);
    const threes = assembled.filter(is3).sort((a, b) =>
      tierRank(a.tier) - tierRank(b.tier) || a.rank - b.rank);

    const best5 = fives[0] ?? null;

    // Prefer the chain's known paired partner; fall back to best independent 3′ chain
    let best3Raw = (best5?.partnerRank != null
      ? assembled.find(c => c.rank === best5.partnerRank)
      : null) ?? threes[0] ?? null;

    // Reverse 3′ chain: the algorithm walks from the 3′ end toward 5′, so
    // consecutive calls read 3′→5′.  Reversing gives the canonical 5′→3′ order.
    const best3 = best3Raw
      ? { ...best3Raw, steps: [...best3Raw.steps].reverse() }
      : null;

    return { chain5: best5, chain3: best3 };
  }, [rows]);

  const noResults = !chain5 && !chain3;

  return (
    <Card
      title="Sequence Assembly"
      subtitle={
        "Decoded nucleotide sequence from the highest-confidence 5′ and 3′ ladder reads. " +
        "Blue = canonical; purple = modified; amber = isobaric pair (orthogonal confirmation required); " +
        "teal dashed = gap step (1–2 missing ladder rungs, inferred residues, order unknown); " +
        "grey = unresolved mass. Hover each token for Δ mass and confidence details."
      }
    >
      {!rows ? (
        <EmptyState>Run the analysis pipeline to see the assembled sequence.</EmptyState>
      ) : noResults ? (
        <EmptyState>
          No classified 5′ or 3′ reads recovered. Increase the signal threshold or lower the
          minimum read length in the analysis parameters and re-run.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {chain5 ? (
            <ChainStrip
              chain={chain5}
              is5prime={true}
              partnerLabel={
                chain3 && chain5.partnerRank === chain3.rank
                  ? `Paired partner: Read #${chain3.rank}`
                  : undefined
              }
              refComp={refComparisons?.[String(chain5.rank)] ?? null}
              copied={copied5}
              onCopy={() => {
                copy(seqText(chain5.steps), () => {
                  setCopied5(true);
                  setTimeout(() => setCopied5(false), 2000);
                });
              }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic px-1">
              No high- or medium-confidence 5′ reads in the top parallel set.
            </p>
          )}

          {chain3 ? (
            <ChainStrip
              chain={chain3}
              is5prime={false}
              partnerLabel={
                chain5 && chain3.partnerRank === chain5.rank
                  ? `Paired partner: Read #${chain5.rank}`
                  : undefined
              }
              refComp={refComparisons?.[String(chain3.rank)] ?? null}
              copied={copied3}
              onCopy={() => {
                copy(seqText(chain3.steps), () => {
                  setCopied3(true);
                  setTimeout(() => setCopied3(false), 2000);
                });
              }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic px-1">
              No high- or medium-confidence 3′ reads in the top parallel set.
            </p>
          )}

          {/* Coverage summary footer */}
          <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            {chain5 && (
              <span>
                <span className="font-semibold text-blue-700">{chain5.steps.length}</span> positions from 5′ end (Read #{chain5.rank})
              </span>
            )}
            {chain3 && (
              <span>
                <span className="font-semibold text-purple-700">{chain3.steps.length}</span> positions from 3′ end (Read #{chain3.rank})
              </span>
            )}
            {chain5 && chain3 && (
              <span className="text-gray-400">
                {chain5.steps.length + chain3.steps.length} positions characterized in total
              </span>
            )}
            <span className="text-gray-400 ml-auto">
              Decoded from algorithm sequence calls (mass-diff matching, 0.05 Da tolerance)
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
