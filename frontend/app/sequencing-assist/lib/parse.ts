import Papa from "papaparse";
import type {
  BaseCallingReport,
  ClassificationEvidenceRow,
  DecisionRow,
  LoadedRun,
  PeakStatusRow,
  ReadSummaryRow,
  TopParallelRow,
} from "./types";

// ---------------------------------------------------------------------------
// File recognition -- match uploaded files by filename, not by asking the
// user to label each one. Matching is case-insensitive and ignores any
// path/prefix the browser includes.
// ---------------------------------------------------------------------------

export type FileSlot =
  | "report"
  | "topParallel"
  | "decisions"
  | "readSummary"
  | "classificationEvidence"
  | "peakStatus";

const SLOT_PATTERNS: Record<FileSlot, RegExp> = {
  report: /base_calling_report\.json$/i,
  topParallel: /top_parallel_reads_long\.csv$/i,
  decisions: /sequencing_decision_summary\.csv$/i,
  readSummary: /read_summary\.csv$/i,
  classificationEvidence: /classification_evidence\.csv$/i,
  peakStatus: /peak_status\.csv$/i,
};

export const SLOT_INFO: Record<FileSlot, { label: string; filename: string; required: boolean }> = {
  report: { label: "Run report", filename: "base_calling_report.json", required: true },
  topParallel: { label: "Top Parallel Reads (long)", filename: "top_parallel_reads_long.csv", required: true },
  decisions: { label: "Sequencing Decision Summary", filename: "sequencing_decision_summary.csv", required: true },
  classificationEvidence: { label: "Classification Evidence", filename: "Classification_Evidence.csv", required: false },
  peakStatus: { label: "Peak Status", filename: "Peak_Status.csv", required: false },
  readSummary: { label: "Read Summary (full evidence)", filename: "read_summary.csv", required: false },
};

export function matchSlot(filename: string): FileSlot | null {
  for (const slot of Object.keys(SLOT_PATTERNS) as FileSlot[]) {
    if (SLOT_PATTERNS[slot].test(filename)) return slot;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generic CSV -> typed rows, with numeric coercion for known numeric columns.
// ---------------------------------------------------------------------------

const NUMERIC_COLUMNS = new Set([
  "read_rank", "row_position", "mass", "rel_i", "rt", "ladder_confidence",
  "candidate_partner_rank", "read_length", "mean_rel_i", "seed_index",
  "seed_mass", "seed_mass_integer", "seed_mass_decimal", "seed_rt",
  "start_block", "partner_seed_mass", "partner_seed_mass_integer",
  "partner_seed_mass_decimal", "paired_decimal_difference",
  "paired_rt_difference", "paired_length_overlap", "rel_intensity", "block",
]);

function coerceRow(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === "" || v === undefined) {
      out[k] = NUMERIC_COLUMNS.has(k) ? null : v;
      continue;
    }
    if (NUMERIC_COLUMNS.has(k)) {
      const n = Number(v);
      out[k] = Number.isNaN(n) ? null : n;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseCsvFile<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data.map((row) => coerceRow(row) as unknown as T));
      },
      error: (err: Error) => reject(err),
    });
  });
}

function parseJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as T);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Load a batch of File objects into a LoadedRun, auto-matched by filename.
// Returns the updated run plus the list of filenames that didn't match any
// known slot (so the UI can warn about unrecognized uploads).
// ---------------------------------------------------------------------------

export async function loadFilesIntoRun(
  files: File[],
  existing: LoadedRun
): Promise<{ run: LoadedRun; unmatched: string[] }> {
  const run: LoadedRun = {
    ...existing,
    files: { ...existing.files },
  };
  const unmatched: string[] = [];

  for (const file of files) {
    const slot = matchSlot(file.name);
    if (!slot) {
      unmatched.push(file.name);
      continue;
    }
    run.files[slot] = file;
    switch (slot) {
      case "report":
        run.report = await parseJsonFile<BaseCallingReport>(file);
        break;
      case "topParallel":
        run.topParallel = await parseCsvFile<TopParallelRow>(file);
        break;
      case "decisions":
        run.decisions = await parseCsvFile<DecisionRow>(file);
        break;
      case "readSummary":
        run.readSummary = await parseCsvFile<ReadSummaryRow>(file);
        break;
      case "classificationEvidence":
        run.classificationEvidence = await parseCsvFile<ClassificationEvidenceRow>(file);
        break;
      case "peakStatus":
        run.peakStatus = await parseCsvFile<PeakStatusRow>(file);
        break;
    }
  }

  return { run, unmatched };
}
