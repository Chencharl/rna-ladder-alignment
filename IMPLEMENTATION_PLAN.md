# IMPLEMENTATION_PLAN.md

Companion to `DESIGN.md`. Three deliverables in one document, per the
user's request: the Excel output cleanup plan (retrospective), the
dashboard implementation plan, and the data-dependency map for each
panel. **No dashboard UI code is written against this plan yet** — it is
the map that a future coding session builds from.

All column names and counts below were re-verified directly against a
real-workbook run's output files immediately before writing this
document (not assumed from memory).

---

## 1. Excel output cleanup plan (already implemented and validated)

| Action | Before | After |
|---|---|---|
| Files produced | `Read_Summary_Review.xlsx`, `Top_Parallel_Reads.xlsx`, `Peak_Status.xlsx`, `Classification_Evidence.xlsx`, `Reference_Reuse_Audit.xlsx` (sometimes `Reference_Reuse_Audit_DEMO_EXAMPLE.xlsx`) | Same five real files; the demo-example file is no longer written into a real-data run's output folder |
| `Reference_Reuse_Audit.xlsx` sheets | `Candidates`, `Accepted`, `Rejected`, **`Summary`** (one-row aggregate) | `Candidates`, `Accepted`, `Rejected` only — the aggregate moved to `review_summary` in `base_calling_report.json` so it isn't duplicated in two places |
| When `Reference_Reuse_Audit.xlsx` is written | Whenever the reuse code path ran, including demo mode with no real reference | Only when `cfg.reference is not None` — never appears in a normal real-data run without `--reference` |
| Ambiguous human label | `"?"` (in `ladder_call` everywhere it's used: Read Summary, Peak Status, Top Parallel Reads headers) | `"ambiguous"` (literal word), changed in the single source function `_human_ladder_label` so it propagates everywhere automatically |

**Rule going forward**: Excel stays a row-level data package (every row
is one read or one peak), never an aggregate/dashboard-style summary
sheet. Any new aggregate number belongs in `review_summary` /
`base_calling_report.json`, which the dashboard reads — not in a new
Excel sheet.

**Validated on**: demo, demo-hard, demo+reference, and the real workbook.
Chain/classification counts are unchanged from before the cleanup;
only the sheet layout and the ambiguous label text changed.

---

## 2. Dashboard implementation plan

### 2.1 What already exists vs. what dashboard code must add

Everything the dashboard needs to *display* already exists in
`base_calling_report.json` plus the four (or five) Excel/CSV outputs —
**except** four fields called out in §4 below, which are currently
absent from the report and must be added to `trna_nested_algorithm.py`
before Section A can be fully data-backed. This plan treats that as
prerequisite work, not dashboard work.

### 2.2 Suggested build order

1. **Data layer first**: a thin loader that reads
   `base_calling_report.json` plus `annotated_data.csv` /
   `read_summary.csv` (CSV, not Excel — Excel is the human-review export,
   the dashboard's data source is the CSV/JSON the pipeline already
   writes) and exposes one in-memory run object the rest of the app reads
   from. No re-computation of anything the pipeline already computed.
2. **Section A (Run Overview)** — once the four schema gaps in §4 are
   filled, this is the simplest section (single object, no table/chart
   library needed) and validates the data layer end-to-end.
3. **Section D + E together** (Read Summary + Classification Evidence) —
   these share the split-pane and the row-selection interaction; building
   them together avoids building the selection plumbing twice.
4. **Section C (Top Parallel Reads)** — reuses the same row-selection
   plumbing from step 3, feeds the same Section E pane.
5. **Section F (Peak Status)** — large flat table (~16k rows), this is
   where virtualized-table performance must be proven before B's chart
   (which renders similar point counts) is built.
6. **Section B (Relative Intensity Map)** — chart work, can reuse the
   point-color-by-ladder-call logic already designed in F.
7. **Section G (Reference-Assisted Review)** — only testable with a
   demo+reference or real+reference run; build last since it's
   conditionally hidden for most runs anyway.
8. **Section H (Export Panel)** — last; it is just download links to
   files the pipeline already wrote, no new computation.

### 2.3 What's shown in the dashboard vs. kept in Excel vs. exportable

| Content | Dashboard | Excel | Exportable from dashboard |
|---|---|---|---|
| Aggregate run stats (counts, runtime, warnings) | Yes — only place that shows this | No (by design, see §1) | Via JSON report download |
| Per-read evidence detail | Yes (Section E) | Yes (`Classification_Evidence.xlsx`) | Both — dashboard view and the Excel file are the same data, two presentations |
| Full read table, all ~29 columns | Default view shows ~8 columns (§13 of DESIGN.md); full set via column picker | Yes, all columns always | CSV "current view" export reflects whatever's visible |
| Full peak table (~16k rows) | Yes (Section F), virtualized | Yes (`Peak_Status.xlsx`) | Yes |
| Charts (scatter, overlay) | Yes (Section B), interactive | No (Excel has no charts) | PNG exports of the static pipeline-rendered versions |
| Reference reuse audit | Yes (Section G), when applicable | Yes (`Reference_Reuse_Audit.xlsx`), when applicable | Both |

---

## 3. Data dependency map (per dashboard panel)

Source files, all confirmed present in a real run's output folder:
`base_calling_report.json`, `annotated_data.csv`, `read_summary.csv`,
`Top_Parallel_Reads.csv`, plus the four/five Excel files (Excel column
sets are identical to their CSV counterparts where both exist).

### A. Run Overview
| Field shown | Source | Path/column | Status |
|---|---|---|---|
| File name | — | — | **Gap — not in report today, see §4** |
| Run status | — | — | **Gap — no explicit success/failure flag today; report presence/absence is the only current signal** |
| Runtime | — | — | **Gap — see §4** |
| Input peak count | `base_calling_report.json` | `n_points` (16,466 on real run) | Present |
| Block count | — | derivable as `annotated_data.csv['block'].nunique()` (95 on real run) but not exposed as a report field | **Gap — see §4** |
| Recovered read count | `base_calling_report.json` | `n_chains` (4,490 on real run) | Present |
| 5′/3′/ambiguous/conflict counts | `base_calling_report.json` | `review_summary.reads_5prime` / `reads_3prime` / `reads_ambiguous` / `reads_conflict` | Present |
| primary_used / reference_reused / unused peak counts | `base_calling_report.json` | `review_summary.primary_used_peaks` only | **Partial gap — only primary_used_peaks exists; ambiguous_retained/conflict_retained/reference_reused/unused are not aggregated, see §4** |
| Warning banner (top-4 mostly ambiguous/conflict) | `Top_Parallel_Reads.csv` or `base_calling_report.json.chains` (top 4 by rank) | `ladder_type` of the 4 lowest `read_rank` chains | Present (dashboard-side logic, no new data needed) |

### B. Relative Intensity Map
| Field shown | Source | Path/column |
|---|---|---|
| Mass, Rel.I (linear) | `annotated_data.csv` | `M`, `Rel_I` |
| Rel.I (log10 QC toggle) | `annotated_data.csv` | `log10_intensity_qc` |
| Retention time (tooltip) | `annotated_data.csv` | `T` |
| Block boundaries | `annotated_data.csv` | `block` |
| Point's peak status (color when no chain overlay) | `annotated_data.csv` | `peak_status` |
| Chain overlay (point's read + ladder call, color when overlay on) | `Peak_Status.xlsx`/equivalent CSV, or join `annotated_data.csv` index against `chains[i].indices`-derived membership | `read_rank`, `ladder_call` (already pre-joined in `Peak_Status.xlsx`'s columns) |
| Static PNG fallback | `base_calling_report.json` | `plot`, `chains_overlay_plot` (paths/base64 — confirm encoding before wiring) |

### C. Top Parallel Reads
| Field shown | Source | Path/column |
|---|---|---|
| Per-read header (rank, ladder call, confidence) | `Top_Parallel_Reads.csv`/`.xlsx` | grid header text `"Read (rank N) -- <call> (confidence: <tier>)"` — **dashboard should consume the underlying structured fields, not parse this string; use `base_calling_report.json.chains` filtered/sorted by `read_rank` for the same 4 reads instead** |
| Per-row: Mass, Rel.I, RT, residue/mass Call, Peak Status | `Top_Parallel_Reads.csv` | sub-columns `Mass (Da)`, `Rel.I`, `RT (min)`, `Call`, `Peak Status` (one block of 5 per read, confirmed via direct file inspection) |
| Ladder call shown as chip | same row group | derived from the block header's `<call>` token, or better, `base_calling_report.json.chains[i].ladder_type` via `_human_ladder_label` |
| Confidence shown separately | same | block header's `(confidence: <tier>)` token, or `chains[i].ladder_confidence` |

### D. Read Summary
| Field shown | Source | Path/column |
|---|---|---|
| Read rank | `read_summary.csv` | `read_rank` |
| Ladder call (chip) | `read_summary.csv` | `ladder_call` |
| Confidence tier | `read_summary.csv` | `ladder_confidence_tier` |
| Review priority | `read_summary.csv` | `review_priority` |
| Read length | `read_summary.csv` | `read_length` |
| Mean Rel.I | `read_summary.csv` | `mean_rel_i` |
| Partner read | `read_summary.csv` | `candidate_partner_rank` |
| Warnings | `read_summary.csv` | `ladder_warnings` |
| Default-filter flags | `read_summary.csv` | `primary_review`, `top_parallel_group`, `low_confidence_noise` |
| Full evidence columns (column picker) | `read_summary.csv` | `seed_index`, `seed_mass`, `seed_mass_integer`, `seed_mass_decimal`, `seed_rt`, `start_block`, `partner_seed_mass`, `partner_seed_mass_integer`, `partner_seed_mass_decimal`, `paired_decimal_difference`, `paired_rt_difference`, `paired_length_overlap`, `mass_difference_consistency`, `precursor_or_intact_mass_closure`, `decision_basis`, `fallback_median_used`, `ladder_classification` (internal label), `ladder_confidence`, `ladder_evidence` |

Confirmed full column list (29 columns), `read_summary.csv`/
`Read_Summary_Review.xlsx`, identical schema:
`read_rank, ladder_call, ladder_confidence_tier, review_priority,
primary_review, top_parallel_group, low_confidence_noise, seed_index,
seed_mass, seed_mass_integer, seed_mass_decimal, seed_rt, start_block,
read_length, mean_rel_i, candidate_partner_rank, partner_seed_mass,
partner_seed_mass_integer, partner_seed_mass_decimal,
paired_decimal_difference, paired_rt_difference, paired_length_overlap,
mass_difference_consistency, precursor_or_intact_mass_closure,
decision_basis, fallback_median_used, ladder_classification,
ladder_confidence, ladder_evidence, ladder_warnings`.

### E. 5′/3′ Classification Evidence
`Classification_Evidence.xlsx` is already exactly this panel's data —
the detail pane is effectively "look up the selected `read_rank`'s row
in this table and lay it out vertically instead of in a row." Confirmed
columns (15): `read_rank, ladder_call, ladder_confidence_tier,
candidate_partner_rank, seed_mass_integer, seed_mass_decimal,
partner_seed_mass_integer, partner_seed_mass_decimal,
paired_decimal_difference, paired_rt_difference,
paired_length_overlap, decision_basis, fallback_median_used,
ladder_evidence, ladder_warnings`.

The "why this call" sentence (DESIGN.md §17.E) is generated dashboard-side
from `decision_basis` + `fallback_median_used` — no new pipeline field
needed, this is a string-template over two existing columns.

### F. Peak Status
Confirmed columns (8), `Peak_Status.xlsx`: `mass, rel_intensity, rt,
block, peak_status, read_rank, ladder_call, role`. 16,466 rows on the
real run. This is a direct 1:1 table render; status filter chips operate
on `peak_status`, read-rank filter on `read_rank`.

### G. Reference-Assisted Review
`Reference_Reuse_Audit.xlsx` (only present when `cfg.reference` was
supplied), columns: `read_rank, end, outcome, reason, reference_position,
expected_residue, candidate_peak_mass, observed_mass_delta,
reused_from_read_rank`, split into `Candidates`/`Accepted`/`Rejected`
sheets by `outcome`. Reference alignment view itself (the sequence
track) is **not yet a discrete data structure in the report** — today the
evidence is row-level (each candidate's `reference_position` /
`expected_residue`); rendering an actual aligned-sequence track is
dashboard-side work that assembles these rows in `reference_position`
order, not a new pipeline output. Flagged here as a build-time decision,
not a blocking gap, since the row data needed already exists.

### H. Export Panel
Direct links to whatever the pipeline wrote this run, read from
`base_calling_report.json`'s own path fields where present
(`read_summary_csv`, `Top_Parallel_Reads_csv`, `Top_Parallel_Reads_xlsx`,
`Read_Summary_Review_xlsx`, `Peak_Status_xlsx`,
`Classification_Evidence_xlsx`, `annotated_csv`) plus
`Reference_Reuse_Audit.xlsx` and the two PNGs (`relative_intensity.png`,
`chains_overlay.png`) by convention (same output folder, fixed names —
confirm whether the report JSON should also carry these two PNG and the
reuse-audit path explicitly; today they're inferred by filename
convention rather than listed in the report, a minor follow-up but not
blocking since the filenames are fixed and documented).

---

## 4. Data schema gaps — required before Section A is fully data-backed

These are concrete, named additions to `base_calling_report.json`,
**not implemented in this step** per the user's explicit "design and
planning only" instruction. Listed here so the next coding session has
an exact spec:

1. **`file_name`** — the input workbook path/name. Trivial to add:
   `cfg.input_path` (or equivalent) is already known inside `run_pipeline`
   at report-construction time.
2. **`runtime_seconds`** — wall-clock duration of the pipeline run.
   Requires wrapping `run_pipeline`'s body with a start/end timestamp;
   no algorithmic change, purely instrumentation.
3. **`n_blocks`** — block count. Already computable as
   `df['block'].nunique()` (confirmed = 95 on the real workbook) at the
   point `annotated_data.csv` is finalized; just needs to be written into
   the report dict.
4. **Full `peak_status` breakdown in `review_summary`** — today only
   `primary_used_peaks` is aggregated. Add `ambiguous_retained_peaks`,
   `conflict_retained_peaks`, `reference_reused_peaks`, `unused_peaks`
   (all derivable from the same `df['peak_status'].value_counts()` call
   that already produces `primary_used_peaks`, confirmed on the real run:
   `primary_used=6526, unused=5374, conflict_retained=2967,
   ambiguous_retained=1599`, `reference_reused=0` absent unless
   `--reference` supplied).

None of these require new analysis or changed classification logic —
all four are values the pipeline already computes or trivially can
compute, just not yet written into the report dict. Section A cannot
show "file name," "runtime," "block count," or the full peak-status
breakdown until these are added.

---

## 5. Summary checklist for the next session

- [ ] Add the 4 fields in §4 to `base_calling_report.json`.
- [ ] Build the data loader (§2.2 step 1) against the *current* schema
      plus the 4 new fields.
- [ ] Build sections in the order in §2.2.
- [ ] Re-run the four validation scenarios (demo / demo-hard /
      demo+reference / real) after the schema change, same as Task #30's
      validation pass, before wiring the dashboard to live data.
