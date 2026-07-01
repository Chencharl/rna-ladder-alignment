"""
Combined single-phase Vercel Python function for RNA LC-MS Sequencing Assist.

POST /api/sequencing-assist
  form fields: file (.xlsx), reference_sequence (optional)
  returns: JSON with scatter/sigmoid preview + pipeline results + base64 Excel
"""

import base64
import io
import json
import math
import os
import sys
import tempfile

import matplotlib
matplotlib.use("Agg")  # non-interactive before any other matplotlib import

import numpy as np
import pandas as pd
from flask import Flask, request, jsonify

# Add repo root to sys.path so trna_nested_algorithm is importable.
# __file__ = /var/task/api/sequencing-assist.py  →  parent = /var/task
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from trna_nested_algorithm import (  # noqa: E402
    load_data,
    assign_blocks,
    compute_relative_intensity,
    run_pipeline as _run_nested_pipeline,
    BLOCK_WIDTH_DA,
    N_BLOCKS,
)

# ── Constants ──────────────────────────────────────────────────────────────────
PRE_SUB_LIMIT = 20_000
PIPELINE_POINT_LIMIT = 8_000

_RESIDUE_MASS = {
    "A": 329.0525, "U": 306.0253, "G": 345.0474, "C": 305.0413,
}
_DECODE_TOL = 0.08

# ── Flask app ──────────────────────────────────────────────────────────────────
app = Flask(__name__)


@app.after_request
def _add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/", methods=["OPTIONS"])
def _preflight():
    return ("", 204)


