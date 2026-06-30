# RNA Ladder Alignment

Mass-spec ladder sequencing pipeline for RNA (5′ and 3′ end sequencing).

Aligns experimental ladder fragments to a theoretical RNA sequence, computes
per-position delta-mass, and classifies each ladder as PERFECT, SHIFTED,
NOISY SHIFTED, REJECTED, or normal. Outputs colour-coded Excel workbooks.

## Quick start (web UI)

The easiest way to use this tool is through the Streamlit web app.

**Live app:**
[rna-ladder-alignment-g2jbxez5lk5gzhuowa2euz.streamlit.app](https://rna-ladder-alignment-g2jbxez5lk5gzhuowa2euz.streamlit.app)

**Vercel frontend:**
[rna-ladder-frontend.vercel.app](https://rna-ladder-frontend.vercel.app)

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

This repository contains a split frontend/backend deployment:

- `frontend/`: Next.js app, deployed on Vercel
- `backend/`: FastAPI app (wraps `ladder_alignment_pipeline.py` and
  `trna_nested_algorithm.py`), deployed on **Railway** via `railway.toml`
- `railway.toml`: Railway build/start config for the backend service

The backend is a persistent server, not a Vercel serverless function — it
needs a writable, long-lived filesystem for the upload → run-pipeline session
flow (`backend/app.py` writes a parsed parquet file per session, then reads it
back on `/sequencing-assist/run-pipeline`). Vercel Python Functions are
short-lived and don't guarantee the same container across two separate
requests, so the backend must not be deployed there.

The Vercel frontend does not run any Python code itself. It calls the FastAPI
backend over HTTP, so production needs both services running:

1. **Deploy the backend on [Railway](https://railway.app):**
   - New Project → Deploy from GitHub repo → select this repo.
   - Leave Root Directory as the repo root (`railway.toml` already points the
     build/start commands at `backend/`).
   - Railway assigns a public URL like `https://<service>.up.railway.app`.

2. Confirm the backend health endpoint returns `{"status":"ok"}`:

   ```bash
   curl https://<service>.up.railway.app/health
   ```

3. In the Vercel project for `frontend/`, set the environment variable for
   Production, Preview, and Development:

   ```text
   NEXT_PUBLIC_API_URL=https://<service>.up.railway.app
   ```

4. Redeploy the Vercel frontend after setting the environment variable.

If `NEXT_PUBLIC_API_URL` is missing or wrong, the frontend cannot reach the
backend and the browser will report a load/fetch failure instead of producing
results.

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

## Optional tRNA-suite QC

The FastAPI `/align` endpoint also accepts optional tRNA-suite-inspired inputs
without changing the default ladder alignment path:

| Parameter | Default | Purpose |
|---|---:|---|
| `sample_type` | `natural_RNA` | Use `natural_RNA` 5′ offset `97.9769` or `synthetic_RNA` 5′ offset `18.015` when computing sequence-derived theoretical masses |
| `mod_mass_file` | — | Optional CSV/XLSX dictionary with `Symbol`, `Nucleotide`, `Base`, and optional `Mass` columns |
| `raw_peak_file` | — | Optional raw peak CSV/XLSX for ppm matching, unmatched peak reporting, coverage, and peak reuse counts |
| `raw_peak_ppm` | `10` | ppm window for raw peak matching |
| `raw_peak_mass_min` / `raw_peak_mass_max` | `800` / `30000` | mass range retained in the unmatched peak list |
| `run_base_call` | `false` | Enables experimental unmatched-peak base-call candidate search |

Unknown residue tokens are strict errors unless supplied through
`mod_mass_file` or precomputed theoretical CSVs. The backend does not guess
unknown modified bases from token spelling.

## Requirements

Python 3.10+. See `requirements.txt`.
