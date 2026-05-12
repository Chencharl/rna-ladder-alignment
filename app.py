"""RNA Ladder Alignment — Streamlit web interface.

Usage:
    streamlit run app.py

Deploy to Streamlit Community Cloud:
    Push this repo to GitHub, then connect at share.streamlit.io.
"""

import io
import sys
import zipfile
from collections import Counter
from pathlib import Path

import pandas as pd
import streamlit as st

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from ladder_alignment_pipeline import AlignConfig, align_ladders, build_excel


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

REQUIRED_COLS = {
    'base_name', 'monoisotopic_mass', 'sum_intensity',
    'apex_rt', 'n_iteration', 'ladder_number',
}
VALID_BASES = {'A', 'U', 'G', 'C', 'High'}


def validate(df):
    errors = []
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        errors.append(f"Missing columns: {', '.join(sorted(missing))}")
        return errors
    nulls = df[list(REQUIRED_COLS)].isnull().sum()
    if nulls.any():
        errors.append(f"Null values: {nulls[nulls > 0].to_dict()}")
    unexpected = set(df['base_name'].unique()) - VALID_BASES
    if unexpected:
        errors.append(f"Unexpected base_name values: {unexpected}")
    bad_high = (df[df['base_name'] == 'High']
                .groupby('ladder_number').size()
                .pipe(lambda s: s[s != 1]))
    if len(bad_high):
        errors.append(f"Ladders without exactly 1 High calibrant: {bad_high.to_dict()}")
    if df['monoisotopic_mass'].min() <= 0:
        errors.append("monoisotopic_mass contains non-positive values")
    return errors


def run_alignment(df, theo5, theo3, sample_name, cfg):
    results = {}
    for direction, theo in [('5', theo5), ('3', theo3)]:
        order, meta, maps = align_ladders(df, theo, cfg, direction=direction)
        buf = io.BytesIO()
        build_excel(order, meta, maps, theo, direction, sample_name, buf)
        buf.seek(0)
        results[direction] = {
            'order':        order,
            'meta':         meta,
            'excel_bytes':  buf,
            'counts':       Counter(v['overall'] for v in meta.values()),
            'pos_adjusted': sum(1 for v in meta.values() if v['pos_adjusted']),
        }
    return results


# ---------------------------------------------------------------------------
# Mass shift reference data
# ---------------------------------------------------------------------------

ARTIFACTS = [
    ("Dehydration  -H2O",   "-18.011", "5' ladder only — cyclic phosphate formation at 5' terminus"),
    ("Na⁺ adduct",          "+21.982", "Most common metal adduct; buffer or instrument contamination"),
    ("K⁺ adduct",           "+37.956", "Second most common; from K-containing buffers"),
    ("Co²⁺ adduct",         "+56.900", "From cobalt-containing reagents"),
    ("Na⁺ + K⁺",            "+59.938", "Combined adduct — check buffer composition"),
    ("K⁺ + dehydration",    "+19.945", "Combined artifact — 5' ladder only"),
]

MODIFICATIONS = [
    ("Methylation",         "+14.016", "Most common; 2'-O-methyl (Nm) blocks acid hydrolysis → gap in ladder"),
    ("Oxidation / A→G edit","+15.995", "One oxygen addition; also matches A-to-G RNA editing"),
    ("Dihydrouridine (D)",  "+2.016",  "D vs U; also 3,4-dihydrocytidine vs C"),
    ("A loss / gain",       "±329.052","Terminal A variation; key isoform discriminator"),
    ("C loss / gain",       "±305.041","Terminal C variation; e.g. CCA / CC / C 3′ tail variants"),
    ("Wybutosine → Y'",     "-358.160","Acid-labile; large drop indicates Wye-base position"),
]


# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="RNA Ladder Alignment",
    layout="wide",
)

st.title("RNA Ladder Alignment")
st.caption("Upload your three files, adjust settings if needed, then click Run.")

# ---------------------------------------------------------------------------
# Layout: uploads left, settings right
# ---------------------------------------------------------------------------

col_left, col_right = st.columns([3, 2], gap="large")

with col_left:
    st.subheader("Input files")

    input_xlsx = st.file_uploader(
        "Ladder data  (blind_sequencing_result_point_version.xlsx)",
        type=['xlsx'],
    )
    theo5_file = st.file_uploader(
        "5′ theoretical sequence  (theo_5.csv)",
        type=['csv'],
    )
    theo3_file = st.file_uploader(
        "3′ theoretical sequence  (theo_3.csv)",
        type=['csv'],
    )

    sample_name = st.text_input("Sample label", value="Sample",
                                help="Used in the output filename and sheet title.")

