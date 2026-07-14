// When NEXT_PUBLIC_API_URL is not set in the Vercel build environment, the
// frontend calls the bundled Python function at /api/sequencing-assist instead
// of a separate Railway backend.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
export const IS_VERCEL_MODE = !process.env.NEXT_PUBLIC_API_URL;

export interface ScatterPoint {
  M: number;
  Rel_I: number;
  T: number;
  block: number;
}

export interface SigmoidPoint {
  M: number;
  T: number;
  Rel_I: number;
}

export interface DataTypeWarning {
  likely_intact: boolean;
  reasons: string[];
}

export interface UploadRawResponse {
  session_id: string;
  filename: string;
  n_points: number;
  n_points_stored: number;
  was_pre_subsampled?: boolean;
  mass_range: [number, number];
  rt_range: [number, number];
  rt_spread_minutes: number;
  n_blocks: number;
  preview_rows: Array<{ M: number; I: number; T: number; block: number; Rel_I: number }>;
  scatter_points: ScatterPoint[];
  sigmoid_points: SigmoidPoint[];
  data_type_warning: DataTypeWarning;
}

export interface ChainPoint {
  chain_index: number;
  read_rank: number;
  ladder_type: string;
  mass: number;
  rel_i: number;
  rt: number;
  n_points: number;
}

export interface ModCount {
  nt: string;
  count: number;
  is_canonical: boolean;
  is_unknown: boolean;
}

export interface TRNARefLibrary {
  loaded: boolean;
  n_theoretical_masses: number;
  n_peaks_matched: number;
  n_peaks_total: number;
  match_pct: number;
}

export interface ProphetMatchingRow {
  position: number;
  residue: string;
  // 5' ladder
  theor_mass_5p: number;
  in_range_5p: boolean;
  hit_5p: boolean;
  obs_mass_5p: number | null;
  obs_intensity_5p: number | null;
  obs_rt_5p: number | null;
  obs_rel_i_5p: number | null;
  delta_mda_5p: number | null;
  // 3' ladder
  theor_mass_3p: number;
  in_range_3p: boolean;
  hit_3p: boolean;
  obs_mass_3p: number | null;
  obs_intensity_3p: number | null;
  obs_rt_3p: number | null;
  obs_rel_i_3p: number | null;
  delta_mda_3p: number | null;
}

export interface ProphetMatchingResult {
  rows: ProphetMatchingRow[];
  n_positions: number;
  n_in_range_5p: number;
  n_in_range_3p: number;
  n_5p_hits: number;
  n_3p_hits: number;
  coverage_5p_pct: number;
  coverage_3p_pct: number;
  best_consecutive_5p: number;
  best_consecutive_3p: number;
  tolerance_da: number;
}

export interface PipelineResponse {
  report: Record<string, unknown>;
  reference_comparisons?: Record<string, import("./types").RefComparison> | null;
  reference_sequence_used?: string | null;
  prophet_matching?: ProphetMatchingResult | null;
  top_parallel_reads_long: Record<string, unknown>[] | null;
  sequencing_decision_summary: Record<string, unknown>[] | null;
  classification_evidence: Record<string, unknown>[] | null;
  peak_status: Record<string, unknown>[] | null;
  read_summary: Record<string, unknown>[] | null;
  top_chains_for_plot: ChainPoint[] | null;
  n_chains_total: number;
  n_chains_min_10: number;
  min_chain_len_shown: number;
  coverage_by_intensity: CoverageBin[] | null;
  coverage_by_mass_range: CoverageByMassRange[] | null;
  empirical_fdr: EmpiricalFDR | null;
  rt_quality: RtQuality | null;
  precursor_mass_used: number | null;
  mod_counts: ModCount[] | null;
  sigmoid_post_pipeline: SigmoidPostPoint[] | null;
  was_subsampled: boolean;
  n_original_points: number;
  n_pipeline_points: number;
  tRNA_ref_library?: TRNARefLibrary | null;
}

export interface SigmoidPostPoint {
  M: number;
  T: number;
  Rel_I: number;
  status: string;
}