@app.route("/", methods=["POST"])
def analyze():
    file = request.files.get("file")
    if file is None:
        return jsonify({"detail": "No file provided"}), 400

    ref_seq = request.form.get("reference_sequence", "").strip()
    fname = file.filename or "upload.xlsx"
    if not fname.lower().endswith((".xlsx", ".xls")):
        return jsonify({"detail": "Expected an Excel (.xlsx) file"}), 400

    with tempfile.TemporaryDirectory() as tmpdir:
        # ── 1. Save + parse ───────────────────────────────────────────────
        fpath = os.path.join(tmpdir, fname)
        file.save(fpath)
        try:
            df = load_data(fpath)
            df = assign_blocks(df)
            df = compute_relative_intensity(df)
        except Exception as exc:
            return jsonify({"detail": f"Cannot parse Excel file: {exc}"}), 422

        n_original = len(df)

        # ── 2. Pre-subsample (Charge 1 files can be 30-50k points) ────────
        was_pre_subsampled = False
        if n_original > PRE_SUB_LIMIT:
            df = (
                df.groupby("block")
                .apply(lambda g: g.nlargest(50, "I"), include_groups=False)
                .reset_index(drop=True)
                .sort_values("M", ignore_index=True)
            )
            # pandas 3.x drops group-key column in groupby-apply; recompute.
            df["block"] = (df["M"] / BLOCK_WIDTH_DA).round().astype(int).clip(1, N_BLOCKS)
            was_pre_subsampled = True

        df_stored = df.copy()

        # ── 3. Intact detection ───────────────────────────────────────────
        data_type_warning = _detect_data_type(df)

        # ── 4. Scatter / sigmoid preview ──────────────────────────────────
        scatter_points = _build_scatter(df)
        sigmoid_points = _build_sigmoid(df)
        rt_vals = df["T"]
        rt_spread = round(float(rt_vals.max() - rt_vals.min()), 2)
        preview_rows = df.head(5)[["M", "I", "T", "block", "Rel_I"]].round(4).to_dict(orient="records")

        # ── 5. Pipeline-level subsample ───────────────────────────────────
        was_subsampled = False
        df_pipeline = df
        if len(df) > PIPELINE_POINT_LIMIT:
            df_pipeline = (
                df.groupby("block")
                .apply(lambda g: g.nlargest(25, "I"), include_groups=False)
                .reset_index(drop=True)
                .sort_values("M", ignore_index=True)
            )
            df_pipeline["block"] = (
                (df_pipeline["M"] / BLOCK_WIDTH_DA).round().astype(int).clip(1, N_BLOCKS)
            )
            was_subsampled = True

        # ── 6. Reference tokens ───────────────────────────────────────────
        ref_tokens = None
        if ref_seq:
            toks = [c for c in ref_seq.upper().replace("T", "U") if c in "AUGC"]
            if toks:
                ref_tokens = toks

        # ── 7. Run pipeline ───────────────────────────────────────────────
        out_dir = os.path.join(tmpdir, "output")
        os.makedirs(out_dir, exist_ok=True)
        try:
            result = _run_nested_pipeline(
                df=df_pipeline, out_dir=out_dir, reference=ref_tokens
            )
        except Exception as exc:
            return jsonify({"detail": f"Pipeline failed: {exc}"}), 500

        report = result.get("report", {})
        data_df = result["data"]
        chains_list = result["chains"]

        # ── 8. Chain overlay data ─────────────────────────────────────────
        n_chains_total = len(chains_list)
        n_chains_min_10 = sum(1 for c in chains_list if len(c["indices"]) >= 10)
        min_len = 10 if n_chains_min_10 > 0 else 3

        top_chains = []
        for chain_idx, chain in sorted(
            enumerate(chains_list),
            key=lambda x: len(x[1]["indices"]),
            reverse=True,
        )[:10]:
            if len(chain["indices"]) < min_len:
                continue
            rows = data_df.loc[chain["indices"]].sort_values("M")
            for _, row in rows.iterrows():
                top_chains.append({
                    "chain_index": chain_idx,
                    "ladder_type": chain["ladder_type"],
                    "mass": float(row["M"]),
                    "rel_i": float(row["Rel_I"]),
                    "rt": float(row["T"]),
                    "n_points": len(chain["indices"]),
                })

        # ── 9. Coverage by intensity percentile ───────────────────────────
        data_sorted = data_df.sort_values("I", ascending=False).reset_index(drop=True)
        n = len(data_sorted)
        _used_status = {
            "primary_used", "ambiguous_retained",
            "conflict_retained", "reference_reused",
        }
        is_used = (
            data_sorted["peak_status"].isin(_used_status)
            if "peak_status" in data_sorted.columns
            else pd.Series(False, index=data_sorted.index)
        )
        coverage_bins = []
        for lo, hi, label in [
            (0.00, 0.02, "Top 0–2%"),
            (0.02, 0.05, "Top 2–5%"),
            (0.05, 0.10, "Top 5–10%"),
            (0.10, 0.20, "Top 10–20%"),
            (0.20, 0.50, "Top 20–50%"),
            (0.50, 1.00, "Bottom 50%"),
        ]:
            sub = is_used.iloc[int(n * lo) : int(n * hi)]
            total = len(sub)
            matched = int(sub.sum())
            coverage_bins.append({
                "label": label,
                "total": total,
                "matched": matched,
                "pct": round(matched / total * 100, 1) if total else 0,
            })

        # ── 10. Sigmoid post-pipeline ─────────────────────────────────────
        sp_df = data_df[["M", "T", "Rel_I"]].copy()
        sp_df["status"] = (
            data_df["peak_status"]
            if "peak_status" in data_df.columns
            else "unknown"
        )
        if len(sp_df) > 8000:
            high = sp_df[sp_df["Rel_I"] >= 0.3]
            low_pool = sp_df[sp_df["Rel_I"] < 0.3]
            low = low_pool.sample(
                n=min(8000 - len(high), len(low_pool)), random_state=42
            )
            sp_df = pd.concat([high, low])
        sigmoid_post = sp_df.round(4).to_dict(orient="records")

        # ── 11. Read CSV outputs ──────────────────────────────────────────
        def _read_csv(key):
            path = report.get(key)
            if not path or not os.path.exists(path):
                return None
            try:
                df_tmp = pd.read_csv(path)
                df_tmp = df_tmp.where(df_tmp.notna(), None)
                return _sanitize(df_tmp.to_dict(orient="records"))
            except Exception:
                return None

        top_parallel = _read_csv("top_parallel_reads_long_csv")
        sequencing_decision = _read_csv("sequencing_decision_summary_csv")
        classification_ev = _read_csv("classification_evidence_csv")
        peak_status_data = _read_csv("peak_status_csv")
        read_summary_data = _read_csv("read_summary_csv")

        # ── 12. Build Excel ───────────────────────────────────────────────
        sidecar = {
            "coverage_by_intensity": coverage_bins,
            "reference_sequence": "".join(ref_tokens) if ref_tokens else None,
            "n_pipeline_points": len(df_pipeline),
            "n_original_points": n_original,
            "was_subsampled": was_subsampled,
            "n_chains_total": n_chains_total,
            "n_chains_min_10": n_chains_min_10,
            "min_chain_len_shown": min_len,
        }
        try:
            excel_bytes = _build_excel(out_dir, sidecar)
            excel_b64 = base64.b64encode(excel_bytes).decode("utf-8")
        except Exception:
            excel_b64 = ""

        # ── 13. Compose JSON response ──────────────────────────────────────
        resp = {
            # Upload-raw fields (needed immediately for scatter/sigmoid display)
            "session_id": "vercel",
            "filename": fname,
            "n_points": n_original,
            "n_points_stored": len(df_stored),
            "was_pre_subsampled": was_pre_subsampled,
            "mass_range": [
                round(float(df_stored["M"].min()), 2),
                round(float(df_stored["M"].max()), 2),
            ],
            "rt_range": [
                round(float(rt_vals.min()), 2),
                round(float(rt_vals.max()), 2),
            ],
            "rt_spread_minutes": rt_spread,
            "n_blocks": int(df_stored["block"].nunique()),
            "preview_rows": preview_rows,
            "scatter_points": scatter_points,
            "sigmoid_points": sigmoid_points,
            "data_type_warning": data_type_warning,
            # Pipeline fields
            "report": {},
            "top_parallel_reads_long": top_parallel,
            "sequencing_decision_summary": sequencing_decision,
            "classification_evidence": classification_ev,
            "peak_status": peak_status_data,
            "read_summary": read_summary_data,
            "top_chains_for_plot": _sanitize(top_chains),
            "n_chains_total": n_chains_total,
            "n_chains_min_10": n_chains_min_10,
            "min_chain_len_shown": min_len,
            "coverage_by_intensity": coverage_bins,
            "sigmoid_post_pipeline": _sanitize(sigmoid_post),
            "was_subsampled": was_subsampled,
            "n_original_points": n_original,
            "n_pipeline_points": len(df_pipeline),
            "reference_comparisons": None,
            # Excel download (base64 encoded)
            "excel_b64": excel_b64,
        }
        return jsonify(resp)


