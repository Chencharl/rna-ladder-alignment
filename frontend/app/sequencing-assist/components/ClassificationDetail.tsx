import { useMemo } from "react";
import { whyThisCallSentence } from "../lib/labels";
import type { ClassificationEvidenceRow, DecisionRow } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip, fmt } from "./ui";

export function ClassificationDetail({
  selectedReadRank,
  classificationEvidence,
  decisions,
}: {
  selectedReadRank: number | null;
  classificationEvidence: ClassificationEvidenceRow[] | null;
  decisions: DecisionRow[] | null;
}) {
  const evidence = useMemo(() => {
    if (selectedReadRank == null) return null;
    return classificationEvidence?.find((r) => r.read_rank === selectedReadRank) ?? null;
  }, [classificationEvidence, selectedReadRank]);

  const decision = useMemo(() => {
    if (selectedReadRank == null) return null;
    return decisions?.find((r) => r.read_rank === selectedReadRank) ?? null;
  }, [decisions, selectedReadRank]);

  return (
    <Card
      title="Terminal-Direction Evidence"
      subtitle="Basis for 5′/3′ classification of the selected candidate read. All calls require independent verification."
    >
      {selectedReadRank == null ? (
        <EmptyState>
          Select a read from Top Parallel Reads or the Decision Table to see its evidence.
        </EmptyState>
      ) : !evidence && !decision ? (
        <EmptyState>
          No evidence found for Read #{selectedReadRank} in the uploaded files.
        </EmptyState>
      ) : (
        <div>
          <p className="text-base text-gray-800 mb-3">
            {whyThisCallSentence(
              selectedReadRank,
              (evidence?.ladder_call ?? decision?.ladder_call) || "ambiguous",
              evidence?.decision_basis ?? decision?.decision_basis,
              evidence?.fallback_median_used
            )}
          </p>

          <div className="flex items-center gap-2 mb-4">
            <LadderChip call={evidence?.ladder_call ?? decision?.ladder_call} />
            <ConfidenceChip tier={evidence?.ladder_confidence_tier ?? decision?.confidence_tier} />
            {(evidence?.candidate_partner_rank ?? decision?.candidate_partner_rank) != null && (
              <span className="text-sm text-gray-500">
                Candidate partner: Read #{evidence?.candidate_partner_rank ?? decision?.candidate_partner_rank}
              </span>
            )}
          </div>

          {evidence ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
              <Field label="Seed mass (int.dec)" value={`${fmtMaybe(evidence.seed_mass_integer)}.${fmtMaybe(evidence.seed_mass_decimal)}`} />
              <Field
                label="Partner seed mass (int.dec)"
                value={
                  evidence.partner_seed_mass_integer != null
                    ? `${fmtMaybe(evidence.partner_seed_mass_integer)}.${fmtMaybe(evidence.partner_seed_mass_decimal)}`
                    : "—"
                }
              />
              <Field label="Paired decimal difference" value={fmt(evidence.paired_decimal_difference, 4)} />
              <Field label="Paired RT difference" value={fmt(evidence.paired_rt_difference, 3)} />
              <Field label="Paired length overlap" value={fmt(evidence.paired_length_overlap, 3)} />
              <Field
                label="Fallback (median) used"
                value={evidence.fallback_median_used === true || evidence.fallback_median_used === "True" ? "Yes" : "No"}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-4">
              Upload Classification_Evidence.csv for the full evidence breakdown (partner mass, paired
              differences, fallback flag). Showing the summary from the decision table only.
            </p>
          )}

          <EvidenceBlock label="Evidence" text={evidence?.ladder_evidence ?? decision?.evidence_short} />
          <EvidenceBlock label="Warnings" text={evidence?.ladder_warnings ?? decision?.warning_short} tone="warn" />
        </div>
      )}
    </Card>
  );
}

function fmtMaybe(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : String(n);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium text-gray-800 tabular-nums">{value}</div>
    </div>
  );
}

function EvidenceBlock({ label, text, tone = "normal" }: { label: string; text?: string | null; tone?: "normal" | "warn" }) {
  if (!text || text.trim().length === 0) return null;
  return (
    <div className={`mt-2 rounded-lg border p-3 text-sm ${tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-70">{label}</div>
      {text}
    </div>
  );
}
