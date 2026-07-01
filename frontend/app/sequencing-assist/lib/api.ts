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
  ladder_type: string;
  mass: number;
  rel_i: number;
  rt: number;
  n_points: number;
}

export interface PipelineResponse {
  report: Record<string, unknown>;
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
  sigmoid_post_pipeline: SigmoidPostPoint[] | null;
  was_subsampled: boolean;
  n_original_points: number;
  n_pipeline_points: number;
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

// Single-phase endpoint used on Vercel: upload + full pipeline in one request.
export async function analyzeFile(
  file: File,
  referenceSequence = "",
): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  if (referenceSequence.trim()) form.append("reference_sequence", referenceSequence.trim());
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
