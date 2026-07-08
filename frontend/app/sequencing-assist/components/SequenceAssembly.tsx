"use client";
import { useMemo, useState } from "react";
import type { TopParallelRow } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip } from "./ui";

// ─── Residue token styling ────────────────────────────────────────────────────

const CANONICAL = new Set(["A", "U", "G", "C"]);

// Formal isobaric pairs — single dictionary entries that represent two
// indistinguishable modifications at this mass precision.
// Any call containing "/" (including runtime near-isobaric ambiguities)
// is also treated as amber regardless of whether it's in this set.
const ISOBARIC_KEYS = new Set([
  "Um/m1Ψ", "s2U/s4U", "m5C/Cm", "mA/Am", "mG/Gm", "manQ/galQ",
]);

function isAmbiguous(call: string): boolean {
  // A "/" in the call means either a formal isobaric dictionary key or a
  // runtime tie between two residues within the 0.05 Da tolerance — either
  // way the position cannot be resolved by mass alone.
  return ISOBARIC_KEYS.has(call) || call.includes("/");
}

function tokenStyle(call: string): string {
  const base = "inline-block px-1.5 py-0.5 rounded text-xs font-mono border leading-none cursor-default shrink-0";
  if (call.startsWith("?"))  return `${base} bg-gray-100 text-gray-500 border-gray-300`;
  if (isAmbiguous(call))     return `${base} bg-amber-100 text-amber-800 border-amber-300`;
  if (CANONICAL.has(call))   return `${base} bg-blue-50 text-blue-800 border-blue-200`;
  return `${base} bg-purple-50 text-purple-800 border-purple-200`;
}

function tokenTitle(call: string, mass: number): string {
  if (call.startsWith("?")) return `Unresolved — Δmass = ${mass.toFixed(2)} Da (not in modification dictionary)`;
  if (isAmbiguous(call))    return `Mass-ambiguous — cannot distinguish ${call} by mass alone; orthogonal validation (e.g. CMC, metabolic labeling) required`;
  if (CANONICAL.has(call))  return call;
  return `Modified: ${call}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeqStep {
  call: string;
  mass: number;
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
    <span className={tokenStyle(step.call)} title={tokenTitle(step.call, step.mass)}>
      {step.call}
    </span>
  );
}

interface ChainStripProps {
  chain: AssembledChain;
  is5prime: boolean;
  partnerLabel?: string;
  copied: boolean;
  onCopy: () => void;
}

function ChainStrip({ chain, is5prime, partnerLabel, copied, onCopy }: ChainStripProps) {
  const accent = is5prime ? "blue" : "purple";
  const containerCls = `rounded-lg border p-3 ${
    is5prime ? "bg-blue-50 border-blue-100" : "bg-purple-50 border-purple-100"
  }`;
  const labelCls = `text-sm font-bold ${is5prime ? "text-blue-700" : "text-purple-700"}`;
  const endCls = `text-xs font-mono font-bold ${is5prime ? "text-blue-600" : "text-purple-600"} shrink-0`;

  const nMods = chain.steps.filter(s => !CANONICAL.has(s.call) && !s.call.startsWith("?")).length;
  const nUnknown = chain.steps.filter(s => s.call.startsWith("?")).length;

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

      {/* Modification / unknown summary */}
      {(nMods > 0 || nUnknown > 0) && (
        <p className="text-xs text-gray-500 mt-1.5">
          {nMods > 0 && (
            <span className="text-purple-700 font-medium">{nMods} modified position{nMods > 1 ? "s" : ""}</span>
          )}
          {nMods > 0 && nUnknown > 0 && <span className="text-gray-300"> · </span>}
          {nUnknown > 0 && (
            <span className="text-gray-400">{nUnknown} unresolved (not in dictionary)</span>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SequenceAssembly({ rows }: { rows: TopParallelRow[] | null }) {
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
      const steps: SeqStep[] = sorted
        .filter(r => r.row_position > 0 && r.call !== "(seed)")
        .map(r => ({ call: r.call, mass: r.mass }));
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
        "Blue = canonical; purple = modified; amber = isobaric pair (requires orthogonal confirmation). " +
        "3′ read is shown in 5′→3′ reading order (reversed from walk direction)."
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