export interface CoverageBin {
  label: string;
  total: number;
  matched: number;
  pct: number;
}

export interface CoverageRangeThreshold {
  threshold: string;   // ">10%", ">5%", ">2%"
  total: number;
  matched: number;
  pct: number;
}

export interface CoverageByMassRange {
  mass_range: string;  // "2–5 kDa", etc.
  thresholds: CoverageRangeThreshold[];
}

// Combined single-phase response returned by /api/sequencing-assist on Vercel.
export interface AnalyzeResponse extends UploadRawResponse, PipelineResponse {
  excel_b64?: string;
}

export async function uploadRawExcel(file: File): Promise<UploadRawResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/sequencing-assist/upload-raw`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function runPipeline(
  sessionId: string,
  subsample = false,
  referenceSequence = "",
): Promise<PipelineResponse> {
  const form = new FormData();
  form.append("session_id", sessionId);
  if (subsample) form.append("subsample", "true");
  if (referenceSequence.trim()) form.append("reference_sequence", referenceSequence.trim());
  const res = await fetch(`${API_BASE}/sequencing-assist/run-pipeline`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Pipeline failed: ${res.status}`);
  }
  return res.json();
}

export interface PipelineParams {
  minChainLen?: number;   // minimum ladder positions for a chain to be reported (default 10)
  topNChains?: number;    // number of top chains to include in plot data (default 10)
  minRelI?: number;       // minimum Rel_I (% of block max) for a peak to be a chain seed (default 5)
  precursorMass?: number; // intact RNA mass (Da); enables closure scoring in 5'/3' pairing
}

export interface RtQuality {
  r2: number;           // R² of RT vs log(mass) regression
  slope: number;        // minutes per log-Da — positive = good sigmoidal separation
  n_points: number;
  grade: "excellent" | "good" | "marginal" | "flat/poor";
}

export interface EmpiricalFDR {
  p_step_null_pct: number;       // % chance a random mass-pair step matches a residue
  n_pairs_tested: number;        // how many peak-pair differences were evaluated
  fdr_by_chain_length_pct: {     // estimated FDR (%) for chains of each length
    [length: string]: number;
  };
  interpretation: string;        // human-readable summary
}

// Vercel serverless functions have a ~4.5 MB request body limit.
// Files larger than this threshold are parsed client-side with SheetJS and
// sent as a JSON array of {M, I, T} rows instead of the raw binary file.
export const LARGE_FILE_THRESHOLD_BYTES = 3.5 * 1024 * 1024;

// Column-name sets that mirror load_data() in api/sequencing-assist.py
const M_NAMES = new Set(["m", "mass", "molecular weight", "mw", "deconv mass",
  "average mass", "monoisotopic mass", "mono mass"]);
const I_NAMES = new Set(["i", "intensity", "sum intensity", "peak intensity",
  "signal", "area", "height", "relative intensity"]);
const T_NAMES = new Set(["t", "rt", "retention time", "time", "apex rt",
  "apex retention time", "retention time (min)"]);

// Client-side pre-subsample: mirrors the server's PRE_SUB_LIMIT logic.
// 320 Da blocks, top-50 by intensity per block → max ~16,000 rows → ~640 KB JSON.
// Guarantees the payload fits within Vercel's 4.5 MB body limit regardless of
// input file size (18S rRNA charge-1 files can produce >150,000 rows).
const CLIENT_PRESUB_LIMIT = 20_000;
const BLOCK_WIDTH_DA = 320;
const TOP_PER_BLOCK = 50;

// Hydrolysis ladder analysis range. Rows outside this window are discarded
// client-side — the server applies the same 2,000–23,000 Da filter anyway,
// so sending masses outside it wastes payload budget.
const HYDRO_M_MIN = 1_500;
const HYDRO_M_MAX = 25_000;

