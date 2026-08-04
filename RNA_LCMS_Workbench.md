# RNA LC-MS Sequencing Workbench

A web-based analysis platform for de novo RNA sequence determination from
liquid chromatography–mass spectrometry (LC-MS) hydrolysis ladder data.

**Live tool:** [rna-ladder-frontend.vercel.app](https://rna-ladder-frontend.vercel.app)

---

## Overview

This workbench implements a nested-ladder base-calling algorithm for RNA
sequence determination by LC-MS. Starting from a raw deconvoluted mass
spectrum exported from Xcalibur or similar software, the pipeline recovers
5′ and 3′ ladder fragment series, assembles them into candidate sequence
reads, and computes position-by-position mass evidence against any supplied
reference sequence.

The tool was developed to support analysis of ribosomal RNA (rRNA) species
(5S, 5.8S, 18S, 28S) and tRNA mixtures isolated from human cell lines (HEK
293T, HepG2). It is designed to closely follow the manual workflow described
in the originating laboratory's analysis protocol.

---

## Scientific Background

### Hydrolysis Ladder MS

RNA is subjected to partial enzymatic or chemical hydrolysis, generating a
statistical population of fragments from every position along the backbone.
When these fragments are separated by reversed-phase ion-pairing LC and
detected by high-resolution Fourier-transform MS (Orbitrap), the resulting
deconvoluted mass spectrum contains a near-complete "ladder" of fragment
masses. Because each successive fragment in the ladder differs by exactly
one nucleotide residue mass, the sequence of mass differences directly
encodes the RNA sequence:

| Residue | Monoisotopic residue mass (Da) |
|---------|-------------------------------|
| A (AMP) | 329.0525 |
| U (UMP) | 306.0253 |
| G (GMP) | 345.0474 |
| C (CMP) | 305.0413 |

Two independent ladder series are generated per molecule:
- **5′ ladder** — fragments retain the 5′ terminus; mass seed ≈ +97.977 Da (5′-phosphate)
- **3′ ladder** — fragments retain the 3′ terminus; mass seed ≈ −61.956 Da (2′,3′-cyclic phosphate)

Reading both ladders simultaneously provides redundant, orthogonal sequence
coverage and enables cross-validation of each position call.

### Nested Algorithm

The core de novo calling algorithm is the block-wise nested algorithm. The
mass axis is divided into 320 Da blocks (one per average nucleotide residue).
Within each block, peaks are ranked by block-normalized relative intensity
(`Rel_I = I / block_max_I`). The highest-`Rel_I` ungrouped peak in each
block is chosen as the seed for a new candidate chain; the algorithm then
extends the chain in both directions by looking for the next expected residue
mass (±tolerance) in the adjacent block. This "nested" seeding-and-extension
process continues until all meaningful intensity has been accounted for.

Key parameter: `max_residues_per_step = 3` — the algorithm permits up to 3
alternative residue identities at each extension step. This accounts for
modified nucleotides whose masses do not match canonical A/U/G/C.

### Prophet Matching (Reference-Guided Coverage)

When a reference sequence is known, "prophet matching" provides a
complementary analysis to de novo calling. For every position `i` in the
reference sequence, the algorithm computes the exact theoretical fragment
mass expected for the 5′ ladder (sum of all residues from position 1 to `i`)
and the 3′ ladder (sum of all residues from position `i` to the 3′ end),
then searches the observed peak list for any peak within a tolerance window.

A position is reported as **"hit"** if any observed peak falls within
±0.10 Da (100 mDa) of the theoretical mass. This tolerance reflects typical
Orbitrap mass accuracy at 5–22 kDa (5–10 ppm systematic shift for
deconvoluted high-molecular-weight ions). Unlike de novo chain building,
prophet matching does not require consecutive positions — it independently
confirms each position from the full peak list.

Coverage metrics reported per species:
- Number of positions with theoretical mass in the 2–23 kDa analysis window
- Number of those positions with an observed peak match (coverage %)
- Longest consecutive run of matched positions

---

## What Was Built

### 1. Core Pipeline (`trna_nested_algorithm.py`, `api/sequencing-assist.py`)

The nested base-calling algorithm runs as a serverless Python function on
Vercel. It accepts a raw deconvoluted Excel export, runs the full pipeline,
and returns:

- De novo candidate reads (chains) with 5′/3′ orientation classification
- Block-wise relative intensity scatter data
- Coverage statistics by intensity threshold and mass range
- RT quality regression (R² of retention time vs. log mass — a sigmoidal
  elution is expected for intact ladder runs)
- Empirical false discovery rate estimate
- Prophet matching results against built-in rRNA references and any
  user-supplied reference sequence
- A formatted Excel workbook with color-coded results, scatter charts, and
  per-species prophet coverage sheets

### 2. Multi-Species Prophet Matching

A key design requirement is that a single LC-MS run may contain hydrolysis
ladder fragments from multiple RNA species simultaneously (e.g., a 5S + 5.8S
rRNA co-elution). The pipeline therefore always runs prophet matching against
**both** built-in human rRNA references in parallel, regardless of whether
the user provides a custom reference:

| Reference | Length | Source |
|-----------|--------|--------|
| Human 5S rRNA | 120 nt | Cytoplasmic; component of 60S ribosomal subunit |
| Human 5.8S rRNA | 156 nt | Component of 60S ribosomal subunit; co-purifies with 5.8S |

Results for each species are returned as separate entries in the API response
(`preset_prophet_results`) and written as separate sheets in the Excel report.

### 3. Web Interface (`frontend/`)

A Next.js single-page application deployed on Vercel. Key panels:

| Panel | Content |
|-------|---------|
| **Rel.I vs. Mass** | Interactive scatter of all peaks colored by block; chains overlaid as connected series |
| **Mass vs. RT** | Sigmoidal elution profile; used to assess run quality and identify artifact zones |
| **De Novo Reads** | Table of top candidate sequence reads with 5′/3′ classification, chain length, and mass evidence |
| **Coverage by Intensity** | Fraction of observed peaks matched by chains, binned by Rel.I threshold |
| **Reference-Guided Coverage** | Tabbed prophet matching view — one tab per rRNA species — showing per-position hit/miss, Δmass, Rel.I, and RT for matched peaks |
| **Modification Candidates** | Peaks not explained by canonical ladder steps; ranked by unexplained mass shift |
| **Data Quality** | RT regression R², FDR estimate, subsampling summary |
| **Excel Download** | Full formatted workbook with all panels as sheets |

Large files (>3.5 MB) are parsed client-side by SheetJS before upload to
stay within Vercel's serverless function payload limit. Charge-1 deconvoluted
exports (which may contain >150,000 rows) are automatically pre-subsampled
to the top-50 highest-intensity peaks per 320 Da block before transmission.

### 4. Deployment Architecture

```
User browser
    │  POST /api/sequencing-assist (FormData: file or data_json)
    ▼
Vercel (Next.js + Python serverless function)
    ├── frontend/  — Next.js App Router, static generation
    └── api/sequencing-assist.py  — Python 3.12 (uv), 60s max, 2048 MB
            ├── trna_nested_algorithm.py  (core algorithm)
            └── api/trna_reference.py     (tRNA reference library)
```

The entire analysis — upload, pipeline, Excel generation — completes in a
single HTTP request (no session state between calls). A typical Charge-2
rRNA file (30 k peaks) completes in ~1–2 seconds.

---

## Mass Accuracy Note

Orbitrap mass spectrometers achieve sub-ppm accuracy on small molecules
(<1 kDa). For deconvoluted RNA fragments at 5–22 kDa, systematic errors
of 30–100 mDa are normal due to:

1. Charge-state deconvolution error accumulation across many charge states
2. Space-charge effects at high m/z
3. Internal calibration mismatch at high mass

The ±100 mDa prophet matching tolerance was empirically calibrated against
observed Δmass distributions in HEK 293T 5.8S rRNA charge-1 data, where
most matched positions showed +30 to +75 mDa systematic offset. A tighter
tolerance (±20 mDa, appropriate for peptide MS) would miss the majority of
true matches.

---

## Input File Format

The tool accepts the standard deconvoluted mass output from Xcalibur /
Thermo BioPharma Finder. The following column names are recognized (case-
insensitive):

| Data | Accepted column names |
|------|-----------------------|
| Monoisotopic mass (Da) | `Monoisotopic Mass`, `Mass`, `Molecular Weight`, `MW`, `Deconv Mass` |
| Peak intensity | `Sum Intensity`, `Intensity`, `Peak Intensity`, `Signal`, `Area`, `Height` |
| Apex retention time (min) | `Apex RT`, `RT`, `Retention Time`, `Apex Retention Time` |

Analysis is restricted to the 2,000–23,000 Da mass range. Peaks outside
this range are discarded before the pipeline runs.

---

## Output Excel Workbook

Each analysis produces a color-coded `.xlsx` file with the following sheets:

| Sheet | Contents |
|-------|----------|
| **Peak Data** | All input peaks with block assignment, Rel.I, and chain membership |
| **Top Reads** | Top candidate sequence reads ranked by chain length × intensity |
| **Coverage** | Block-wise and intensity-threshold coverage statistics |
| **Modification Candidates** | Unexplained high-intensity peaks with mass-shift candidates |
| **5S rRNA (120 nt)** | Prophet coverage table and scatter charts for 5S rRNA |
| **5.8S rRNA (156 nt)** | Prophet coverage table and scatter charts for 5.8S rRNA |
| **Prophet Coverage (Custom)** | Per-position results for any user-supplied reference (present only when a custom sequence is entered) |

Prophet coverage sheets include two embedded charts per species:
1. **RT elution profile** — sequence position vs. apex RT for detected 5′ and 3′ fragments
2. **Mass accuracy** — sequence position vs. Δmass (mDa), showing the systematic offset profile

---

## Usage

### Web interface (recommended)

1. Open [rna-ladder-frontend.vercel.app](https://rna-ladder-frontend.vercel.app).
2. Upload a raw deconvoluted Excel export from Xcalibur / BioPharma Finder.
3. Optionally enter a reference sequence in the **Reference sequence** field, or
   select a preset (5S rRNA or 5.8S rRNA) from the dropdown.
4. Click **Run Analysis**.
5. Review results in the browser, then click **Download Excel** for the
   full formatted workbook.

### Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| Minimum chain length | 10 nt | Chains shorter than this are excluded from the Top Reads table |
| Minimum Rel.I seed | 5% | Peaks below this block-normalized intensity are not used as chain seeds |
| Precursor mass | — | If the intact RNA mass is known, enter it here to enable closure scoring |
| Prophet tolerance | ±100 mDa | Fixed; appropriate for deconvoluted Orbitrap data at 5–22 kDa |
| max_residues_per_step | 3 | Number of alternative residue identities tested at each chain extension step |

---

## Repository Structure

```
rna-ladder-alignment/
├── api/
│   ├── sequencing-assist.py       Main serverless API handler + prophet matching
│   ├── trna_reference.py          tRNA 46-family reference library
│   └── requirements.txt
├── frontend/
│   └── app/sequencing-assist/
│       ├── page.tsx               Main page + state management
│       ├── lib/
│       │   ├── api.ts             API client + TypeScript interfaces
│       │   └── types.ts           Shared types
│       └── components/
│           ├── ProphetMatchingView.tsx   Tabbed multi-species prophet display
│           ├── PeakScatterPlot.tsx
│           ├── MassRTPlot.tsx
│           ├── DeNovoReadsTable.tsx
│           └── ...
├── trna_nested_algorithm.py       Core nested base-calling algorithm
├── vercel.json
└── README.md
```

---

## Algorithm Parameters (Fixed Constants)

| Constant | Value | Meaning |
|----------|-------|---------|
| `BLOCK_WIDTH_DA` | 320.0 Da | Width of each intensity normalization block |
| `N_BLOCKS` | 95 | Maximum number of blocks (covers up to ~30.4 kDa) |
| `_MASS_START_5P` | +97.9769 Da | 5′-phosphate terminus mass offset |
| `_MASS_START_3P` | −61.9558 Da | 2′,3′-cyclic phosphate terminus mass offset |
| `max_residues_per_step` | 3 | Max alternative residues tested per chain extension |
| `PRE_SUB_LIMIT` | 20,000 rows | Row count above which pre-subsampling is applied |
| Prophet tolerance | 0.10 Da | Search window for reference-guided peak matching |

---

## Limitations and Caveats

- **Prophet matching is not sequence confirmation.** A hit at a given position
  means an observed peak is within 100 mDa of the theoretical mass — it does
  not prove that peak originates from that fragment. Orthogonal validation
  (e.g., stable isotope labeling, orthogonal fragmentation, or comparison
  against a synthetic standard) is required before reporting sequence positions
  as confirmed.

- **Modified nucleotides appear as gaps or shifted runs.** Modifications that
  block hydrolysis (e.g., 2′-O-methylation) produce a gap in the ladder;
  modifications that change the residue mass (e.g., pseudouridine, m5C)
  produce a shifted step. The Modification Candidates panel lists peaks whose
  mass steps do not match any canonical residue, ranked by unexplained
  intensity.

- **Mixed-species samples.** Prophet matching runs against all built-in
  references simultaneously, but de novo chain building does not distinguish
  which species a chain originated from. In a mixed 5S + 5.8S sample,
  chains from both species are assembled together.

- **Charge-1 files are large.** A single charge-1 deconvoluted export for an
  rRNA species may contain >100,000 rows. The client-side pre-subsampling
  step (top-50 by intensity per 320 Da block) reduces this to <20,000 rows
  before the pipeline runs, with no meaningful loss of sequence information
  for abundant species.