with col_right:
    st.subheader("Analysis settings")

    # ── Rejection criteria ────────────────────────────────────────
    with st.expander("Rejection criteria", expanded=False):
        st.markdown(
            "Positions with delta-mass below these values are flagged **REJECTED** "
            "and excluded from run detection. "
            "The 5′ threshold is set just below the dehydration artifact (−18.01 Da) "
            "that forms naturally at cyclic phosphate termini — "
            "anything more negative is not a real RNA fragment."
        )
        reject_5p = st.number_input(
            "5′ reject below (Da)",
            value=-19.0, step=1.0,
            help="Dehydration artifact = −18.01 Da. Default −19 Da gives safe margin.",
        )
        reject_3p = st.number_input(
            "3′ reject below (Da)",
            value=-1.0, step=0.5,
            help="3′ fragments are shorter; tighter window avoids false rejections.",
        )

    # ── High-confidence match detection ──────────────────────────
    with st.expander("High-confidence (PERFECT) detection", expanded=False):
        st.markdown(
            "A run of positions where |Δmass| stays within the instrument's "
            "monoisotopic mass accuracy window is called **PERFECT**. "
            "For high-resolution data (≥240 000 resolution, Orbitrap), "
            "this window is typically 50–100 mDa."
        )
        strict_abs = st.number_input(
            "|Δmass| window (Da)",
            value=0.09, step=0.01, format="%.3f",
            help="Instrument mass accuracy. 0.09 Da = 90 mDa.",
        )
        strict_run = st.number_input(
            "Minimum consecutive positions",
            value=3, min_value=2, step=1,
            help="At least this many positions in a row must be within the window.",
        )

    # ── Systematic shift detection ────────────────────────────────
    with st.expander("Systematic shift (SHIFTED) detection", expanded=False):
        st.markdown(
            "A **SHIFTED** run means Δmass is consistent across consecutive positions "
            "even if it is not near zero — indicating a systematic modification "
            "(e.g. methylation +14 Da, oxidation +16 Da, or a metal adduct). "
            "The 'consistency' threshold controls how much Δmass may vary "
            "between adjacent positions and still be counted as the same shift."
        )
        shifted_diff = st.number_input(
            "Max Δmass variation between adjacent positions (Da)",
            value=0.6, step=0.1, format="%.2f",
            help="< 0.6 Da between consecutive positions = consistent shift.",
        )
        shifted_run = st.number_input(
            "Minimum consecutive positions",
            value=4, min_value=2, step=1,
            help="At least this many positions in a row must hold the shift.",
        )
        st.info(
            "Common systematic shifts to expect: "
            "methylation +14 Da · oxidation +16 Da · "
            "Na⁺ adduct +22 Da · K⁺ adduct +38 Da"
        )

    # ── Noisy ladder flag ─────────────────────────────────────────
    with st.expander("Noisy ladder flag", expanded=False):
        st.markdown(
            "If any single step between adjacent Δmass values exceeds this threshold, "
            "the ladder is flagged **NOISY SHIFTED** instead of SHIFTED. "
            "Large single jumps typically indicate a missing fragment, "
            "a Wybutosine-type acid-labile site (−358 Da), "
            "or a combined adduct (Na⁺+K⁺ ≈ +60 Da)."
        )
        noisy_jump = st.number_input(
            "Single-step Δmass jump threshold (Da)",
            value=50.0, step=5.0,
            help="Jumps above this downgrade SHIFTED → NOISY SHIFTED.",
        )

# ---------------------------------------------------------------------------
# Mass shift reference panel
# ---------------------------------------------------------------------------

with st.expander("Mass shift reference  (rRNA / RNA modifications)", expanded=False):
    tab_art, tab_mod = st.tabs(["Artifacts to exclude", "Modifications of interest"])

    with tab_art:
        st.markdown(
            "These offsets arise from sample preparation, buffers, or instrument "
            "conditions. Identify them before interpreting unknown shifts as modifications."
        )
        art_df = pd.DataFrame(ARTIFACTS, columns=["Shift", "Mass (Da)", "Notes"])
        st.dataframe(art_df, hide_index=True, use_container_width=True)
        st.caption(
            "Dehydration (−18 Da) is **5′ ladder specific** — "
            "it forms cyclic phosphate at the 5′ terminus and will not appear in 3′ ladders."
        )

    with tab_mod:
        st.markdown(
            "Biological modifications that produce systematic Δmass offsets. "
            "A 2′-O-methyl (Nm) modification blocks acid hydrolysis and creates a **gap** "
            "in the ladder at that position rather than a mass shift."
        )
        mod_df = pd.DataFrame(MODIFICATIONS, columns=["Modification", "Mass (Da)", "Notes"])
        st.dataframe(mod_df, hide_index=True, use_container_width=True)

