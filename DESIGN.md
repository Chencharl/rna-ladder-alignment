# DESIGN.md

## LadderScope — Nested tRNA Base-Calling Review Console

This is the design specification for the web dashboard that sits on top of
`trna_nested_algorithm.py` (Dr. Jiang's nested algorithm for de novo
base-calling of tRNA mixtures from deconvoluted LC-MS data). It defines
visual language and page structure only. No frontend code is written
against this spec yet — see `IMPLEMENTATION_PLAN.md` for the data-mapping
and build sequencing that must happen first.

---

## 1. Product name

**LadderScope** — a review console for nested-ladder tRNA base-calling
runs. ("Scope" because its job is to let a scientist look *into* a run the
algorithm already finished, not to run the algorithm interactively.)

Subtitle used in the UI: *Nested tRNA Base-Calling Review Console*.

## 2. Dashboard purpose

LadderScope is **not** a consumer analytics dashboard and it is not a
general-purpose BI tool. It has one job: let a mass-spec scientist decide,
read by read and peak by peak, whether a completed base-calling run is
trustworthy enough to act on. Every panel exists to answer one of these
questions:

- What data went in, and how much of it did the algorithm actually use?
- Which reads got a confident 5′/3′ call, and on what specific evidence?
- Which reads are ambiguous or conflicting, and why?
- If a reference sequence was supplied, did reference-guided reuse behave
  correctly — and can every reuse decision be traced back to a reason?

It is a **review tool**, not an editing tool. Nothing in the dashboard
mutates the underlying run; correction happens by re-running the pipeline
with different parameters (mass tolerance, RT z-score, reference sequence,
etc.) outside the dashboard, then loading the new run.

## 3. Target users

- **Primary**: Dr. Jiang and other mass-spec scientists reviewing a
  finished run before trusting its calls. Comfortable with LC-MS
  terminology (Rel.I, RT, monoisotopic mass, charge-deconvolution) but not
  necessarily technical/software users — the UI must not require knowing
  what "ladder_classification" vs. "ladder_call" means internally.
- **Secondary**: a bioinformatics collaborator who wants to sanity-check
  the algorithm's behavior across many runs, or compare a run with vs.
  without a reference sequence.

Both users are reviewing **someone else's already-completed analysis**,
usually their own pipeline run from minutes or hours earlier. They are not
casual users glancing at a phone — design for a desktop browser, dense
data, and sustained focused review (tens of minutes per session).

## 4. Page layout

Single-page application, three persistent regions:

```
┌─────────────────────────────────────────────────────────────────┐
│  Top bar: file name · run status chip · n_chains · runtime ·    │
│           [Export ▾]                                            │
├───────────────┬───────────────────────────────────────────────--┤
│               │                                                 │
│  Left nav     │   Active section panel                         │
│  (sections    │   (one section visible at a time; not an       │
│   A–H)        │    infinite-scroll page — Peak Status alone     │
│               │    can hold 15k+ rows)                          │
│               │                                                 │
└───────────────┴─────────────────────────────────────────────────┘
```

- **Top bar** is always visible and carries the Run Overview's most
  load-bearing facts (Section A condenses into it once a section other
  than Overview is active), plus the global export menu.
- **Left nav** lists sections A–H by name. Section G (Reference-Assisted
  Review) is present in the nav but disabled/greyed with a tooltip
  ("No reference sequence supplied for this run") when `reference_provided`
  is false — never silently hidden, so a user doesn't wonder if it's a bug.
- **Main panel** renders exactly one section. Read Summary (D) and
  Classification Evidence (E) are the one exception that share a
  split-pane: D is the left ~60%, E is a detail pane on the right ~40%
  that updates when a row in D (or a card in C) is selected. Selecting
  nothing shows E with a "Select a read to see its evidence" empty state.

## 5. Navigation

