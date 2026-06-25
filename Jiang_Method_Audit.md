# Jiang_Method_Audit.md

## Compliance audit: "Nested Algorithm for tRNA mixtures using block-wise relative intensity"

This document maps every step of Dr. Jiang's method to the exact code in
`trna_nested_algorithm.py` that implements it, and to the exact output
file/field a reviewer can open to verify that step ran as described. It
was written by reading the current implementation directly (function
bodies, docstrings, and config fields), not from memory of earlier
conversation — every "proof" line below is a real file/column/field name
that exists in this repo's output today.

A condensed, machine-readable version of this same mapping is written
into every run's `base_calling_report.json` as `method_compliance`, so a
script can check compliance without parsing this file.

---

### Step 1 — M/I/T input columns

- **Implemented:** yes
- **Proof:** `load_data()` (resolves Mass/Intensity/RT columns from the
  source Excel via `_resolve_column`'s keyword matching, then renames them
  to `M`/`I`/`T`). Every output file downstream carries these three
  columns under those names — see `annotated_data.csv` columns `M, I, T`.
- **Limitations:** Column identification is keyword-based (`_resolve_column`
  matches header text against known synonym sets for mass/intensity/RT,
  e.g. "Monoisotopic Mass", "Sum Intensity", "Apex RT"). A deconvoluted
  export with unrecognized headers would fail to load rather than
  silently guessing.

### Step 2 — Mass-ascending sort

- **Implemented:** yes
- **Proof:** `load_data()`: `df.sort_values("M", ascending=True,
  ignore_index=True)`. Verify in `annotated_data.csv` — row order is
  strictly ascending by `M`.
- **Limitations:** None — this is a direct, unconditional sort with no
  tunable parameter.

### Step 3 — Block definition, k range, block width

- **Implemented:** yes
- **Proof:** `BLOCK_WIDTH_DA = 320.0` and `N_BLOCKS = 95` (module
  constants, `k = 1..95`), applied in `assign_blocks()`. Verify via
  `annotated_data.csv['block']` (block index per point) and
  `base_calling_report.json['n_blocks']` (95 on the real workbook run).
- **Limitations:** `320.0` Da is documented in-code as "~ average
  single-nucleotide residue mass" — a fixed approximation, not derived
  per-run from the actual residue composition. `N_BLOCKS = 95` is a fixed
  ceiling; blocks beyond the data's mass range are simply unused rather
  than the count being computed from the input's actual mass span.

### Step 4 — Linear Rel.I = I / block max I

- **Implemented:** yes
- **Proof:** `compute_relative_intensity()` — always computes both
  `Rel_I` (linear, per-block-normalized) and `log10_intensity_qc` in the
  same call. Verify via `annotated_data.csv['Rel_I']`.
- **Limitations:** None for the linear computation itself. See Method
  Note 1/2 below — the log column exists alongside it but never feeds
  selection logic.

### Step 5 — Rel.I vs M visualization

- **Implemented:** yes
- **Proof:** `plot_relative_intensity()`, output file
  `relative_intensity.png`, path recorded at
  `base_calling_report.json['plot']`.
- **Limitations:** Static PNG only (matplotlib), not interactive — the
  dashboard's Section B chart is a separate, richer re-rendering of the
  same `Rel_I`/`M`/`block` columns, not this PNG.

### Step 6.1 — Seed order by highest unflagged Rel.I

- **Implemented:** yes
- **Proof:** `run_base_calling()` Phase 1: `intensity_order =
  df.sort_values("Rel_I", ascending=False)`, then `for seed in
  intensity_order: if used[seed]: continue` — global flag-and-exclude
  seeding, exactly Jiang-style. Verify via `chains[i].read_rank` ordering
  in `base_calling_report.json` (rank 1 = highest seed `Rel_I`).
- **Limitations:** None — this is an unconditional global sort with no
  tunable parameter.

### Step 6.2 — Mass hard filter → highest Rel.I → RT trend check

- **Implemented:** yes
- **Proof:** `_find_candidates()` (mass filter: only points whose mass
  delta matches an allowed residue/gap combination within `cfg.mass_tol`)
  feeding `_select_next()` (criterion 2: sort survivors by `Rel_I`
  descending; criterion 3: walk in that order, accept the first whose RT
  is within `cfg.rt_zscore` standard deviations of the chain's running RT
  trend). Verify via `Config.mass_tol`, `Config.rt_zscore`,
  `Config.rt_window` and `base_calling_report.json['gap_mode']` /
  `['max_residues_per_step_used']`.
