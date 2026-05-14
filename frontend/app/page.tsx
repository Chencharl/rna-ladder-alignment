"use client";

import { useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerLadder {
  ladder: string;
  n_iteration: number;
  first_rna_pos: number;
  start_pos: number;
  position_shift_correction: number;
  pos_adjusted: boolean;
  n_placed: number;
  n_rejected_positions: number;
  delta_mean: number;
  delta_std: number;
  max_abs_delta_jump: number;
  overall: string;
}

interface DirectionSummary {
  ladders: number;
  perfect: number;
  shifted: number;
  noisy_shifted: number;
  rejected: number;
  normal: number;
  position_adjusted: number;
  per_ladder: PerLadder[];
}

interface AlignResponse {
  summary: {
    "5prime": DirectionSummary;
    "3prime": DirectionSummary;
  };
  files: Record<string, string>; // filename → base64-encoded xlsx
}

type InputMode   = "sequence" | "csv";
type InputFormat = "empty" | "sequence" | "fasta" | "csv5" | "csv3" | "invalid";

interface TheoRow { pos: number; base: string; mass: number; }

interface RecognitionResult {
  format:    InputFormat;
  sequence:  string;       // cleaned 5′→3′ sequence (empty when invalid/empty)
  theo5:     TheoRow[];
  theo3:     TheoRow[];
  errorMsg?: string;
}

// ---------------------------------------------------------------------------
// Formula constants — mirror backend exactly
// ---------------------------------------------------------------------------

const RESIDUE_MASS: Record<string, number> = {
  A: 329.0525, U: 306.0253, C: 305.0413, G: 345.0474,
};
const TERM_MID: Record<string, number> = { "5": 97.9769, "3": -61.95579 };
const TERM_FULL = 18.0106;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Compute theoretical ladder rows for one direction from a 5′→3′ sequence. */
function computeTheoRows(seq5: string, direction: "5" | "3"): TheoRow[] {
  const s   = direction === "5" ? seq5 : Array.from(seq5).reverse().join("");
  const n   = s.length;
  const rows: TheoRow[] = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    const base = s[i];
    cum += RESIDUE_MASS[base] ?? 0;
    const terminal = i === n - 1 ? TERM_FULL : TERM_MID[direction];
    rows.push({ pos: i + 1, base, mass: Math.round((cum + terminal) * 1e5) / 1e5 });
  }
  return rows;
}

/** Strip FASTA headers, whitespace, digits, dashes; uppercase; T→U. */
function cleanSequence(raw: string): string {
  return raw
    .replace(/>.*(\n|$)/gm, "")
    .replace(/[\s\d\-.]/g, "")
    .toUpperCase()
    .replace(/T/g, "U");
}

/**
 * Parse whatever the user pasted and return a RecognitionResult.
 *
 * Detects:
 *   - "empty"    — nothing typed
 *   - "sequence" — plain A/U/G/C string
 *   - "fasta"    — starts with ">"
 *   - "csv5"     — CSV content with first column named "5'" (5′ direction)
 *   - "csv3"     — CSV content with first column named "3'" (3′ direction)
 *   - "invalid"  — something typed but unrecognisable / bad chars
 */