- Section switches are instant client-side state changes (no page reload;
  this is one run's data already loaded).
- Selecting a read (in Top Parallel Reads or Read Summary) is the one
  cross-section link: it updates the Classification Evidence detail pane
  and, optionally, highlights that read's peaks if the user then visits
  Peak Status (a "Filtered by read #N — Clear" chip at the top of Peak
  Status when arriving this way).
- Breadcrumbs are unnecessary (only one level of depth). A persistent
  "Run: <file name>" label in the top bar is the only orientation anchor
  needed.

## 6. Visual style

Scientific instrument-software aesthetic, not a marketing dashboard:
neutral light background, generous data density, color reserved
*exclusively* for status/classification meaning (never decoration). Think
Skyline, MassHunter, Proteome Discoverer — not a SaaS analytics product.

Concretely:
- No gradients, no drop shadows beyond a 1px border-replacement, no
  decorative icons next to every label.
- Numeric columns are monospaced and right-aligned so a column of masses
  visually lines up on the decimal point.
- Color appears on: status chips, scatter-plot point fill, table row
  accents (a 3px left border, not a full-row tint), and warning/error
  banners. Nowhere else.
- Whitespace is functional (separates panels, sets row height for
  scanability) — not aesthetic breathing room. This is a working tool,
  not a brochure.

## 7. Color tokens

```
--bg-page:           #F7F8FA   page background
--bg-surface:         #FFFFFF   cards, table surface
--bg-surface-sunken:  #F1F2F4   table header row, code/mono blocks
--border-default:    #D8DBDF
--border-strong:      #B7BBC2

--text-primary:       #1A1D21
--text-secondary:     #5B6168
--text-tertiary:       #8A8F96   (placeholder / disabled)

--accent-primary:     #2A5DB0   active nav item, primary buttons, links

/* Ladder call (read-level, Section C/D/E) */
--call-5prime:         #2563EB   blue
--call-3prime:         #7C3AED   purple
--call-ambiguous:      #A68B00   muted yellow/olive (on #FFF8E1 chip bg)
--call-conflict:       #D14343   red-orange

/* Peak status (peak-level, Section F) */
--peak-primary-used:    #1E8E5A   green
--peak-ambiguous-retained: #B58B00 muted yellow (same family as call-ambiguous,
                                                  signals "same uncertainty",
                                                  but darker so peak-level and
                                                  read-level chips are never
                                                  pixel-identical)
--peak-conflict-retained: #C2540B  orange (warmer than call-conflict's red,
                                            so the two taxonomies are never
                                            confusable at a glance)
--peak-reference-reused: #0F8A82  teal
--peak-unused:           #C9CCD1  light gray, text set to --text-tertiary

/* Feedback */
--warning-bg:          #FFF4E5
--warning-border:      #E8A33D
--warning-text:         #8A5A00
--error-bg:             #FDEDEC
--error-border:         #D14343
--error-text:           #962E2E
--success-bg:           #E9F6EF
--success-border:       #1E8E5A
--success-text:         #156B43
```

Rule: status colors are always applied as a **chip** (small rounded-rect
tag, colored text + 12%-opacity tint background + colored left border) —
never as full-row or full-cell background fill. Dense tables with full-row
color fill become unreadable past ~50 rows; chips stay legible at any
table length.

## 8. Typography

- UI text / labels / section headers: system sans-serif stack —
  `-apple-system, "Segoe UI", "Inter", Helvetica, Arial, sans-serif`.
- All numeric data (mass, RT, Rel.I, decimals, indices, confidence scores):
  monospaced — `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace`.
  This includes every numeric table column and every numeric label in
  charts/tooltips. Non-negotiable: the seed/partner mass-decimal comparison
  in Section E only works as a visual scan if the decimals are
  monospace-aligned.
- Scale: page title 20px/600 weight; section header 16px/600; card/table
  header 13px/600 uppercase tracked +0.02em; body/table cell 13px/400;
  caption/help text 12px/400 in `--text-secondary`.
- Line height 1.4 for body text, 1.2 for table rows (rows are information-
  dense by design, not prose).

## 9. Card styles

- 1px `--border-default` border, 6px corner radius, `--bg-surface`
  background, no shadow (a shadow on a dense data tool reads as "this
  floats above the page," which fights the instrument-panel feel).
- Card header: 13px/600 uppercase label on the left, optional status chip
  or count badge on the right, bottom border separating header from body.
- Padding: 12px header, 16px body. Tighter than a typical SaaS card —
  these hold tables and charts, not short text blurbs.

## 10. Table styles

- Sticky header row, `--bg-surface-sunken` background, 13px/600 uppercase
  column labels, sort arrow appears on hover/active only (not on every
  column — reduces visual noise across 15–30 column tables like Read
  Summary).
- Row height 32px default ("dense" mode), 40px in an optional "comfortable"
  toggle for first-time users — dense is the default because these tables
  routinely hold thousands of rows (Peak Status: ~16,000; Read Summary:
  ~4,500 before filtering).
- Zebra striping: none. (Stripes plus status chips plus monospace numerics
  is already enough visual texture; striping on top makes scanning a
  specific column harder, not easier.) Use a 1px bottom border per row
  instead.
- Numeric columns right-aligned, monospace. Text columns left-aligned.
  Status/call columns center-aligned (they're chips, not text).
- No more than ~12 columns visible without horizontal scroll in any one
  table; wider source tables (Read Summary's 29 columns) ship with a
  sensible default column set and a "+ columns" picker rather than
  cramming everything in by default (see Section D and Data Density Rules).
- Pagination: virtualized infinite scroll, not numbered pages — with a
  pinned row-count readout ("Showing 312 of 4,490 reads — 4,178 hidden by
  filters") so a user always knows whether they're looking at "all of it"
  or a filtered subset.

## 11. Chart styles

- Two chart types in this dashboard: the Rel.I-vs-mass scatter (Section B)
  and the chain overlay (also Section B, as a toggle/layer on the same
  scatter rather than a separate chart — fewer chart types to learn).
- Axes: thin `--border-default` lines, no axis chart "title" duplicating
  what the panel header already says, tick labels in monospace 11px.
- Gridlines: very light (`--bg-surface-sunken` color), horizontal only by
  default (vertical gridlines compete with block-boundary markers).
- Block boundaries: thin dashed vertical lines in `--text-tertiary`, with
  block number as a small label at the top of the plot area on hover —
  not always-on text, which would clutter a 95-block real run.
- Point color = ladder call of the chain that point belongs to (the four
  `--call-*` tokens); points not part of any recovered chain render in
  `--peak-unused` gray at reduced opacity (0.5) so they recede behind the
  chains that matter.
- Hover tooltip: monospace, shows exact mass (4 decimals), Rel.I (4
  decimals), RT (3 decimals), read rank, and ladder call — the same
  precision as the Excel exports, never rounded differently in two places.
- Log10 toggle: a small switch in the panel header, not a separate page —
  switching it re-renders the same scatter against `log10_intensity_qc`
  instead of `Rel_I`, with a caption noting "display only — classification
  always uses linear Rel.I" so a user never thinks the toggle changes what
  the algorithm decided.
- Selecting a read elsewhere (Top Parallel Reads, Read Summary) highlights
  that chain's points in the scatter (full opacity + a thin outline) and
  fades everything else to 0.25 opacity — this is the dashboard's main
  "show me on the data" interaction.

## 12. Status colors (taxonomy reference)

Two separate taxonomies exist in this system and must never be visually
merged:

| Taxonomy | Applies to | Values | Token family |
|---|---|---|---|
| Ladder call | a **read** (recovered chain) | 5′, 3′, ambiguous, conflict | `--call-*` |
| Peak status | a **single input data point** | primary_used, ambiguous_retained, conflict_retained, reference_reused, unused | `--peak-*` |

A read's ladder call and its member peaks' peak statuses are related but
not identical (e.g. a `likely_5prime` read's seed peak is `primary_used`,
but a flagged-and-excluded peak elsewhere in the same mass region might be
`conflict_retained` even though it belongs to no read at all). Section F's
legend and Section D/E's chips must use their own token family — sharing
colors between the two taxonomies (as a shortcut) is exactly the
"decorative reuse of color" this spec exists to prevent.

Human-facing labels are always the literal words **5′ / 3′ / ambiguous /
conflict** — never `likely_5prime` / `likely_3prime` / the internal enum
spellings. Internal labels remain available (e.g. in a tooltip or the
Excel export's `ladder_classification` column) but are never the primary
on-screen text.

## 13. Data density rules

- Default sort for Read Summary: `review_priority` ascending (so
  `1_top_parallel` and `2_primary_review` rows surface first), tie-broken
  by `read_rank` ascending.
- Default filter for Read Summary: `low_confidence_noise = false` is
  applied by default; a visible "Showing primary reads only — 1,081 hidden
  (low confidence/noise) — Show all" toggle makes the hidden rows one
  click away, never truly inaccessible.
- Default visible columns in Read Summary: `read_rank, ladder_call,
  ladder_confidence_tier, review_priority, read_length, mean_rel_i,
  candidate_partner_rank, ladder_warnings`. The remaining ~20 evidence
  columns (seed/partner masses, decimal/RT/overlap diffs, decision_basis,
  fallback_median_used, ladder_evidence, internal labels) are available
  via a column picker and are exactly what populate the Section E detail
  pane for the selected row — so hiding them from the table by default
  loses nothing, since they're one click away in full.
- Numeric precision matches the Excel exports exactly: masses 4 decimals,
  RT 3 decimals, Rel.I 4 decimals, confidence/scores 2 decimals. Never
  re-round differently between dashboard and Excel.
- Peak Status table defaults to grouping/sorting by `read_rank` (peaks
  belonging to no read sort last), with a status filter chip row above
  the table (one chip per status, click to toggle) rather than a dropdown
  — at-a-glance visibility into which statuses are currently shown matters
  more than a compact control here.

## 14. Empty states

- **Section G hidden/disabled** (no reference supplied): nav item greyed
  with tooltip "No reference sequence supplied for this run." Never just
  removed — its absence should be explained, not implied.
- **Classification Evidence pane, nothing selected**: "Select a read from
  Top Parallel Reads or Read Summary to see its classification evidence."
- **Read Summary, filters exclude everything**: "No reads match the
  current filters. [Reset filters]" — never a bare blank table.
- **Peak Status, status filter excludes everything**: same pattern.
- **Zero chains recovered** (pathological run): Run Overview's whole
  layout degrades to a single centered message — "0 reads recovered from
  N input peaks. Check mass tolerance and RT settings, or confirm the
  input file loaded correctly." — rather than rendering five panels full
  of empty tables.

## 15. Warning / error states

- **Top-bar warning banner**: shown when the top 4 parallel reads
  (Section C) are mostly ambiguous/conflict (≥3 of 4) — *"The 4
  highest-intensity reads in this run are mostly ambiguous/conflict —
  review Section C before trusting downstream calls."* This is exactly
  the situation the real workbook smoke test hit (3 conflict + 1
  ambiguous in the top 4), so it is a real, expected case, not a rare
  edge case.
- **Fallback-median warning**: `fallback_median_used` is `False` by
  construction today (Step 6.4 never decides on the fallback), but the
  column exists specifically as a tripwire — if a future algorithm change
  ever sets it `True`, every such row gets a `--warning` chip inline in
  Read Summary and Classification Evidence, plus a banner count in Run
  Overview ("N reads classified by fallback median — review before
  trusting"). The UI must not assume this is permanently impossible.
- **Excel export unavailable** (`openpyxl` missing on the machine that ran
  the pipeline): the Export panel shows that specific file's button
  disabled with the same warning text the CLI already prints ("openpyxl
  not installed — skipped Read_Summary_Review.xlsx export"), rather than
  hiding the button.
- **Reference reuse: tested but nothing accepted** (reference supplied,
  `reference_reuse_accepted = 0`): an amber note in Section G, *"15
  candidates tested, 0 accepted — reuse was attempted but no candidate met
  the mass/RT thresholds,"* distinct in wording and color from "reference
  not supplied" — these are different facts and must read differently.
- **Error state** (pipeline run failed / report.json missing or
  malformed): a page-level error card, red, with the literal error message
  and no other panels rendered — never a half-populated dashboard that
  looks like a successful but empty run.

## 16. Export behavior

The Export panel (Section H) and the top-bar `[Export ▾]` menu offer the
same items; the panel is the full list with descriptions, the menu is the
quick-access shortcut.

- **Excel review package** (one button per file, each downloads the file
  the pipeline already wrote to disk — no regeneration on click):
  `Read_Summary_Review.xlsx`, `Top_Parallel_Reads.xlsx`, `Peak_Status.xlsx`,
  `Classification_Evidence.xlsx`, and `Reference_Reuse_Audit.xlsx` only
  when present for this run.
- **CSV tables**: `read_summary.csv`, `Top_Parallel_Reads.csv`,
  `annotated_data.csv` — same source files as today, exposed as direct
  downloads.
- **PNG plots**: `relative_intensity.png`, `chains_overlay.png` — exact
  files the pipeline rendered (Sections B's interactive chart is a
  separate, richer view; these PNGs are the static, shareable versions of
  it, kept distinct on purpose).
- **JSON report**: `base_calling_report.json` — full machine-readable
  report, offered for users who want to script further analysis.
- **Secondary/optional**: "Export current view as CSV" on the Read Summary
  and Peak Status tables, which exports whatever is currently filtered/
  sorted on screen (not a pipeline-time file) — clearly labeled "current
  view" so it's never confused with the canonical `read_summary.csv`.
- Every export action is a **download**, never a "share" or "publish"
  action — this tool has no concept of a multi-user audience, only one
  reviewer downloading files for their own records or to send manually.

---

## 17. Page structure (Sections A–H)

### A. Run Overview
File name, run status, runtime, input peak count, block count, recovered
read count, 5′/3′/ambiguous/conflict counts, and the five peak_status
counts (primary_used / ambiguous_retained / conflict_retained /
reference_reused / unused). Warning banner per §15 if the top 4 parallel
reads are mostly ambiguous/conflict. This is the only section condensed
into the persistent top bar once another section is active.

### B. Relative Intensity Map
Rel.I-vs-mass scatter (§11), log10 QC toggle, block boundary markers,
selectable read overlay (chain overlay layer, toggleable).

### C. Top Parallel Reads
The top-4-by-intensity reads side by side, mirroring Dr. Jiang's low-mass
worked example: per read, mass / Rel.I / RT / residue call / peak status
per row, ladder call shown as a chip with confidence tier shown
separately (never blended into one string). Clicking a read selects it
for Section E.

### D. Read Summary
Sortable/filterable table, default columns and filters per §13. Selecting
a row populates Section E's detail pane.

### E. 5′/3′ Classification Evidence
Detail pane for the selected read: paired-read comparison (seed vs.
partner mass integer/decimal side by side), paired decimal/RT difference,
read length overlap, mass-difference consistency, evidence and warning
text, and an explicit "why this call" line built from `decision_basis` +
`fallback_median_used` (e.g. "Classified by paired-read evidence with
read #312 — not by fallback median").

### F. Peak Status
Table and/or scatter-overlay of every input peak's status, filterable by
status chip and by read rank, with the 5-color legend from §12.

### G. Reference-Assisted Review
Hidden/disabled per §14 unless a reference was supplied. Shows the
reference alignment, which peaks were reused, and every tested candidate
split into accepted/rejected with its specific reason — every reuse
decision traceable, matching `Reference_Reuse_Audit.xlsx`'s
Candidates/Accepted/Rejected sheets exactly.

### H. Export Panel
Grouped download buttons per §16.
