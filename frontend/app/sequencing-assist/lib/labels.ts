// ---------------------------------------------------------------------------
// Human-facing labels and colors. Rule: the UI must show literally
// 5', 3', ambiguous, conflict -- never the internal likely_5prime /
// likely_3prime / "?" tokens.
// ---------------------------------------------------------------------------

import type { LadderCall, PeakStatus } from "./types";

export function humanLadderLabel(raw: string | null | undefined): string {
  if (!raw) return "ambiguous";
  const v = String(raw).toLowerCase();
  if (v === "5'" || v === "5′" || v.includes("5prime") || v.includes("likely_5prime")) return "5′";
  if (v === "3'" || v === "3′" || v.includes("3prime") || v.includes("likely_3prime")) return "3′";
  if (v.includes("conflict")) return "conflict";
  return "ambiguous";
}

// Ladder-call chip colors (blue/purple/yellow-gray/orange-red per spec).
export const LADDER_CALL_COLOR: Record<string, string> = {
  "5′": "bg-blue-100 text-blue-800 border border-blue-300",
  "3′": "bg-purple-100 text-purple-800 border border-purple-300",
  ambiguous: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  conflict: "bg-orange-100 text-orange-800 border border-red-300",
};

export function ladderCallColor(raw: string | null | undefined): string {
  return LADDER_CALL_COLOR[humanLadderLabel(raw)] ?? LADDER_CALL_COLOR.ambiguous;
}

// Peak-status colors (primary_used=green, reference_reused=teal, unused=light
// gray; ambiguous/conflict retained reuse the ladder-call ambiguous/conflict
// palette since they're the same underlying concept applied to a peak).
export const PEAK_STATUS_COLOR: Record<string, string> = {
  primary_used: "bg-green-100 text-green-800 border border-green-300",
  ambiguous_retained: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  conflict_retained: "bg-orange-100 text-orange-800 border border-red-300",
  reference_reused: "bg-teal-100 text-teal-800 border border-teal-300",
  unused: "bg-gray-100 text-gray-500 border border-gray-300",
};

export const PEAK_STATUS_LABEL: Record<string, string> = {
  primary_used: "Primary used",
  ambiguous_retained: "Ambiguous (retained)",
  conflict_retained: "Conflict (retained)",
  reference_reused: "Reference reused",
  unused: "Unused",
};

export function peakStatusColor(status: string | null | undefined): string {
  if (!status) return "bg-gray-50 text-gray-400 border border-gray-200";
  return PEAK_STATUS_COLOR[status] ?? "bg-gray-50 text-gray-400 border border-gray-200";
}

export const CONFIDENCE_COLOR: Record<string, string> = {
  high: "bg-green-50 text-green-700 border border-green-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-gray-50 text-gray-500 border border-gray-200",
};

export function confidenceColor(tier: string | null | undefined): string {
  if (!tier) return CONFIDENCE_COLOR.low;
  return CONFIDENCE_COLOR[tier.toLowerCase()] ?? CONFIDENCE_COLOR.low;
}

/** "Read #12 is called 5′ because ..." -- the plain-language sentence the
 * Classification Evidence panel leads with, generated from existing
 * decision_basis / fallback_median_used fields -- no new pipeline data. */
export function whyThisCallSentence(
  readRank: number,
  ladderCall: LadderCall | string,
  decisionBasis: string | null | undefined,
  fallbackMedianUsed: boolean | string | null | undefined
): string {
  const label = humanLadderLabel(ladderCall);
  const basis = decisionBasis && decisionBasis.trim().length > 0
    ? decisionBasis.trim()
    : "the available decimal-mass and retention-time evidence";
  const usedFallback = fallbackMedianUsed === true || fallbackMedianUsed === "True" || fallbackMedianUsed === "true";
  const fallbackClause = usedFallback
    ? " A default (median) value was used for part of this decision because direct evidence was incomplete -- treat this call with extra caution."
    : "";
  return `Read #${readRank} is called ${label} because ${basis}.${fallbackClause}`;
}

export function isProblemCall(ladderCall: string | null | undefined): boolean {
  const label = humanLadderLabel(ladderCall);
  return label === "ambiguous" || label === "conflict";
}