async function parseExcelToRows(file: File): Promise<{ M: number; I: number; T: number }[]> {
  const { read, utils } = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  if (rawRows.length === 0) throw new Error("Spreadsheet appears empty");

  const colKeys = Object.keys(rawRows[0]);
  let mCol = "", iCol = "", tCol = "";
  for (const col of colKeys) {
    const lc = col.toLowerCase().trim();
    if (!mCol && M_NAMES.has(lc)) mCol = col;
    else if (!iCol && I_NAMES.has(lc)) iCol = col;
    else if (!tCol && T_NAMES.has(lc)) tCol = col;
  }
  // Fallback: positional assignment (same as load_data fallback)
  if (!mCol) mCol = colKeys[0] ?? "";
  if (!iCol) iCol = colKeys[1] ?? "";
  if (!tCol) tCol = colKeys[2] ?? "";
  if (!mCol || !iCol || !tCol) throw new Error("Cannot detect M/I/T columns in this file");

  // Parse + filter to hydrolysis ladder range + round precision to cut payload size
  const result: { M: number; I: number; T: number }[] = [];
  for (const row of rawRows) {
    const M = Number(row[mCol]);
    const I = Number(row[iCol]);
    const T = Number(row[tCol]);
    if (
      isFinite(M) && M >= HYDRO_M_MIN && M <= HYDRO_M_MAX &&
      isFinite(I) && I >= 0 &&
      isFinite(T) && T >= 0
    ) {
      result.push({
        M: Math.round(M * 100) / 100,    // 0.01 Da precision (sufficient for this algorithm)
        I: Math.round(I),                 // integer intensity
        T: Math.round(T * 1000) / 1000,  // 1 ms RT precision
      });
    }
  }

  if (result.length === 0) throw new Error("No peaks in the 1,500–25,000 Da range found in this file");

  // Client-side pre-subsampling for very large datasets (e.g. 18S rRNA charge-1).
  // Mirrors server PRE_SUB_LIMIT: top-N per 320 Da block, preserving high-signal peaks.
  if (result.length > CLIENT_PRESUB_LIMIT) {
    const blocks = new Map<number, { M: number; I: number; T: number }[]>();
    for (const r of result) {
      const blockId = Math.round(r.M / BLOCK_WIDTH_DA);
      const b = blocks.get(blockId) ?? [];
      b.push(r);
      blocks.set(blockId, b);
    }
    const subsampled: { M: number; I: number; T: number }[] = [];
    for (const b of blocks.values()) {
      b.sort((a, z) => z.I - a.I);          // descending by intensity
      subsampled.push(...b.slice(0, TOP_PER_BLOCK));
    }
    subsampled.sort((a, b) => a.M - b.M);
    return subsampled;
  }

  return result;
}

// Single-phase endpoint used on Vercel: upload + full pipeline in one request.
// onParsingDone fires after client-side Excel parsing completes but before the
// server request starts — lets the caller update loading state to "uploading".
export async function analyzeFile(
  file: File,
  referenceSequence = "",
  params: PipelineParams = {},
  onParsingDone?: () => void,
): Promise<AnalyzeResponse> {
  const form = new FormData();
  if (referenceSequence.trim()) form.append("reference_sequence", referenceSequence.trim());
  if (params.minChainLen != null) form.append("min_chain_len", String(params.minChainLen));
  if (params.topNChains != null) form.append("top_n_chains", String(params.topNChains));
  if (params.minRelI != null) form.append("min_rel_i", String(params.minRelI));
  if (params.precursorMass != null && params.precursorMass > 0) form.append("precursor_mass", String(params.precursorMass));

  if (file.size > LARGE_FILE_THRESHOLD_BYTES) {
    // Parse Excel client-side to stay under Vercel's 4.5 MB body limit
    const rows = await parseExcelToRows(file);
    onParsingDone?.();
    form.append("data_json", JSON.stringify(rows));
    form.append("filename", file.name);
  } else {
    form.append("file", file);
  }

  const res = await fetch("/api/sequencing-assist", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Analysis failed: ${res.status}`);
  }
  return res.json();
}

export function downloadResultsUrl(sessionId: string): string {
  return `${API_BASE}/sequencing-assist/download-results/${sessionId}`;
}
