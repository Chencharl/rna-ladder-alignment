// ---------------------------------------------------------------------------
// Data-contract types for the Sequencing Assist dashboard.
//
// These mirror trna_nested_algorithm.py's output files exactly (column
// names, JSON keys). If the pipeline's data contract changes, update here
// first -- every panel reads through these types, nothing parses raw
// strings/headers on its own.
// ---------------------------------------------------------------------------

export type LadderCall = "5'" | "3'" | "ambiguous" | "conflict";
export type ConfidenceTier = "high" | "medium" | "low" | string;
export type PeakStatus =
  | "primary_used"
  | "ambiguous_retained"
  | "conflict_retained"
  | "reference_reused"
  | "unused";

export interface PeakStatusCounts {
  primary_used: number;
  ambiguous_retained: number;
  conflict_retained: number;
  reference_reused: number;
  unused: number;
}

export interface ReadCallCounts {
  "5prime": number;
  "3prime": number;
  ambiguous: number;
  conflict: number;
}

export interface ReviewSummary {
  reads_5prime: number;
  reads_3prime: number;
  reads_ambiguous: number;
  reads_conflict: number;
  primary_used_peaks: number | null;
  reference_provided: boolean;
  reference_reuse_candidates_tested: number;
  reference_reuse_accepted: number;
  reference_reuse_rejected: number;
}

// base_calling_report.json -- only the fields the dashboard actually uses.
export interface BaseCallingReport {
  file_name: string;
  runtime_seconds: number;
  n_points: number;
  n_chains: number;
  n_blocks: number | null;
  gap_mode?: string;
  peak_status_counts: PeakStatusCounts;
  read_call_counts: ReadCallCounts;
  top_parallel_warning: boolean;
  review_summary: ReviewSummary;
  [key: string]: unknown; // path fields, chains[], etc. -- not consumed here
}

// top_parallel_reads_long.csv -- one row per (read, peak-in-chain).
export interface TopParallelRow {
  read_rank: number;
  row_position: number;
  mass: number;
  rel_i: number;
  rt: number;
  call: string;
  peak_status: PeakStatus | "";
  ladder_call: LadderCall;
  confidence_tier: ConfidenceTier;
  ladder_classification: string;
  ladder_confidence: number | null;
  candidate_partner_rank: number | null;
  evidence_short: string;
  warning_short: string;
}

// sequencing_decision_summary.csv -- one row per read, the dashboard's
// primary decision-support table.
export interface DecisionRow {
  read_rank: number;
  ladder_call: LadderCall;
  confidence_tier: ConfidenceTier;
  review_priority: string;
  read_length: number;
  mean_rel_i: number;
  candidate_partner_rank: number | null;
  decision_basis: string;
  evidence_short: string;
  warning_short: string;
  suggested_action: string;
}

// read_summary.csv -- 29 columns, full per-read evidence (optional/supplementary upload).
export interface ReadSummaryRow {
  read_rank: number;
  ladder_call: LadderCall;
  ladder_confidence_tier: ConfidenceTier;
  review_priority: string;
  primary_review: boolean | string;
  top_parallel_group: boolean | string;
  low_confidence_noise: boolean | string;
  seed_index: number;
  seed_mass: number;
  seed_mass_integer: number;
  seed_mass_decimal: number;
  seed_rt: number;
  start_block: number;
  read_length: number;
  mean_rel_i: number;
  candidate_partner_rank: number | null;
  partner_seed_mass: number | null;
  partner_seed_mass_integer: number | null;
  partner_seed_mass_decimal: number | null;
  paired_decimal_difference: number | null;
  paired_rt_difference: number | null;
  paired_length_overlap: number | null;
  mass_difference_consistency: string;
  precursor_or_intact_mass_closure: string;
  decision_basis: string;
  fallback_median_used: boolean | string;
  ladder_classification: string;
  ladder_confidence: number | null;
  ladder_evidence: string;
  ladder_warnings: string;
}

// Classification_Evidence.csv -- 15 columns, the scientific core / "why this call" detail.
export interface ClassificationEvidenceRow {
  read_rank: number;
  ladder_call: LadderCall;
  ladder_confidence_tier: ConfidenceTier;
  candidate_partner_rank: number | null;
  seed_mass_integer: number;
  seed_mass_decimal: number;
  partner_seed_mass_integer: number | null;
  partner_seed_mass_decimal: number | null;
  paired_decimal_difference: number | null;
  paired_rt_difference: number | null;
  paired_length_overlap: number | null;
  decision_basis: string;
  fallback_median_used: boolean | string;
  ladder_evidence: string;
  ladder_warnings: string;
}

// Peak_Status.csv -- 8 columns, ~thousands of rows on a real run.
export interface PeakStatusRow {
  mass: number;
  rel_intensity: number;
  rt: number;
  block: number;
  peak_status: PeakStatus;
  read_rank: number | null;
  ladder_call: LadderCall | "";
  role: string;
}

// The set of files the dashboard recognizes by filename. Everything is
// loaded client-side from files the user already has on disk (the pipeline's
// own output folder) -- nothing is computed or re-run here.
export interface LoadedRun {
  report: BaseCallingReport | null;
  topParallel: TopParallelRow[] | null;
  decisions: DecisionRow[] | null;
  readSummary: ReadSummaryRow[] | null;
  classificationEvidence: ClassificationEvidenceRow[] | null;
  peakStatus: PeakStatusRow[] | null;
  // Original File objects, kept so the Export panel can re-offer them for
  // download without re-fetching anything.
  files: Record<string, File>;
}

export const EMPTY_RUN: LoadedRun = {
  report: null,
  topParallel: null,
  decisions: null,
  readSummary: null,
  classificationEvidence: null,
  peakStatus: null,
  files: {},
};