# ---------------------------------------------------------------------------
# Run button
# ---------------------------------------------------------------------------

st.divider()
all_uploaded = input_xlsx and theo5_file and theo3_file
run_clicked  = st.button("Run alignment", type="primary", disabled=not all_uploaded)

if not all_uploaded:
    st.info("Upload all three files to enable Run.")

if run_clicked:
    cfg = AlignConfig(
        reject_below_5p        = reject_5p,
        reject_below_3p        = reject_3p,
        strict_abs_da          = strict_abs,
        strict_min_run         = int(strict_run),
        stable_offset_diff_da  = shifted_diff,
        stable_offset_min_run  = int(shifted_run),
        noisy_jump_da          = noisy_jump,
    )

    with st.spinner("Loading files..."):
        try:
            sheets = pd.read_excel(input_xlsx, sheet_name=None)
        except Exception as e:
            st.error(f"Cannot read xlsx: {e}")
            st.stop()

        if 'Sheet1' not in sheets:
            st.error(f"Sheet 'Sheet1' not found. Available: {list(sheets.keys())}")
            st.stop()

        df    = sheets['Sheet1']
        theo5 = pd.read_csv(theo5_file)
        theo3 = pd.read_csv(theo3_file)

    errors = validate(df)
    if errors:
        st.error("Validation failed:")
        for e in errors:
            st.write(f"- {e}")
        st.stop()

    with st.spinner("Running alignment (this may take 20–40 seconds for large datasets)..."):
        results = run_alignment(df, theo5, theo3, sample_name, cfg)

    st.success("Done.")

    # Summary table
    st.subheader("Summary")
    rows = []
    for d in ['5', '3']:
        r  = results[d]
        cc = r['counts']
        rows.append({
            "End":                  f"{d}'",
            "Ladders":              len(r['order']),
            "PERFECT":              cc['perfect'] + cc['mixed'],
            "SHIFTED":              cc['shifted'],
            "NOISY SHIFTED":        cc['noisy_shifted'] + cc['noisy_mixed'],
            "REJECTED":             cc['rejected'],
            "Normal":               cc['normal'],
            "Position-adjusted":    r['pos_adjusted'],
        })
    st.dataframe(pd.DataFrame(rows).set_index('End'), use_container_width=False)

    # Downloads
    st.subheader("Download results")
    safe = sample_name.replace(' ', '_')
    dl1, dl2 = st.columns(2)
    with dl1:
        st.download_button(
            label="5′ alignment (.xlsx)",
            data=results['5']['excel_bytes'],
            file_name=f"{safe}_alignment_5prime.xlsx",
            mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            use_container_width=True,
        )
    with dl2:
        st.download_button(
            label="3′ alignment (.xlsx)",
            data=results['3']['excel_bytes'],
            file_name=f"{safe}_alignment_3prime.xlsx",
            mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            use_container_width=True,
        )
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            f"{safe}_alignment_5prime.xlsx",
            results['5']['excel_bytes'].getvalue()
        )
        zf.writestr(
            f"{safe}_alignment_3prime.xlsx",
            results['3']['excel_bytes'].getvalue()
        )

    zip_buffer.seek(0)

    st.download_button(
        label="Download both 5′ and 3′ alignments (.zip)",
        data=zip_buffer.getvalue(),
        file_name=f"{safe}_both_alignments.zip",
        mime="application/zip",
        use_container_width=True,
    )
    # Detail tables
    st.subheader("Per-ladder detail")
    detail_cols = ['n_iteration', 'first_rna_index', 'first_mass',
                   'first_mass_div_320', 'first_rna_pos', 'start_pos',
                   'pos_adjusted',
                   'n_placed', 'n_rejected_positions',
                   'delta_mean', 'delta_std', 'overall']

    tab5, tab3 = st.tabs(["5′ ladders", "3′ ladders"])
    for tab, direction in [(tab5, '5'), (tab3, '3')]:
        with tab:
            rows_d = [{'ladder': k, **{f: v for f, v in m.items() if f in detail_cols}}
                      for k, m in results[direction]['meta'].items()]
            st.dataframe(pd.DataFrame(rows_d), hide_index=True, use_container_width=True)
    