# ── Helper functions ───────────────────────────────────────────────────────────

def _detect_data_type(df):
    n = len(df)
    reasons = []
    raw_k = (df["M"] / BLOCK_WIDTH_DA).round()
    n_over = int((raw_k > N_BLOCKS).sum())
    frac_over = n_over / n if n else 0.0
    if frac_over > 0.01:
        reasons.append(
            f"{n_over} point(s) ({frac_over * 100:.1f}%) have mass above the "
            f"~{N_BLOCKS * BLOCK_WIDTH_DA:.0f} Da ladder range and get clipped into the last block."
        )
    if n < 600:
        reasons.append(f"Only {n} data points — hydrolysis ladders are typically 1,000+.")
    if "block" in df.columns and n > 0:
        used = int(df["block"].nunique())
        span = max(int(df["block"].max() - df["block"].min()) + 1, 1)
        if used / span < 0.5 and span > 10:
            reasons.append(
                f"Only {used}/{span} blocks in range are populated — "
                "points look clustered rather than forming a continuous ladder."
            )
    return {"likely_intact": len(reasons) >= 2 or frac_over > 0.03, "reasons": reasons}


def _build_scatter(df):
    sdf = df[["M", "Rel_I", "T", "block"]].copy()
    if len(sdf) > 10000:
        high = sdf[sdf["Rel_I"] >= 0.3]
        low_pool = sdf[sdf["Rel_I"] < 0.3]
        low = low_pool.sample(n=min(10000 - len(high), len(low_pool)), random_state=42)
        sdf = pd.concat([high, low]).sort_values("M", ignore_index=True)
    return sdf.round(4).to_dict(orient="records")


def _build_sigmoid(df):
    sdf = df[["M", "T", "Rel_I"]].copy()
    if len(sdf) > 8000:
        high = sdf[sdf["Rel_I"] >= 0.3]
        low_pool = sdf[sdf["Rel_I"] < 0.3]
        low = low_pool.sample(n=min(8000 - len(high), len(low_pool)), random_state=42)
        sdf = pd.concat([high, low])
    return sdf.round(4).to_dict(orient="records")


def _decode_sequence(masses):
    if len(masses) < 2:
        return ""
    calls = []
    for i in range(1, len(masses)):
        delta = masses[i] - masses[i - 1]
        best_nt, best_diff = None, _DECODE_TOL
        for nt, m in _RESIDUE_MASS.items():
            if abs(delta - m) < best_diff:
                best_diff = abs(delta - m)
                best_nt = nt
        calls.append(best_nt if best_nt else f"?{delta:.0f}")
    return "-".join(calls)


