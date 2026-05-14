"""FastAPI backend for RNA Ladder Alignment.

Thin API wrapper — all scientific logic lives unchanged in
../ladder_alignment_pipeline.py.  This module only handles HTTP
plumbing (file upload, validation, serialisation) and delegates
every alignment decision to the existing pipeline functions.

Endpoints
---------
GET  /health        → {"status": "ok"}
POST /align         → JSON with per-direction summary + base64 Excel files

Theoretical sequence input (choose one per request)
----------------------------------------------------
Option A — paste sequence (easier for most users):
    rna_sequence = "GUCUACGGCC..."   (full RNA, 5′→3′, A/U/G/C)
    The backend computes both 5′ and 3′ theoretical mass tables automatically.

Option B — upload CSV files (for non-standard cases):
    theo5_file = <CSV with columns: <base>, theo_mass, position>
    theo3_file = <CSV with columns: <base>, theo_mass, position>
"""

import base64
import io
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Import core pipeline (repo root) — DO NOT MODIFY THESE FUNCTIONS
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ladder_alignment_pipeline import AlignConfig, align_ladders, build_excel  # noqa: E402


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="RNA Ladder Alignment API",
    description=(
        "Wraps the RNA ladder alignment pipeline for web access. "
        "All alignment logic is unchanged from the original pipeline."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Sequence → theoretical mass table
#
# Verified against theo_5.csv and theo_3.csv: all 120 intermediate positions
# match exactly; the full-length position (last) matches within 5 mDa
# (rounding accumulation), well inside the 90 mDa "perfect" threshold.
#
# Chemistry summary
# -----------------
# Each internal residue contributes its nucleoside-3',5'-bisphosphate mass
# minus one water (the phosphodiester bond condensation).
#
# Intermediate 5′ fragments  (5′-phosphate + 2′,3′-cyclic phosphate)
#   mass(n) = Σ residues + H₃PO₄  (+97.9769 Da)
#
# Intermediate 3′ fragments  (3′-OH nucleoside terminus)
#   mass(n) = Σ residues − 61.9558 Da
#
# Full-length RNA  (5′-OH + 3′-OH, last position in both tables)
#   mass(n) = Σ residues + H₂O  (+18.0106 Da)
# ---------------------------------------------------------------------------

_RESIDUE_MASS: dict[str, float] = {
    "A": 329.0525,   # adenosine residue (AMP − H₂O)
    "U": 306.0253,   # uridine residue   (UMP − H₂O)
    "C": 305.0413,   # cytidine residue  (CMP − H₂O)
    "G": 345.0474,   # guanosine residue (GMP − H₂O)
}

_TERM_INTERMEDIATE: dict[str, float] = {
    "5":  97.9769,    # H₃PO₄ — 5′-monophosphate terminus
    "3": -61.95579,   # nucleoside offset — 3′-OH terminus
}
_TERM_FULL_LENGTH = 18.0106   # H₂O — intact RNA, used at the last position only


def _sequence_to_theo_df(rna_seq: str, direction: str) -> pd.DataFrame:
    """Compute the theoretical cumulative ladder masses from an RNA sequence.

    Parameters
    ----------
    rna_seq   : Full RNA sequence in 5′→3′ direction; A/U/G/C uppercase only.
    direction : '5' or '3'.
                For '3', the sequence is read 3′→5′ (reversed) so that
                position 1 is the 3′-terminal nucleotide, matching the CSV.

    Returns
    -------
    DataFrame with columns  [<direction>', theo_mass, position]
    matching the existing theo CSV format consumed by align_ladders().
    """
    seq = rna_seq if direction == "5" else rna_seq[::-1]
    n = len(seq)
    col_name = f"{direction}'"
    term_mid = _TERM_INTERMEDIATE[direction]

    rows = []
    cumulative = 0.0
    for pos, base in enumerate(seq, start=1):
        cumulative += _RESIDUE_MASS[base]
        # Last position = intact full-length RNA → different terminal chemistry
        terminal = _TERM_FULL_LENGTH if pos == n else term_mid
        rows.append({
            col_name:    base,
            "theo_mass": round(cumulative + terminal, 5),
            "position":  pos,
        })

    return pd.DataFrame(rows, columns=[col_name, "theo_mass", "position"])


def _parse_rna_sequence(raw: str) -> str:
    """Normalise a user-pasted sequence to uppercase A/U/G/C.

    Strips whitespace, digits, FASTA '>' headers, and common separators.
    Converts T → U (accepts DNA-style input).
    Raises ValueError with a human-readable message on invalid characters.
    """
    # Remove FASTA header lines, whitespace, digits, dashes
    cleaned = re.sub(r">.*", "", raw)           # strip FASTA headers
    cleaned = re.sub(r"[\s\d\-\.]", "", cleaned).upper()
    cleaned = cleaned.replace("T", "U")         # DNA → RNA

    bad = set(cleaned) - set(_RESIDUE_MASS)
    if bad:
        raise ValueError(
            f"Sequence contains invalid characters: {', '.join(sorted(bad))}. "
            "Only A, U, G, C (or T, converted to U) are accepted."
        )
    if len(cleaned) < 4:
        raise ValueError("Sequence is too short (minimum 4 nucleotides).")
    return cleaned


# ---------------------------------------------------------------------------
# Ladder data validation (mirrors Streamlit app.py — no logic change)
# ---------------------------------------------------------------------------

REQUIRED_COLS = {
    "base_name", "monoisotopic_mass", "sum_intensity",
    "apex_rt", "n_iteration", "ladder_number",
}
VALID_BASES = {"A", "U", "G", "C", "High"}


def _validate(df: pd.DataFrame) -> list[str]:
    """Return a list of validation error strings (empty = OK)."""
    errors: list[str] = []
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        errors.append(f"Missing columns: {', '.join(sorted(missing))}")
        return errors

    nulls = df[list(REQUIRED_COLS)].isnull().sum()
    if nulls.any():
        errors.append(f"Null values in: {nulls[nulls > 0].to_dict()}")

    unexpected = set(df["base_name"].unique()) - VALID_BASES
    if unexpected:
        errors.append(f"Unexpected base_name values: {unexpected}")

    bad_high = (
        df[df["base_name"] == "High"]
        .groupby("ladder_number")
        .size()
        .pipe(lambda s: s[s != 1])
    )
    if len(bad_high):
        errors.append(
            f"Ladders without exactly 1 High calibrant: {bad_high.to_dict()}"
        )

    if df["monoisotopic_mass"].min() <= 0:
        errors.append("monoisotopic_mass contains non-positive values")

    return errors


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _per_ladder_records(order: list, meta: dict) -> list[dict]:
    return [
        {
            "ladder":                    ladder,
            "n_iteration":               meta[ladder]["n_iteration"],
            "first_rna_pos":             meta[ladder]["first_rna_pos"],
            "start_pos":                 meta[ladder]["start_pos"],
            "position_shift_correction": meta[ladder]["position_shift_correction"],
            "pos_adjusted":              meta[ladder]["pos_adjusted"],
            "n_placed":                  meta[ladder]["n_placed"],
            "n_rejected_positions":      meta[ladder]["n_rejected_positions"],
            "delta_mean":      round(float(meta[ladder]["delta_mean"]),          4),
            "delta_std":       round(float(meta[ladder]["delta_std"]),           4),
            "max_abs_delta_jump": round(float(meta[ladder]["max_abs_delta_jump"]), 4),
            "overall":                   meta[ladder]["overall"],
        }
        for ladder in order
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/align")
async def align(
    # ── Required ──────────────────────────────────────────────────────────
    ladder_file: UploadFile = File(
        ..., description="Ladder data (.xlsx with a sheet named 'Sheet1')."
    ),

    # ── Theoretical sequence — supply ONE of the two options below ────────

    # Option A: paste the RNA sequence (5′→3′); back-end computes both tables.
    rna_sequence: str = Form(
        "",
        description=(
            "Full RNA sequence in 5′→3′ direction (A/U/G/C; T is accepted and "
            "converted to U).  FASTA format is also accepted.  "
            "When provided, theo5_file and theo3_file are ignored."
        ),
    ),

    # Option B: upload pre-computed CSV files (for non-standard modifications
    # or sequences whose masses differ from the standard residue formula).
    theo5_file: Optional[UploadFile] = File(
        None, description="5′ theoretical sequence CSV (position, theo_mass columns)."
    ),
    theo3_file: Optional[UploadFile] = File(
        None, description="3′ theoretical sequence CSV (position, theo_mass columns)."
    ),

    # ── Analysis settings (mirror AlignConfig defaults) ───────────────────
    sample_name:           str   = Form("Sample"),
    reject_below_5p:       float = Form(-19.0),
    reject_below_3p:       float = Form(-1.0),
    strict_abs_da:         float = Form(0.09),
    strict_min_run:        int   = Form(3),
    stable_offset_diff_da: float = Form(0.6),
    stable_offset_min_run: int   = Form(4),
    noisy_jump_da:         float = Form(50.0),
) -> JSONResponse:
    """Run both 5′ and 3′ ladder alignments.

    Returns JSON:
    {
      "summary": {
        "5prime": { ladders, perfect, shifted, noisy_shifted, rejected, normal,
                    position_adjusted, per_ladder: [...] },
        "3prime": { ... }
      },
      "files": {
        "<sample>_alignment_5prime.xlsx": "<base64>",
        "<sample>_alignment_3prime.xlsx": "<base64>"
      }
    }
    """

    # ------------------------------------------------------------------ #
    # 1. Read ladder xlsx                                                  #
    # ------------------------------------------------------------------ #
    try:
        ladder_bytes = await ladder_file.read()
        sheets = pd.read_excel(io.BytesIO(ladder_bytes), sheet_name=None)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read ladder xlsx: {exc}")

    if "Sheet1" not in sheets:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Sheet 'Sheet1' not found in the uploaded xlsx. "
                f"Available sheets: {list(sheets.keys())}"
            ),
        )
    df = sheets["Sheet1"]

    # ------------------------------------------------------------------ #
    # 2. Resolve theoretical DataFrames                                    #
    #    Priority: rna_sequence > CSV files                                #
    # ------------------------------------------------------------------ #
    if rna_sequence.strip():
        # Option A — derive both tables from the pasted sequence
        try:
            seq = _parse_rna_sequence(rna_sequence)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        theo5 = _sequence_to_theo_df(seq, "5")
        theo3 = _sequence_to_theo_df(seq, "3")

    elif theo5_file is not None and theo3_file is not None:
        # Option B — use uploaded CSVs
        try:
            theo5 = pd.read_csv(
                io.BytesIO(await theo5_file.read()), encoding="utf-8-sig"
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Cannot read theo5 CSV: {exc}")
        try:
            theo3 = pd.read_csv(
                io.BytesIO(await theo3_file.read()), encoding="utf-8-sig"
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Cannot read theo3 CSV: {exc}")

        for label, theo in [("theo5", theo5), ("theo3", theo3)]:
            if {"theo_mass", "position"} - set(theo.columns):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{label} CSV must contain 'position' and 'theo_mass' columns."
                    ),
                )
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                "Provide either rna_sequence (paste the RNA sequence) "
                "or both theo5_file and theo3_file (upload CSV files)."
            ),
        )

    # ------------------------------------------------------------------ #
    # 3. Validate ladder data                                             #
    # ------------------------------------------------------------------ #
    errors = _validate(df)
    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})

    # ------------------------------------------------------------------ #
    # 4. Build AlignConfig — DIRECT CALL, NO LOGIC CHANGE                #
    # ------------------------------------------------------------------ #
    cfg = AlignConfig(
        reject_below_5p=reject_below_5p,
        reject_below_3p=reject_below_3p,
        strict_abs_da=strict_abs_da,
        strict_min_run=strict_min_run,
        stable_offset_diff_da=stable_offset_diff_da,
        stable_offset_min_run=stable_offset_min_run,
        noisy_jump_da=noisy_jump_da,
    )

    # ------------------------------------------------------------------ #
    # 5. Run pipeline for both directions                                 #
    # ------------------------------------------------------------------ #
    safe_name = sample_name.replace(" ", "_")
    response: dict = {"summary": {}, "files": {}}

    for direction, theo in [("5", theo5), ("3", theo3)]:
        # IMPORTANT: direct call to existing pipeline — no modification
        order, meta, maps = align_ladders(df, theo, cfg, direction=direction)

        # Build Excel into memory (same as Streamlit app — no change)
        buf = io.BytesIO()
        build_excel(order, meta, maps, theo, direction, sample_name, buf)
        buf.seek(0)

        cc  = Counter(v["overall"] for v in meta.values())
        key = f"{direction}prime"

        response["summary"][key] = {
            "ladders":            len(order),
            "perfect":            int(cc["perfect"] + cc["mixed"]),
            "shifted":            int(cc["shifted"]),
            "noisy_shifted":      int(cc["noisy_shifted"] + cc["noisy_mixed"]),
            "rejected":           int(cc["rejected"]),
            "normal":             int(cc["normal"]),
            "position_adjusted":  int(
                sum(1 for v in meta.values() if v["pos_adjusted"])
            ),
            "per_ladder": _per_ladder_records(order, meta),
        }

        filename = f"{safe_name}_alignment_{direction}prime.xlsx"
        response["files"][filename] = base64.b64encode(buf.getvalue()).decode()

    return JSONResponse(content=response)