function parseInput(raw: string): RecognitionResult {
  const trimmed = raw.trim();
  if (!trimmed) return { format: "empty", sequence: "", theo5: [], theo3: [] };

  // ── Try CSV detection ────────────────────────────────────────────────────
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes(",")) {
    // Strip UTF-8 BOM from header if present
    const headerRaw = lines[0].replace(/^﻿/, "");
    const cols = headerRaw.split(",").map((c) => c.trim().replace(/"/g, ""));

    const massIdx = cols.findIndex((c) => c.toLowerCase() === "theo_mass");
    const posIdx  = cols.findIndex((c) => c.toLowerCase() === "position");
    const baseIdx = cols.findIndex(
      (c) => c === "5'" || c === "3'" || c === "5" || c === "3"
    );

    if (massIdx >= 0 && posIdx >= 0 && baseIdx >= 0) {
      const directionHeader = cols[baseIdx];
      const is5 = directionHeader.startsWith("5");

      const csvRows: TheoRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim().replace(/"/g, ""));
        const pos  = parseInt(parts[posIdx],  10);
        const mass = parseFloat(parts[massIdx]);
        const base = (parts[baseIdx] ?? "").toUpperCase();
        if (!isNaN(pos) && !isNaN(mass) && base) {
          csvRows.push({ pos, base, mass });
        }
      }

      if (csvRows.length > 0) {
        if (is5) {
          // 5′ CSV: bases are already in 5′→3′ order
          const seq = csvRows.map((r) => r.base).join("");
          return {
            format:   "csv5",
            sequence: seq,
            theo5:    csvRows,
            theo3:    computeTheoRows(seq, "3"),
          };
        } else {
          // 3′ CSV: bases are in 3′→5′ order → reverse to get 5′→3′
          const seq = csvRows.map((r) => r.base).slice().reverse().join("");
          return {
            format:   "csv3",
            sequence: seq,
            theo5:    computeTheoRows(seq, "5"),
            theo3:    csvRows,
          };
        }
      }
    }
  }

  // ── FASTA or plain sequence ───────────────────────────────────────────────
  const isFasta = trimmed.startsWith(">");
  const cleaned = cleanSequence(trimmed);

  if (cleaned.length === 0) {
    return { format: "invalid", sequence: "", theo5: [], theo3: [], errorMsg: "No valid bases found." };
  }

  const badChars = Array.from(new Set(Array.from(cleaned).filter((c: string) => !(c in RESIDUE_MASS))));
  if (badChars.length > 0) {
    return {
      format:   "invalid",
      sequence: cleaned,
      theo5:    [],
      theo3:    [],
      errorMsg: `Invalid characters: ${badChars.sort().join(", ")}`,
    };
  }
  if (cleaned.length < 4) {
    return {
      format:   "invalid",
      sequence: cleaned,
      theo5:    [],
      theo3:    [],
      errorMsg: "Sequence too short (minimum 4 nucleotides).",
    };
  }

  return {
    format:   isFasta ? "fasta" : "sequence",
    sequence: cleaned,
    theo5:    computeTheoRows(cleaned, "5"),
    theo3:    computeTheoRows(cleaned, "3"),
  };
}

/** Serialise TheoRow[] back to CSV text in the format the backend expects. */
function rowsToCSV(rows: TheoRow[], direction: "5" | "3"): string {
  const dirCol = `${direction}'`;
  const lines  = [`${dirCol},theo_mass,position`];
  for (const r of rows) {
    lines.push(`${r.base},${r.mass.toFixed(5)},${r.pos}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERALL_BADGE: Record<string, string> = {
  perfect:       "bg-green-100 text-green-800 border border-green-300",
  mixed:         "bg-emerald-100 text-emerald-800 border border-emerald-300",
  shifted:       "bg-orange-100 text-orange-800 border border-orange-300",
  noisy_shifted: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  noisy_mixed:   "bg-amber-100 text-amber-800 border border-amber-300",
  rejected:      "bg-gray-100 text-gray-600 border border-gray-300",
  normal:        "bg-blue-50 text-blue-700 border border-blue-200",
};

const FORMAT_META: Record<InputFormat, { label: string; color: string } | undefined> = {
  empty:    undefined,
  sequence: { label: "Plain sequence detected",  color: "bg-blue-100 text-blue-800 border border-blue-300" },
  fasta:    { label: "FASTA format detected",     color: "bg-indigo-100 text-indigo-800 border border-indigo-300" },
  csv5:     { label: "5′ theoretical CSV detected (masses preserved)", color: "bg-teal-100 text-teal-800 border border-teal-300" },
  csv3:     { label: "3′ theoretical CSV detected (masses preserved)", color: "bg-cyan-100 text-cyan-800 border border-cyan-300" },
  invalid:  { label: "Unrecognised input",        color: "bg-red-100 text-red-800 border border-red-300" },
};

const BASE_COLOR: Record<string, string> = {
  A: "text-green-700", U: "text-blue-700", G: "text-orange-700", C: "text-purple-700",
};

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function downloadFromBase64(b64: string, filename: string) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  onChange,
}: {
  mode: InputMode;
  onChange: (m: InputMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium mb-5">
      {(["sequence", "csv"] as InputMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 py-2 px-3 transition-colors ${
            mode === m
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {m === "sequence" ? "Paste / type input" : "Upload CSV files"}
        </button>
      ))}
    </div>
  );
}

/** Single mini-table showing first 3 + last row with an ellipsis in between. */
function TheoPreviewTable({
  rows,
  direction,
  fromCSV,
}: {
  rows: TheoRow[];
  direction: "5" | "3";
  fromCSV: boolean;
}) {
  if (rows.length === 0) return null;

  // first 3 rows + separator + last row (unless ≤ 4 total)
  type RowOrSep = TheoRow | null;
  const preview: RowOrSep[] =
    rows.length <= 4
      ? (rows as RowOrSep[])
      : ([...rows.slice(0, 3), null, rows[rows.length - 1]] as RowOrSep[]);

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        {direction}′ ladder{" "}
        <span className="font-normal text-gray-400">
          ({rows.length} positions
          {fromCSV ? ", masses from CSV" : ", masses computed"})
        </span>
      </h4>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-xs min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 w-10">Pos</th>
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 w-10">Base</th>
              <th className="px-3 py-1.5 text-right font-semibold text-gray-500">Theo mass (Da)</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((row, idx) =>
              row === null ? (
                <tr key="sep">
                  <td
                    colSpan={3}
                    className="px-3 py-0.5 text-center text-gray-300 text-base tracking-widest"
                  >
                    · · ·
                  </td>
                </tr>
              ) : (
                <tr key={row.pos} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{row.pos}</td>
                  <td className="px-3 py-1.5 font-mono font-bold">
                    <span className={BASE_COLOR[row.base] ?? "text-gray-700"}>
                      {row.base}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-700">
                    {row.mass.toFixed(5)}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Recognition result panel — shown below the textarea whenever input is non-empty. */
function RecognitionPanel({ recognition }: { recognition: RecognitionResult }) {
  if (recognition.format === "empty") return null;

  const meta = FORMAT_META[recognition.format];
  if (!meta) return null;

  const { sequence, format } = recognition;
  const bases = { A: 0, U: 0, G: 0, C: 0 } as Record<string, number>;
  for (let i = 0; i < sequence.length; i++) {
    const b = sequence[i];
    if (b in bases) bases[b]++;
  }

  const from5CSV = format === "csv5";
  const from3CSV = format === "csv3";

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      {/* Header row: badge + sequence stats */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span
          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${meta.color}`}
        >
          {meta.label}
        </span>
        {format !== "invalid" && sequence.length > 0 && (
          <>
            <span className="text-xs text-gray-500 font-mono">
              {sequence.length} nt
            </span>
            {(["A", "U", "G", "C"] as const).map((b) => (
              <span
                key={b}
                className={`text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 font-semibold ${BASE_COLOR[b]}`}
              >
                {b}&thinsp;{bases[b]}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Error message */}
      {recognition.errorMsg && (
        <p className="text-xs text-red-600 mb-3">{recognition.errorMsg}</p>
      )}

      {/* Hint for CSV input */}
      {(from5CSV || from3CSV) && (
        <p className="text-xs text-gray-500 mb-3">
          The pasted CSV masses are used for the{" "}
          <strong>{from5CSV ? "5′" : "3′"}</strong> direction. The{" "}
          <strong>{from5CSV ? "3′" : "5′"}</strong> direction masses are
          computed from the extracted sequence using the standard formula.
        </p>
      )}

      {/* Two-column preview tables */}
      {format !== "invalid" && (recognition.theo5.length > 0 || recognition.theo3.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TheoPreviewTable
            rows={recognition.theo5}
            direction="5"
            fromCSV={from5CSV}
          />
          <TheoPreviewTable
            rows={recognition.theo3}
            direction="3"
            fromCSV={from3CSV}
          />
        </div>
      )}
    </div>
  );
}

function SequenceInput({
  value,
  onChange,
  recognition,
}: {
  value: string;
  onChange: (v: string) => void;
  recognition: RecognitionResult;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-800 mb-1">
        Sequence / theoretical data
      </label>
      <p className="text-xs text-gray-400 mb-2">
        Paste a plain RNA sequence (5′→3′), a FASTA entry, or the contents of a
        theoretical mass CSV file. The system will recognise the format and
        preview both theoretical tables before you run the alignment.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={
          "GUCUACGGCCAUACCACCC…\n\nor FASTA:\n>MyRNA\nGUCUACGGCC…\n\nor paste a theo_5.csv / theo_3.csv file"
        }
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        spellCheck={false}
      />

      {/* Recognition panel — shown as soon as there is any input */}
      <RecognitionPanel recognition={recognition} />
    </div>
  );
}

function FileChooser({
  label,
  sublabel,
  accept,
  onChange,
}: {
  label: string;
  sublabel?: string;
  accept: string;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string>("");

  return (
    <div className="mb-5">
      <p className="text-sm font-medium text-gray-800 mb-0.5">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 mb-1">{sublabel}</p>}
      <div className="flex items-center gap-3">
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setChosen(f?.name ?? "");
            onChange(f);
          }}
        />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-gray-700 transition-colors flex-shrink-0"
        >
          Choose file
        </button>
        <span
          className={`text-sm truncate max-w-[220px] ${
            chosen ? "text-gray-700 font-medium" : "text-gray-400"
          }`}
        >
          {chosen || "No file chosen"}
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${colour}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

function DirectionPanel({ direction, data }: { direction: string; data: DirectionSummary }) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-bold text-gray-800 mb-3">
        {direction}′ Ladders
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({data.ladders} total)
        </span>
      </h3>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
        <StatCard label="Perfect"  value={data.perfect}           colour="bg-green-50 text-green-800 border-green-200" />
        <StatCard label="Shifted"  value={data.shifted}           colour="bg-orange-50 text-orange-800 border-orange-200" />
        <StatCard label="Noisy"    value={data.noisy_shifted}     colour="bg-yellow-50 text-yellow-800 border-yellow-200" />
        <StatCard label="Rejected" value={data.rejected}          colour="bg-gray-50 text-gray-700 border-gray-200" />
        <StatCard label="Normal"   value={data.normal}            colour="bg-blue-50 text-blue-800 border-blue-200" />
        <StatCard label="Pos adj"  value={data.position_adjusted} colour="bg-purple-50 text-purple-800 border-purple-200" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              {[
                "Ladder","Iter","RNA pos","Start","Shift",
                "Placed","Rejected","Δ mean","Δ std","Max jump","Classification",
              ].map((h) => (
                <th
                  key={h}
                  className="px-2.5 py-2 text-left font-semibold text-gray-600 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.per_ladder.map((row, idx) => (
              <tr key={row.ladder} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-2.5 py-1.5 font-mono font-medium text-gray-800">{row.ladder}</td>
                <td className="px-2.5 py-1.5 text-center">{row.n_iteration}</td>
                <td className="px-2.5 py-1.5 text-center">{row.first_rna_pos}</td>
                <td className="px-2.5 py-1.5 text-center">{row.start_pos}</td>
                <td className="px-2.5 py-1.5 text-center">
                  {row.position_shift_correction !== 0 ? (
                    <span className="text-amber-700 font-semibold">
                      {row.position_shift_correction > 0
                        ? `+${row.position_shift_correction}`
                        : row.position_shift_correction}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-center">{row.n_placed}</td>
                <td className="px-2.5 py-1.5 text-center">
                  {row.n_rejected_positions > 0 ? (
                    <span className="text-red-600 font-semibold">{row.n_rejected_positions}</span>
                  ) : (
                    row.n_rejected_positions
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono">{row.delta_mean.toFixed(4)}</td>
                <td className="px-2.5 py-1.5 text-right font-mono">{row.delta_std.toFixed(4)}</td>
                <td className="px-2.5 py-1.5 text-right font-mono">{row.max_abs_delta_jump.toFixed(4)}</td>
                <td className="px-2.5 py-1.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                      OVERALL_BADGE[row.overall] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {row.overall.replace(/_/g, " ").toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigField({
  label, hint, value, step, isInt, onChange,
}: {
  label: string; hint: string; value: number; step: number; isInt: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
      <p className="text-xs text-gray-400 mb-1">{hint}</p>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) =>
          onChange(isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value))
        }
        className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  // ── Input mode ────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>("sequence");

  // Sequence/paste state
  const [rnaSequence, setRnaSequence] = useState("");

  // CSV-upload state
  const [theo5File, setTheo5File] = useState<File | null>(null);
  const [theo3File, setTheo3File] = useState<File | null>(null);

  // Common state
  const [ladderFile, setLadderFile] = useState<File | null>(null);
  const [sampleName, setSampleName] = useState("Sample");

  // Config state (mirrors AlignConfig defaults)
  const [showConfig,   setShowConfig]   = useState(false);
  const [reject5p,     setReject5p]     = useState(-19.0);
  const [reject3p,     setReject3p]     = useState(-1.0);
  const [strictAbs,    setStrictAbs]    = useState(0.09);
  const [strictRun,    setStrictRun]    = useState(3);
  const [shiftedDiff,  setShiftedDiff]  = useState(0.6);
  const [shiftedRun,   setShiftedRun]   = useState(4);
  const [noisyJump,    setNoisyJump]    = useState(50.0);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<AlignResponse | null>(null);

  // ── Recognition — derived from rnaSequence, memoised ─────────────────
  const recognition = useMemo(() => parseInput(rnaSequence), [rnaSequence]);

  // ── Readiness check ───────────────────────────────────────────────────
  const seqReady =
    inputMode === "sequence" &&
    recognition.format !== "empty" &&
    recognition.format !== "invalid";

  const csvReady =
    inputMode === "csv" && theo5File !== null && theo3File !== null;

  const allReady = Boolean(ladderFile) && (seqReady || csvReady);

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allReady || !ladderFile) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("ladder_file",            ladderFile);
    form.append("sample_name",            sampleName);
    form.append("reject_below_5p",        String(reject5p));
    form.append("reject_below_3p",        String(reject3p));
    form.append("strict_abs_da",          String(strictAbs));
    form.append("strict_min_run",         String(strictRun));
    form.append("stable_offset_diff_da",  String(shiftedDiff));
    form.append("stable_offset_min_run",  String(shiftedRun));
    form.append("noisy_jump_da",          String(noisyJump));

    if (inputMode === "sequence") {
      const fmt = recognition.format;
      if (fmt === "sequence" || fmt === "fasta") {
        // Send the cleaned sequence; backend computes both theoretical tables.
        form.append("rna_sequence", recognition.sequence);
      } else if (fmt === "csv5" || fmt === "csv3") {
        // CSV paste: one direction uses masses from the pasted data,
        // the other uses masses computed from the extracted sequence.
        // Package both as File blobs and send via the theo-CSV parameters.
        const csv5Text = rowsToCSV(recognition.theo5, "5");
        const csv3Text = rowsToCSV(recognition.theo3, "3");
        form.append(
          "theo5_file",
          new File([csv5Text], "theo5.csv", { type: "text/csv" })
        );
        form.append(
          "theo3_file",
          new File([csv3Text], "theo3.csv", { type: "text/csv" })
        );
      }
    } else {
      // Upload-CSV mode (unchanged)
      if (theo5File) form.append("theo5_file", theo5File);
      if (theo3File) form.append("theo3_file", theo3File);
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const resp   = await fetch(`${apiUrl}/align`, { method: "POST", body: form });

      if (!resp.ok) {
        let msg = `Server error ${resp.status}`;
        try {
          const data = await resp.json();
          if (typeof data?.detail === "string") {
            msg = data.detail;
          } else if (Array.isArray(data?.detail?.validation_errors)) {
            msg =
              "Validation failed: " +
              (data.detail.validation_errors as string[]).join("; ");
          } else if (data?.detail) {
            msg = JSON.stringify(data.detail);
          }
        } catch { /* ignore json parse error */ }
        throw new Error(msg);
      }

      setResult((await resp.json()) as AlignResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Not-ready hint ────────────────────────────────────────────────────
  function notReadyHint(): string {
    if (!ladderFile) return "Upload the ladder data file to continue.";
    if (inputMode === "csv") return "Upload both 5′ and 3′ CSV files.";
    if (recognition.format === "empty") return "Paste a sequence or CSV content above.";
    if (recognition.format === "invalid")
      return recognition.errorMsg ?? "Fix the input errors above.";
    return "";
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            RNA Ladder Alignment
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload your ladder data, supply the RNA sequence or theoretical CSV
            files, then click <strong>Run Alignment</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

            {/* ── Input panel ─────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
                Input Files
              </h2>

              {/* Ladder file — always required */}
              <FileChooser
                label="Ladder data"
                sublabel="blind_sequencing_result_point_version.xlsx — Sheet1"
                accept=".xlsx"
                onChange={setLadderFile}
              />

              <hr className="border-gray-100 my-4" />

              {/* Mode toggle */}
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Theoretical Sequence
              </p>
              <ModeToggle
                mode={inputMode}
                onChange={(m) => {
                  setInputMode(m);
                  setError(null);
                }}
              />

              {/* Option A — paste / type */}
              {inputMode === "sequence" && (
                <SequenceInput
                  value={rnaSequence}
                  onChange={setRnaSequence}
                  recognition={recognition}
                />
              )}

              {/* Option B — upload CSVs */}
              {inputMode === "csv" && (
                <div>
                  <p className="text-xs text-gray-400 mb-3">
                    For sequences with non-standard modifications, or if you
                    already have pre-computed theoretical mass tables.
                  </p>
                  <FileChooser
                    label="5′ theoretical sequence (.csv)"
                    sublabel="Columns: position, theo_mass"
                    accept=".csv"
                    onChange={setTheo5File}
                  />
                  <FileChooser
                    label="3′ theoretical sequence (.csv)"
                    sublabel="Columns: position, theo_mass"
                    accept=".csv"
                    onChange={setTheo3File}
                  />
                </div>
              )}

              <hr className="border-gray-100 my-4" />

              {/* Sample label */}
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">
                  Sample label
                </label>
                <input
                  type="text"
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  placeholder="Sample"
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Used in output filenames and the Excel sheet title.
                </p>
              </div>
            </div>

            {/* ── Settings panel ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                className="w-full flex items-center justify-between mb-1"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Analysis Settings
                </span>
                <span className="text-gray-400 text-sm">
                  {showConfig ? "▲ collapse" : "▼ expand"}
                </span>
              </button>
              {!showConfig && (
                <p className="text-xs text-gray-400 mt-2">
                  Default values match the original pipeline. Expand only if you
                  need to adjust thresholds.
                </p>
              )}
              {showConfig && (
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <ConfigField
                    label="5′ reject below (Da)"
                    hint="Dehydration artifact = −18.01 Da. Default −19 gives a safe margin."
                    value={reject5p} step={1} isInt={false} onChange={setReject5p}
                  />
                  <ConfigField
                    label="3′ reject below (Da)"
                    hint="3′ fragments are shorter; tighter window avoids false rejections."
                    value={reject3p} step={0.5} isInt={false} onChange={setReject3p}
                  />
                  <ConfigField
                    label="|Δmass| window for PERFECT (Da)"
                    hint="Instrument mass accuracy. 0.09 Da = 90 mDa."
                    value={strictAbs} step={0.01} isInt={false} onChange={setStrictAbs}
                  />
                  <ConfigField
                    label="Min consecutive positions — PERFECT"
                    hint="At least this many adjacent positions must be within the window."
                    value={strictRun} step={1} isInt={true} onChange={setStrictRun}
                  />
                  <ConfigField
                    label="Max Δmass variation — SHIFTED (Da)"
                    hint="< 0.6 Da between adjacent positions = consistent systematic shift."
                    value={shiftedDiff} step={0.1} isInt={false} onChange={setShiftedDiff}
                  />
                  <ConfigField
                    label="Min consecutive positions — SHIFTED"
                    hint="At least this many adjacent positions must hold the shift."
                    value={shiftedRun} step={1} isInt={true} onChange={setShiftedRun}
                  />
                  <ConfigField
                    label="Single-step jump threshold — NOISY (Da)"
                    hint="Jumps above this downgrade SHIFTED → NOISY SHIFTED."
                    value={noisyJump} step={5} isInt={false} onChange={setNoisyJump}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 mb-6">
            <button
              type="submit"
              disabled={!allReady || loading}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Running alignment…
                </span>
              ) : (
                "Run Alignment"
              )}
            </button>
            {!allReady && !loading && (
              <p className="text-sm text-gray-400">{notReadyHint()}</p>
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <strong className="font-semibold">Error: </strong>{error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-5">Results</h2>

            {/* Download buttons */}
            <div className="flex flex-wrap gap-3 mb-7">
              {Object.entries(result.files).map(([filename, b64]) => (
                <button
                  key={filename}
                  onClick={() => downloadFromBase64(b64, filename)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  {filename}
                </button>
              ))}
            </div>

            <hr className="border-gray-100 mb-6" />

            <DirectionPanel direction="5" data={result.summary["5prime"]} />
            <DirectionPanel direction="3" data={result.summary["3prime"]} />
          </div>
        )}
      </div>
    </main>
  );
}
