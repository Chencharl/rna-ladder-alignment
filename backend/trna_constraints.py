"""tRNA-suite-inspired QC helpers for RNA ladder workflows.

These helpers intentionally sit outside the existing ladder alignment core.
They add optional preprocessing/QC behavior without changing
``ladder_alignment_pipeline.align_ladders``.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import floor
import re
from typing import Sequence

import pandas as pd


NATURAL_5P_OFFSET = 97.9769
SYNTHETIC_5P_OFFSET = 18.015
TERM_3P_OFFSET = -61.95579
TERM_FULL_LENGTH = 18.0106

CANONICAL_RESIDUE_MASS: dict[str, float] = {
    "A": 329.0525,
    "U": 306.0253,
    "C": 305.0413,
    "G": 345.0474,
}

BUILTIN_RESIDUE_MASS: dict[str, float] = {
    **CANONICAL_RESIDUE_MASS,
    "D": 308.04095,
    "mA": 343.06817,
    "I": 330.03654,
    "m1I": 344.052,
    "m6t6A": 488.10568,
    "ms2t6A": 520.07775,
    "i6A": 397.11512,
    "t6A": 474.09003,
    "mC": 319.05694,
    "Cm": 319.05694,
    "ac4C": 347.05185,
    "f5Cm": 347.05185,
    "hm5Cm": 349.0675,
    "mG": 359.06308,
    "m7G": 359.06308,
    "Gm": 359.06308,
    "m22G": 373.07873,
    "Q": 471.11551,
    "manQ": 633.16834,
    "GalQ": 633.16834,
    "o2yW": 602.13737,
    "OHyW": 586.14246,
    "yW": 212.0106,
    "Ψ": 572.18278,
    "Um": 320.04095,
    "mU": 320.04095,
    "acp3U": 407.07298,
    "ncm5U": 363.04677,
    "mcm5U": 378.04643,
    "mcm5s2U": 394.02359,
    "mchm5U": 394.02359,
    "m5Um": 334.0566,
    "mcm5Um": 330.03654,
}

BUILTIN_BASE_MAP: dict[str, str] = {
    "A": "A",
    "U": "U",
    "C": "C",
    "G": "G",
    "D": "U",
    "mA": "A",
    "I": "A",
    "m1I": "A",
    "m6t6A": "A",
    "ms2t6A": "A",
    "i6A": "A",
    "t6A": "A",
    "mC": "C",
    "Cm": "C",
    "ac4C": "C",
    "f5Cm": "C",
    "hm5Cm": "C",
    "mG": "G",
    "m7G": "G",
    "Gm": "G",
    "m22G": "G",
    "Q": "G",
    "manQ": "G",
    "GalQ": "G",
    "o2yW": "G",
    "OHyW": "G",
    "yW": "G",
    "Ψ": "U",
    "Um": "U",
    "mU": "U",
    "acp3U": "U",
    "ncm5U": "U",
    "mcm5U": "U",
    "mcm5s2U": "U",
    "mchm5U": "U",
    "m5Um": "U",
    "mcm5Um": "U",
}


@dataclass(frozen=True)
class ResidueDictionary:
    masses: dict[str, float]
    bases: dict[str, str]
    aliases: dict[str, str]
    warnings: tuple[str, ...] = ()

    def canonical_token(self, token: str) -> str:
        return self.aliases.get(token, token)

    def mass(self, token: str) -> float:
        key = self.canonical_token(token)
        if key not in self.masses:
            raise ValueError(f"Unknown residue token {token!r}; no mass is defined.")
        return self.masses[key]

    def base(self, token: str) -> str:
        key = self.canonical_token(token)
        if key not in self.bases:
            raise ValueError(f"Unknown residue token {token!r}; no canonical base is defined.")
        return self.bases[key]


def default_residue_dictionary() -> ResidueDictionary:
    return ResidueDictionary(
        masses=dict(BUILTIN_RESIDUE_MASS),
        bases=dict(BUILTIN_BASE_MAP),
        aliases={"T": "U"},
    )


def residue_dictionary_from_table(table: pd.DataFrame | None) -> ResidueDictionary:
    """Build a strict residue dictionary from a Sheet2-style table.

    Supported columns:
    - Symbol: optional alias used in sequence/reference sheets.
    - Nucleotide: residue token to define or alias to.
    - Base: canonical A/C/G/U family for the residue.
    - Mass: optional custom monoisotopic residue mass.

    If Mass is absent for a Nucleotide, the Nucleotide must already be known.
    Unknown residues never fall back to guessed canonical masses.
    """
    base = default_residue_dictionary()
    masses = dict(base.masses)
    bases = dict(base.bases)
    aliases = dict(base.aliases)
    warnings: list[str] = []

    if table is None or table.empty:
        return base

    for row_no, row in table.fillna("").iterrows():
        symbol = str(row.get("Symbol", "")).strip()
        nucleotide = str(row.get("Nucleotide", "")).strip()
        base_name = str(row.get("Base", "")).strip().upper()
        mass_raw = row.get("Mass", row.get("mass", ""))

        if not symbol and not nucleotide:
            continue
        token = nucleotide or symbol
        mass = None
        if mass_raw != "":
            try:
                mass = float(mass_raw)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid Mass at modification row {row_no + 2}: {mass_raw!r}") from exc
            if mass <= 0:
                raise ValueError(f"Modification Mass must be positive at row {row_no + 2}.")

        known_token = token in masses
        if mass is None and not known_token:
            raise ValueError(
                f"Modification row {row_no + 2} defines {token!r} without a Mass, "
                "and it is not a built-in residue."
            )
        if base_name and base_name not in CANONICAL_RESIDUE_MASS:
            raise ValueError(f"Invalid Base at modification row {row_no + 2}: {base_name!r}")

        if mass is not None:
            masses[token] = mass
        if base_name:
            bases[token] = base_name
        elif token not in bases:
            raise ValueError(
                f"Modification row {row_no + 2} defines {token!r} without Base; "
                "custom residues must declare A/C/G/U family."
            )

        if symbol and nucleotide:
            aliases[symbol] = nucleotide
            if mass is not None and nucleotide != symbol:
                masses[nucleotide] = mass
            if base_name:
                bases[nucleotide] = base_name
        elif symbol and symbol not in masses:
            warnings.append(f"Symbol {symbol!r} has no Mass; treated only as an alias if referenced.")

    return ResidueDictionary(masses=masses, bases=bases, aliases=aliases, warnings=tuple(warnings))


def normalise_sequence_tokens(raw: str, residues: ResidueDictionary) -> list[str]:
    """Parse canonical or tokenized RNA input with strict residue validation."""
    without_headers = "\n".join(
        line for line in raw.splitlines() if not line.lstrip().startswith(">")
    )
    cleaned = without_headers.strip()
    compact = re.sub(r"[\s\d\-\.]", "", cleaned).upper().replace("T", "U")
    if compact and set(compact) <= {"A", "C", "G", "U"}:
        tokens = list(compact)
    elif any(sep in cleaned for sep in [",", " ", "\t", "\n"]):
        tokens = [
            tok.strip()
            for chunk in re.sub(r"[\d\-\.]", "", cleaned).replace(",", " ").splitlines()
            for tok in chunk.split()
            if tok.strip()
        ]
    else:
        tokens = list(cleaned.upper().replace("T", "U"))

    normalized = [residues.canonical_token(tok) for tok in tokens]
    unknown = sorted({tok for tok in normalized if tok not in residues.masses})
    if unknown:
        raise ValueError(
            f"Sequence contains unknown residue tokens: {', '.join(unknown)}. "
            "Provide a modification mass dictionary or precomputed theoretical CSVs."
        )
    if len(normalized) < 4:
        raise ValueError("Sequence is too short (minimum 4 nucleotides).")
    return normalized


def sequence_to_theoretical_df(
    sequence_tokens: Sequence[str],
    direction: str,
    residues: ResidueDictionary | None = None,
    sample_type: str = "natural_RNA",
) -> pd.DataFrame:
    """Compute theoretical mass rows for canonical or modified RNA tokens."""
    residues = residues or default_residue_dictionary()
    if sample_type not in {"natural_RNA", "synthetic_RNA"}:
        raise ValueError("sample_type must be 'natural_RNA' or 'synthetic_RNA'.")
    seq = list(sequence_tokens if direction == "5" else reversed(sequence_tokens))
    col_name = f"{direction}'"
    term_mid = (
        SYNTHETIC_5P_OFFSET
        if direction == "5" and sample_type == "synthetic_RNA"
        else NATURAL_5P_OFFSET
        if direction == "5"
        else TERM_3P_OFFSET
    )

    rows: list[dict] = []
    cumulative = 0.0
    for pos, token in enumerate(seq, start=1):
        canonical = residues.canonical_token(token)
        cumulative += residues.mass(canonical)
        terminal = TERM_FULL_LENGTH if pos == len(seq) else term_mid
        rows.append({
            col_name: canonical,
            "theo_mass": round(cumulative + terminal, 5),
            "position": pos,
        })
    return pd.DataFrame(rows, columns=[col_name, "theo_mass", "position"])


def read_peak_table(table: pd.DataFrame) -> list[dict]:
    """Parse raw peak rows, preserving a stable peak_id independent of rounded mass."""
    cols = {str(c).strip().lower(): c for c in table.columns}

    def pick(*names: str) -> str | None:
        for name in names:
            if name.lower() in cols:
                return cols[name.lower()]
        return None

    mass_col = pick("Monoisotopic Mass", "monoisotopic_mass", "Mass", "mass")
    intensity_col = pick("Sum Intensity", "sum_intensity", "Intensity", "intensity")
    rt_col = pick("Apex RT", "apex_rt", "RT", "rt")
    if mass_col is None or intensity_col is None:
        raise ValueError("Raw peak table must include mass and intensity columns.")

    peaks: list[dict] = []
    for row_id, row in table.iterrows():
        mass = pd.to_numeric(row.get(mass_col), errors="coerce")
        intensity = pd.to_numeric(row.get(intensity_col), errors="coerce")
        rt = pd.to_numeric(row.get(rt_col), errors="coerce") if rt_col else None
        if pd.isna(mass) or pd.isna(intensity):
            continue
        if float(mass) <= 0 or float(intensity) <= 0:
            continue
        peaks.append({
            "peak_id": int(row_id),
            "mass": float(mass),
            "intensity": float(intensity),
            "rt": None if rt is None or pd.isna(rt) else float(rt),
        })
    peaks.sort(key=lambda p: p["mass"])
    return peaks


def ppm_match(obs: float, theo: float, ppm: float) -> bool:
    return abs(obs - theo) / theo * 1_000_000 <= ppm


def find_best_peak(target_mass: float, peaks: Sequence[dict], ppm: float) -> dict | None:
    tol = target_mass * ppm / 1_000_000
    lo, hi = target_mass - tol, target_mass + tol
    candidates = [p for p in peaks if lo <= p["mass"] <= hi]
    if not candidates:
        return None
    return max(candidates, key=lambda p: (p["intensity"], -abs(p["mass"] - target_mass)))


def raw_peak_qc(
    peaks: Sequence[dict],
    theo5: pd.DataFrame,
    theo3: pd.DataFrame,
    ppm: float = 10.0,
    mass_min: float = 800.0,
    mass_max: float = 30000.0,
) -> dict:
    used_counts: dict[int, int] = {}
    matched_rows: list[dict] = []
    matched_pos5: set[int] = set()
    n_positions = int(max(theo5["position"].max(), theo3["position"].max()))

    for direction, theo in [("5", theo5), ("3", theo3)]:
        base_col = "5'" if direction == "5" else "3'"
        for _, row in theo.iterrows():
            pos = int(row["position"])
            theo_mass = float(row["theo_mass"])
            hit = find_best_peak(theo_mass, peaks, ppm)
            pos5 = pos if direction == "5" else n_positions - pos + 1
            record = {
                "direction": direction,
                "position": pos,
                "pos5": pos5,
                "base": str(row.get(base_col, "")),
                "theoretical_mass": round(theo_mass, 5),
                "actual_mass": None,
                "delta_mass": None,
                "intensity": None,
                "rt": None,
                "peak_id": None,
                "peak_reuse_count": 0,
                "status": "Not Matched",
            }
            if hit is not None:
                pid = int(hit["peak_id"])
                used_counts[pid] = used_counts.get(pid, 0) + 1
                matched_pos5.add(pos5)
                record.update({
                    "actual_mass": round(float(hit["mass"]), 5),
                    "delta_mass": round(float(hit["mass"]) - theo_mass, 5),
                    "intensity": float(hit["intensity"]),
                    "rt": hit.get("rt"),
                    "peak_id": pid,
                    "status": "Matched: Exact",
                })
            matched_rows.append(record)

    for row in matched_rows:
        if row["peak_id"] is not None:
            row["peak_reuse_count"] = used_counts[int(row["peak_id"])]

    used_ids = set(used_counts)
    unmatched = [
        p for p in peaks
        if int(p["peak_id"]) not in used_ids and mass_min <= p["mass"] <= mass_max
    ]
    return {
        "summary": {
            "total_peaks": len(peaks),
            "matched_peaks": len(used_ids),
            "unmatched_peaks": len([p for p in peaks if int(p["peak_id"]) not in used_ids]),
            "matched_peak_percent": round((len(used_ids) / len(peaks) * 100) if peaks else 0.0, 1),
            "coverage_percent": round((len(matched_pos5) / n_positions * 100) if n_positions else 0.0, 1),
            "ppm": ppm,
            "unmatched_filter_min": mass_min,
            "unmatched_filter_max": mass_max,
        },
        "matched": matched_rows,
        "unmatched": unmatched,
        "peak_reuse": [
            {"peak_id": pid, "times_used": count}
            for pid, count in sorted(used_counts.items())
            if count > 1
        ],
    }


def base_call_candidates(
    peaks: Sequence[dict],
    unmatched_peaks: Sequence[dict],
    reference_tokens: Sequence[str],
    theo5: pd.DataFrame,
    theo3: pd.DataFrame,
    residues: ResidueDictionary | None = None,
    ppm: float = 10.0,
    top_n: int = 20,
    min_ladder_len: int = 3,
    anchor_min: float = 900.0,
    anchor_max: float = 12000.0,
    beam_size: int = 3,
    max_len: int = 25,
    max_start_delta_da: float = 50.0,
) -> dict:
    """Experimental unmatched-peak base-call candidate search."""
    residues = residues or default_residue_dictionary()
    canonical_residues = [
        {"sym": sym, "mass": residues.mass(sym)}
        for sym in ["A", "C", "G", "U"]
    ]
    anchors = sorted(
        [p for p in unmatched_peaks if anchor_min <= p["mass"] <= anchor_max],
        key=lambda p: p["intensity"],
        reverse=True,
    )[:top_n]

    def greedy_beam(start_peak: dict, direction: int) -> list[dict]:
        beam = [{
            "peaks": [start_peak],
            "bases": [],
            "used": {int(start_peak["peak_id"])},
        }]
        done: list[dict] = []
        for _ in range(max_len):
            next_beam: list[dict] = []
            for chain in beam:
                cur = chain["peaks"][-1]
                by_peak: dict[int, dict] = {}
                for residue in canonical_residues:
                    target = cur["mass"] + direction * residue["mass"]
                    hit = find_best_peak(target, peaks, ppm)
                    if hit is None or int(hit["peak_id"]) in chain["used"]:
                        continue
                    err = abs(hit["mass"] - target)
                    pid = int(hit["peak_id"])
                    if pid not in by_peak or err < by_peak[pid]["err"]:
                        by_peak[pid] = {"peak": hit, "sym": residue["sym"], "err": err}
                if not by_peak:
                    done.append(chain)
                    continue
                steps = sorted(
                    by_peak.values(),
                    key=lambda item: item["peak"]["intensity"],
                    reverse=True,
                )[:beam_size]
                for step in steps:
                    pid = int(step["peak"]["peak_id"])
                    next_beam.append({
                        "peaks": [*chain["peaks"], step["peak"]],
                        "bases": [*chain["bases"], step["sym"]],
                        "used": {*chain["used"], pid},
                    })
            beam = sorted(
                next_beam,
                key=lambda chain: sum(p["intensity"] for p in chain["peaks"]),
                reverse=True,
            )[:beam_size]
            if not beam:
                break
        return [c for c in [*done, *beam] if len(c["peaks"]) >= 2]

    ref_bases = [residues.base(tok) for tok in reference_tokens]
    n_ref = len(ref_bases)
    theo5_by_pos5 = {int(r["position"]): float(r["theo_mass"]) for _, r in theo5.iterrows()}
    theo3_by_pos5 = {
        n_ref - int(r["position"]) + 1: float(r["theo_mass"])
        for _, r in theo3.iterrows()
    }

    def min_match(length: int) -> int:
        return max(3, floor(length * 0.6))

    def best_window(called: Sequence[str], is3: bool) -> dict | None:
        if len(called) > n_ref:
            return None
        approx_len = max(1, round(current_approx_len[0]))
        center_start = (
            max(1, n_ref - approx_len + 1)
            if is3
            else max(1, approx_len - len(called) + 1)
        )
        hard_lo = max(0, center_start - 3 - 1)
        hard_hi = min(n_ref - len(called), center_start + 3 - 1)
        best: dict | None = None
        for start_idx in range(hard_lo, hard_hi + 1):
            matches = sum(
                1 for offset, base in enumerate(called)
                if ref_bases[start_idx + offset] == base
            )
            frac = matches / len(called)
            if frac >= 0.6 and matches >= min_match(len(called)):
                in_range = center_start - 2 <= start_idx + 1 <= center_start + 2
                score = frac + (0.08 if in_range else 0.0)
                if best is None or score > best["score"]:
                    best = {
                        "start_pos": start_idx + 1,
                        "match_fraction": round(frac, 4),
                        "n_match": matches,
                        "score": score,
                    }
        return best

    ladders: list[dict] = []
    current_approx_len = [1.0]
    ladder_id = 1
    for anchor in anchors:
        for direction in [-1, 1]:
            for chain in greedy_beam(anchor, direction):
                if len(chain["peaks"]) < min_ladder_len:
                    continue
                peaks_sorted = sorted(chain["peaks"], key=lambda p: p["mass"])
                bases = list(chain["bases"])
                approx_len = max(1, round(min(p["mass"] for p in chain["peaks"]) / 320.0))
                current_approx_len[0] = approx_len
                hits: list[dict] = []

                fwd = best_window(bases, is3=False)
                if fwd is not None:
                    obs = peaks_sorted[1]["mass"] if len(peaks_sorted) > 1 else peaks_sorted[0]["mass"]
                    theo = theo5_by_pos5.get(fwd["start_pos"])
                    if theo is None or abs(obs - theo) <= max_start_delta_da:
                        hits.append({**fwd, "orientation": "5'"})

                rev_bases = list(reversed(bases))
                rev = best_window(rev_bases, is3=True)
                if rev is not None:
                    obs = list(reversed(peaks_sorted))[1]["mass"] if len(peaks_sorted) > 1 else peaks_sorted[-1]["mass"]
                    theo = theo3_by_pos5.get(rev["start_pos"])
                    if theo is None or abs(obs - theo) <= max_start_delta_da:
                        hits.append({**rev, "orientation": "3'"})

                ladders.append({
                    "id": ladder_id,
                    "anchor_peak_id": int(anchor["peak_id"]),
                    "anchor_mass": round(float(anchor["mass"]), 5),
                    "walk_direction": "up" if direction == 1 else "down",
                    "approx_len": approx_len,
                    "sequence": "".join(bases),
                    "peak_ids": [int(p["peak_id"]) for p in chain["peaks"]],
                    "peak_masses": [round(float(p["mass"]), 5) for p in chain["peaks"]],
                    "align_hits": sorted(hits, key=lambda h: h["match_fraction"], reverse=True),
                })
                ladder_id += 1

    matched_ladders = sum(1 for ladder in ladders if ladder["align_hits"])
    return {
        "summary": {
            "anchors": len(anchors),
            "ladders": len(ladders),
            "matched_ladders": matched_ladders,
            "anchor_min": anchor_min,
            "anchor_max": anchor_max,
            "top_n": top_n,
            "min_ladder_len": min_ladder_len,
        },
        "ladders": ladders,
    }
