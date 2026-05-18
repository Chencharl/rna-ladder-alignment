# RNA Ladder Alignment

Mass-spec ladder sequencing pipeline for RNA (5′ and 3′ end sequencing).

Aligns experimental ladder fragments to a theoretical RNA sequence, computes
per-position delta-mass, and classifies each ladder as PERFECT, SHIFTED,
NOISY SHIFTED, REJECTED, or normal. Outputs colour-coded Excel workbooks.

## Quick start (web UI)

The easiest way to use this tool is through the Streamlit web app.

**Live app:**
[rna-ladder-alignment-g2jbxez5lk5gzhuowa2euz.streamlit.app](https://rna-ladder-alignment-g2jbxez5lk5gzhuowa2euz.streamlit.app)

**Deploy your own instance (free):**
1. Fork this repository on GitHub.
2. Go to [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.
3. Click **New app**, select this repo, set the main file to `app.py`, deploy.
4. Share the URL with your lab.

**Run locally:**
```bash
pip install -r requirements.txt
streamlit run app.py
```
Then open http://localhost:8501, upload your three files, and click Run.

## Next.js frontend + FastAPI backend deployment

This repository also contains a split frontend/backend deployment:

- `frontend/`: Next.js app for Vercel
- `backend/`: FastAPI wrapper around `ladder_alignment_pipeline.py`
- `railway.toml`: Railway config for the backend service

The Vercel frontend does not run the Python alignment code by itself. It sends
uploads to the FastAPI backend at `POST /align`, so production needs both
services:

1. Deploy the backend service from the repo root using `railway.toml`.
2. Confirm the backend health endpoint returns `{"status":"ok"}`:

   ```bash
   curl https://YOUR-BACKEND.up.railway.app/health
   ```

3. In the Vercel project for `frontend/`, add an environment variable for
   Production, Preview, and Development:

   ```text
   NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.up.railway.app
   ```

4. Redeploy the Vercel frontend after setting the environment variable.

If `NEXT_PUBLIC_API_URL` is missing, the frontend cannot reach `/align` and the
browser will report a load/fetch failure instead of producing Excel files.

## Command-line usage

```bash
python run_analysis.py \
    --input  blind_sequencing_result_point_version.xlsx \
    --theo5  theo_5.csv \
    --theo3  theo_3.csv \
    --outdir results/ \
    --name   "Sample 01"
```

Output files written to `results/`:
- `Sample_01_alignment_5prime.xlsx`
- `Sample_01_alignment_3prime.xlsx`
- `Sample_01_ladder_data.csv`
- `Sample_01_validation_report.txt`

## Input file format

### Ladder data (xlsx, Sheet1)

| Column | Type | Description |
|---|---|---|
| `ladder_number` | str | e.g. `ladder1`, `ladder2` |
| `base_name` | str | `A`, `U`, `G`, `C`, or `High` |
| `monoisotopic_mass` | float | Experimental fragment mass (Da) |
| `sum_intensity` | float | Peak area |
| `apex_rt` | float | Retention time (min) |
| `n_iteration` | int | Run / injection number |

### Theoretical sequences (csv)

`theo_5.csv`: columns `5'`, `theo_mass`, `position` (1 = 5′ terminus)  
`theo_3.csv`: columns `3'`, `theo_mass`, `position` (1 = 3′ terminus)

## Classification rules

| Class | Rule |
|---|---|
| **PERFECT** | ≥3 consecutive positions with \|Δmass\| < 0.09 Da |
| **SHIFTED** | ≥4 consecutive positions where adjacent Δmass values differ by < 0.6 Da |
| **NOISY SHIFTED** | SHIFTED, but at least one Δmass jump > 50 Da within the ladder |
| **REJECTED** | Any position with Δmass < −19 Da (5′) or < −1 Da (3′) |

### Start-position placement

The first RNA position is assigned from the first non-`High` fragment in each
ordered ladder:

```python
first_rna_pos = round_half_up(first_mass / 320)
```

The ladder offset is then chosen so that this first RNA row lands exactly on
`first_rna_pos`, even if `High` appears before it in the ordered rows. The
pipeline no longer tests `anchor±1`.

After this initial placement, the average delta-mass is calculated across all
placed rows with theoretical positions, including `High`. Strongly negative
averages trigger an automatic upward correction and then all delta-masses are
recalculated:

| Initial average Δmass | Correction |
|---|---|
| `< -300 Da` | Move the whole ladder up 2 positions |
| `< -80 Da` | Move the whole ladder up 1 position |

### High calibrant handling

Each ladder contains exactly one `High` internal calibrant.  
It is kept at its original ladder position, does not shift neighboring RNA
fragments, and its delta-mass is calculated against the theoretical mass at
that position. It is excluded from RNA run classification.

## Key mass shifts (rRNA)

### Artifacts to exclude

| Shift | Mass (Da) | Note |
|---|---|---|
| Dehydration −H₂O | −18.011 | 5′ only — cyclic phosphate |
| Na⁺ adduct | +21.982 | Buffer contamination |
| K⁺ adduct | +37.956 | Buffer contamination |
| Co²⁺ adduct | +56.900 | Reagent contamination |

### Modifications of interest

| Modification | Mass (Da) | Note |
|---|---|---|
| Methylation | +14.016 | Most common; 2′-O-methyl blocks hydrolysis → gap |
| Oxidation / A→G edit | +15.995 | One oxygen atom |
| Dihydrouridine (D) | +2.016 | D vs U |
| A loss / gain | ±329.052 | Terminal isoform discriminator |
| C loss / gain | ±305.041 | CCA / CC / C 3′ tail variants |
| Wybutosine → Y′ | −358.160 | Acid-labile; large single drop |

## Project structure

```
.
├── app.py                          Streamlit web interface
├── ladder_alignment_pipeline.py    Core alignment + Excel writer
├── run_analysis.py                 CLI entry point + validation
├── requirements.txt
└── README.md
```

## Configuration

All thresholds live in `AlignConfig` in `ladder_alignment_pipeline.py`.
Defaults match the values shown in the web UI.

```python
from ladder_alignment_pipeline import AlignConfig

cfg = AlignConfig(
    reject_below_5p        = -19.0,
    reject_below_3p        =  -1.0,
    strict_abs_da          =   0.09,
    strict_min_run         =   3,
    stable_offset_diff_da  =   0.6,
    stable_offset_min_run  =   4,
    noisy_jump_da          =  50.0,
)
```

## Requirements

Python 3.10+. See `requirements.txt`.