def _sanitize(obj):
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def _build_excel(out_dir_str, sidecar):
    from pathlib import Path
    from datetime import datetime
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    out_dir = Path(out_dir_str)

    def read_csv_safe(name):
        p = out_dir / name
        try:
            return pd.read_csv(p) if p.exists() else None
        except Exception:
            return None

    annotated = read_csv_safe("annotated_data.csv")
    peak_status = read_csv_safe("Peak_Status.csv")
    read_summary = read_csv_safe("read_summary.csv")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    HDR_FILL = PatternFill("solid", fgColor="1E3A5F")
    HDR_FONT = Font(bold=True, color="FFFFFF", size=11)
    PRIME5_FILL = PatternFill("solid", fgColor="DBEAFE")
    PRIME3_FILL = PatternFill("solid", fgColor="EDE9FE")
    AMB_FILL = PatternFill("solid", fgColor="FEF3C7")
    CONF_FILL = PatternFill("solid", fgColor="FEE2E2")
    ALT_FILL = PatternFill("solid", fgColor="F8FAFC")
    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    def set_header(ws, cols):
        for c, h in enumerate(cols, 1):
            cell = ws.cell(row=1, column=c, value=h)
            cell.fill = HDR_FILL
            cell.font = HDR_FONT
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
            cell.border = border
        ws.row_dimensions[1].height = 30

    def auto_width(ws, max_w=45):
        for col in ws.columns:
            w = max((len(str(c.value or "")) for c in col), default=8)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(
                max(w + 2, 10), max_w
            )

    def row_fill(call):
        if not call:
            return None
        v = str(call).lower()
        if "5" in v:
            return PRIME5_FILL
        if "3" in v:
            return PRIME3_FILL
        if "conflict" in v:
            return CONF_FILL
        return AMB_FILL

    # Sheet 1: Candidate Short Reads
    ws1 = wb.create_sheet("Candidate Short Reads")
    cols1 = [
        "Read #", "5′/3′ Call", "Confidence", "Length (nt)",
        "Decoded Sequence (mass differences → nucleotides)",
        "Mass Start (Da)", "Mass End (Da)", "RT Range (min)",
        "Mean Rel_I", "Evidence (brief)", "Warnings",
    ]
    set_header(ws1, cols1)
    min_len = int(sidecar.get("min_chain_len_shown", 10))
    rows_written = 0
    if peak_status is not None and read_summary is not None:
        ps_wr = peak_status[peak_status["read_rank"].notna()].copy()
        ps_wr["read_rank"] = ps_wr["read_rank"].astype(int)
        mass_by_rank = {
            int(rk): grp["mass"].tolist()
            for rk, grp in ps_wr.groupby("read_rank")
        }
        for _, row in read_summary.iterrows():
            rk = int(row.get("read_rank", 0) or 0)
            call = str(row.get("ladder_call", ""))
            length = int(row.get("read_length", 0) or 0)
            if length < min_len:
                continue
            masses = sorted(mass_by_rank.get(rk, []))
            seq = _decode_sequence(masses)
            m_s = round(min(masses), 2) if masses else ""
            m_e = round(max(masses), 2) if masses else ""
            rt_sub = ps_wr[ps_wr["read_rank"] == rk]["rt"].dropna()
            rt_str = f"{rt_sub.min():.1f} – {rt_sub.max():.1f}" if len(rt_sub) else ""
            mean_ri = round(float(row.get("mean_rel_i", 0) or 0), 4)
            evid = str(row.get("ladder_evidence", ""))[:150]
            warn = str(row.get("ladder_warnings", ""))[:150]
            conf = str(row.get("ladder_confidence_tier", ""))
            r = rows_written + 2
            fill = row_fill(call)
            for c, val in enumerate(
                [rk, call, conf, length, seq, m_s, m_e, rt_str, mean_ri, evid, warn], 1
            ):
                cell = ws1.cell(row=r, column=c, value=val)
                cell.border = border
                cell.alignment = Alignment(wrap_text=(c in (5, 10, 11)))
                if fill:
                    cell.fill = fill
                elif r % 2 == 0:
                    cell.fill = ALT_FILL
            rows_written += 1
    ws1.freeze_panes = "A2"
    auto_width(ws1)
    ws1.column_dimensions["E"].width = 55

    # Sheet 2: Coverage Analysis
    ws2 = wb.create_sheet("Coverage Analysis")
    set_header(ws2, ["Intensity Bin", "Total Peaks", "Matched Peaks", "Coverage (%)"])
    cov_bins = sidecar.get("coverage_by_intensity") or []
    for i, b in enumerate(cov_bins):
        r = i + 2
        clr = (
            "D1FAE5" if b["pct"] >= 80
            else "FEF3C7" if b["pct"] >= 50
            else "FFEDD5" if b["pct"] >= 20
            else "FEE2E2"
        )
        for c, val in enumerate(
            [b["label"], b["total"], b["matched"], f'{b["pct"]}%'], 1
        ):
            cell = ws2.cell(row=r, column=c, value=val)
            cell.border = border
            cell.fill = PatternFill("solid", fgColor=clr)
    ws2.freeze_panes = "A2"
    auto_width(ws2)

    # Sheet 3: Annotated Peak Table
    if annotated is not None:
        ws3 = wb.create_sheet("Annotated Peak Table")
        display_cols = [
            c for c in ["M", "I", "T", "block", "Rel_I", "peak_status"]
            if c in annotated.columns
        ]
        if peak_status is not None:
            ps_mini = (
                peak_status[["mass", "read_rank", "ladder_call"]]
                .rename(columns={"mass": "M_ps"})
                .copy()
            )
            ann2 = annotated.sort_values("M")
            ps_mini = ps_mini.sort_values("M_ps")
            ann2 = pd.merge_asof(
                ann2, ps_mini, left_on="M", right_on="M_ps",
                tolerance=0.005, direction="nearest",
            )
            for col in ["read_rank", "ladder_call"]:
                if col in ann2.columns and col not in display_cols:
                    display_cols.append(col)
            annotated = ann2
        labels = {
            "M": "Mass (Da)", "I": "Sum Intensity", "T": "Apex RT (min)",
            "block": "Block", "Rel_I": "Rel_I", "peak_status": "Status",
            "read_rank": "Read #", "ladder_call": "Call",
        }
        set_header(ws3, [labels.get(c, c) for c in display_cols])
        for ri, (_, row3) in enumerate(annotated[display_cols].head(5000).iterrows(), 2):
            fill = (
                row_fill(row3.get("ladder_call"))
                if not pd.isna(row3.get("read_rank", float("nan")))
                else None
            )
            for ci, col in enumerate(display_cols, 1):
                val = row3[col]
                if pd.isna(val):
                    val = ""
                elif col in ("M", "Rel_I"):
                    val = round(float(val), 4)
                elif col == "I":
                    val = round(float(val), 1)
                cell = ws3.cell(row=ri, column=ci, value=val)
                cell.border = border
                if fill:
                    cell.fill = fill
                elif ri % 2 == 0:
                    cell.fill = ALT_FILL
        ws3.freeze_panes = "A2"
        auto_width(ws3)

    # Sheet 4: Run Summary
    ws4 = wb.create_sheet("Run Summary")
    ws4.column_dimensions["A"].width = 38
    ws4.column_dimensions["B"].width = 55
    ws4.cell(row=1, column=1, value="RNA Ladder Sequencing Results").font = Font(
        bold=True, size=14
    )
    ws4.cell(
        row=2, column=1, value=f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )
    ws4.append([])

    def kv(ws, k, v):
        r = ws.max_row + 1
        c = ws.cell(row=r, column=1, value=k)
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="F1F5F9")
        ws.cell(row=r, column=2, value=str(v) if v is not None else "—")

    kv(ws4, "Pipeline points processed", sidecar.get("n_pipeline_points", "—"))
    kv(ws4, "Original points (before subsampling)", sidecar.get("n_original_points", "—"))
    kv(ws4, "Auto-subsampled?", "Yes" if sidecar.get("was_subsampled") else "No")
    kv(ws4, "Total chains recovered", sidecar.get("n_chains_total", "—"))
    kv(
        ws4,
        f"Chains with ≥{min_len} ladder positions",
        sidecar.get("n_chains_min_10", "—"),
    )
    if cov_bins:
        tot = sum(b["total"] for b in cov_bins)
        mat = sum(b["matched"] for b in cov_bins)
        kv(ws4, "Overall peak coverage", f"{mat}/{tot} = {round(mat/tot*100,1)}%" if tot else "—")
    ref = sidecar.get("reference_sequence")
    kv(
        ws4,
        "Reference sequence",
        (f"Yes ({len(ref)} nt): {ref[:40]}…" if ref and len(ref) > 40 else (f"Yes: {ref}" if ref else "No")),
    )

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