- **Limitations:** `rt_zscore` and `mass_tol` are tunable thresholds, not
  literal values from the source document — they are the implementation's
  numeric stand-ins for "RT trend check" and "mass hard filter." A
  `rt_std_floor` config value prevents the RT z-score from blowing up
  when a chain's RT deltas are nearly constant (a numerical-stability
  heuristic, not part of the original method's description). `gap_mode`
  (`jiang_strict` vs `exploratory`) controls how many residues a single
  mass jump may span (`max_residues_per_step`) — `jiang_strict` is the
  paper-matching default.

### Step 6.3 — Stop when no candidate satisfies criteria

- **Implemented:** yes
- **Proof:** `_select_next()` returns `None` when no remaining candidate's
  RT fits the trend ("nothing satisfies all three criteria -> chain ends
  (6.3)"); `_extend_direction()` breaks the walk on that `None`. Verify
  via variable chain lengths in `base_calling_report.json['chains'][i]
  ['n_points']` — chains end at different lengths rather than running to
  a fixed size.
- **Limitations:** `Config.min_chain_len` additionally drops length-1
  "chains" (an unextendable single peak) from the reported chain list —
  those points are still marked used per 6.5, just not reported as a
  read. This is a reporting threshold, not part of the stopping rule
  itself.

### Step 6.4 — Paired-read 5′/3′ classification (decimal part + RT evidence, with confidence/warnings)

- **Implemented:** yes
- **Proof:** `classify_ladders()` + `find_best_pairs()` +
  `_pairwise_scores_vectorized()`. Verify via
  `base_calling_report.json['chains'][i]['ladder_type'/'ladder_confidence'
  /'ladder_evidence'/'ladder_warnings']`, and the full evidence columns in
  `read_summary.csv` / `Classification_Evidence.csv`
  (`paired_decimal_difference`, `paired_rt_difference`,
  `paired_length_overlap`, `mass_difference_consistency`,
  `decision_basis`, `fallback_median_used`).
- **Limitations:** The rule itself is exactly Jiang's ("smaller seed-mass
  decimal AND longer RT than the partner => 5′-ladder; disagreement =>
  conflict; no acceptable partner => ambiguous"), but two implementation
  details are heuristic, not literal values from the source method:
  `Config.min_pair_score` is a tunable cutoff for "acceptable partner
  found," and `ladder_confidence` is a composite score blending the pair
  score with a read-length adequacy factor (`length_factor`) so that a
  pair built on two short, barely-overlapping reads scores lower than an
  otherwise-identical pair built on two long, well-overlapping reads.
  Both are reasonable engineering choices to make 6.4 numerically usable,
  but neither has a numeric value specified in the original method
  description. The across-chain seed-decimal median is explicitly
  **never** the determining rule — see Method Note 3.

### Step 6.5 — Flag used peaks and avoid them in the next primary read

- **Implemented:** yes
- **Proof:** `_extend_direction()` sets `used[idx] = True` on every point
  it consumes; `_find_candidates()` excludes any point where
  `used_values[idx]` is true; Phase 1's seeding loop skips any seed where
  `used[seed]` is already true. Verify via `assign_peak_status()`'s
  output column `peak_status` in `annotated_data.csv` / `Peak_Status.csv`
  (every point is exactly one of `primary_used`, `ambiguous_retained`,
  `conflict_retained`, `reference_reused`, `unused` — no point is silently
  reused by two primary reads), and visually via `chains_overlay.png`
  (`plot_chains_overlay()`, explicitly tagged Step 6.5 in-code), which
  color-codes each chain's used points by ladder call.
- **Limitations:** None for primary reads — flagging is unconditional and
  global. The one *intentional* exception to "never reuse a flagged
  point" is Step 6.6's reference-guided reuse, which is a separate,
  strictly second-stage mechanism — see Method Note 5.

### Step 6.6 — Reference-dependent second-stage comparison/reuse (only if reference is supplied)

- **Implemented:** reference-dependent (no-op without a supplied
  reference; this is by design, not a missing feature)
- **Proof:** `apply_reference_guided_extension()` — explicit early return
  (`if not cfg.reference or not chains: return audit_log`) when no
  reference is configured. Verify via `base_calling_report.json
  ['review_summary']['reference_provided']` (`false` on demo/demo-hard,
  since neither run supplies a reference) and the conditional presence of
  `report['reference_comparisons']` and `Reference_Reuse_Audit.xlsx`
  (only written when `cfg.reference is not None`).
- **Limitations:** Only exercised on runs that pass `--reference` /
  `cfg.reference`. Demo and demo-hard in this repo's `sample_outputs/` do
  **not** supply a reference, so this step's audit status for those two
  specific runs is "not exercised this run" even though the code path is
  fully implemented and was validated separately (demo+reference scenario,
  per `IMPLEMENTATION_PLAN.md` §1's validation note).

### Step 6.7 — Generate many short reads in Rel.I order; report their relationships / top parallel reads

- **Implemented:** yes
- **Proof:** `build_top_parallel_reads_grid()` (`Top_Parallel_Reads.csv`/
  `.xlsx`, side-by-side layout mirroring Dr. Jiang's own worked example,
  ranked strictly by linear seed `Rel_I`) and
  `build_top_parallel_reads_long()` (`top_parallel_reads_long.csv`, the
  dashboard's structured counterpart). Read relationships are reported
  via `assemble_contigs()` (explicitly tagged Step 6.7 in-code) →
  `base_calling_report.json['contig_groups']`, grouping overlapping short
  reads.
- **Limitations:** `assemble_contigs(min_overlap=2)`'s overlap threshold
  is a tunable heuristic for "what counts as overlapping enough to
  belong to the same contig group" — not a literal value from the source
  document.

---

## Method Notes

1. **Linear Rel.I is always used for selection.** Every selection
   decision in Step 6 (seeding order in Phase 1, candidate ranking in
   `_select_next`, pair scoring in `find_best_pairs`) reads the `Rel_I`
   column exclusively. `Config.intensity_scale` only controls which
   column the *plots* (`plot_relative_intensity`, `plot_chains_overlay`)
   draw — it has no path into any classification or candidate-selection
   function. Changing it cannot change which reads are recovered or how
   they're classified.

2. **Log intensity is QC/display only.** `log10_intensity_qc` is computed
   alongside `Rel_I` in `compute_relative_intensity()` for visual
   inspection of low-intensity points that linear scaling compresses, and
   is read only by the plotting functions and the dashboard's log10
   toggle (which explicitly captions "display only — classification
   always uses linear Rel.I"). No function in the base-calling path
   (`run_base_calling`, `build_chain`, `_select_next`, `classify_ladders`,
   `find_best_pairs`) ever reads this column.

3. **Step 6.4 is evidence-based paired-read classification, not absolute
   ground truth.** `classify_ladders()`'s docstring states the rule
   plainly: a partner with agreeing decimal/RT evidence → 5′ or 3′; a
   partner with disagreeing evidence → `conflict` (evidence exists, it's
   just contradictory); no acceptable partner → `ambiguous` (no evidence
   either way — explicitly "NOT a guess"). The across-chain seed-decimal
   median is reported only as a low-weight, clearly-labeled supplementary
   note on unpaired chains, with `ladder_confidence` forced to `0.0` in
   that case specifically so a reviewer never mistakes "ambiguous" for "a
   confident but weak answer."

4. **Step 6.6 is only exercised when a reference sequence is supplied.**
   `apply_reference_guided_extension()` returns an empty audit log
   immediately if `cfg.reference` is unset; every chain still gets an
   empty `reuse_evidence` list so the report schema stays uniform across
   reference and no-reference runs, but no reuse logic runs.

5. **Primary reads do not reuse peaks; reference-guided reuse is a
   separate second-stage event.** `_extend_direction()` (Phase 1) only
   ever consumes points where `used[idx]` is false, and marks every point
   it takes as used — by construction, no primary read can take a point
   another primary read already claimed. `apply_reference_guided_extension`
   (Phase 2) runs strictly afterward, once every primary read already has
   a stable `read_rank`, and only adds points on top of an existing read's
   ends; it never alters which points seeded or built any Stage-1 read.
   This ordering is enforced by `run_base_calling()`'s three-phase
   structure (Phase 1 → Phase 2 → Phase 3), not by a runtime check that
   could silently be bypassed.
