"use client";

import { useState, useCallback } from "react";

const SECTIONS = [
  {
    heading: "What this tool does",
    body: `This workbench recovers candidate RNA sequence reads de novo from deconvoluted LC-MS data produced by alkaline or nuclease hydrolysis laddering. Each hydrolysis event cleaves one nucleotide from the terminus, producing a nested series of fragments differing by exactly one residue mass (~305–633 Da). The algorithm identifies those mass-ladder chains in the peak list — without any reference sequence — and assigns each chain to the 5′ or 3′ terminus based on physical and chromatographic evidence.`,
  },
  {
    heading: "Input requirements",
    body: `Upload an Excel file exported from your deconvolution software (e.g. Intact Mass, BioPharmaFinder, or custom pipeline). Required columns: monoisotopic mass (M, Da), sum intensity (I), and apex retention time (T, min). The expected mass range is 2,000–23,000 Da for hydrolysis ladder data. Files with <600 peaks or mass range >25,000 Da likely contain intact RNA data and will be flagged with a warning.`,
  },
  {
    heading: "Nested ladder algorithm",
    body: `Seeds are the highest-intensity (block-normalized Rel_I) unassigned peaks. Each seed is extended greedily in both mass directions by matching consecutive peak-to-peak mass differences against the modification dictionary. Extension is constrained to strictly one residue per step (max_residues_per_step = 1), ensuring every chain edge maps to exactly one nucleotide; multi-residue gap jumps are not permitted. The default chain-building tolerance is ±0.05 Da. A monotonic RT trend filter (minimum 3-point history; RT standard deviation floor 0.30 min) rejects physically implausible extensions. Block-wise Rel_I normalization — computed within 320 Da mass windows — prevents high-density mass regions from monopolising the seed queue.`,
  },
  {
    heading: "5′ / 3′ classification",
    body: `Paired chains — one from the 5′ end, one from the 3′ end — share the same intact RNA and therefore have complementary mass ranges. The classifier scores candidate pairs on six criteria: (1) the decimal fractional mass of the terminal nucleotide (a physical signature that differs between 5′-OH and 3′-cyclic phosphate termini), (2) RT correlation, (3) mass range overlap, (4) relative intensity rank gap, (5) block start position agreement, and (6) precursor mass closure if the intact mass is provided. High-confidence pairs are called 5′ or 3′; others are reported as ambiguous or conflict.`,
  },
  {
    heading: "Coverage and FDR",
    body: `Coverage is measured as the fraction of peaks above each intensity threshold that are explained by at least one candidate read. The empirical false-discovery rate estimates the probability that a chain of a given length arose entirely from random mass coincidences — computed by sampling all consecutive peak-pair mass differences in the dataset and measuring the fraction that fall within ±0.05 Da of any residue mass. For chains ≥10 positions, the FDR is typically <10⁻¹⁰ %, confirming that matched chains represent real biochemical signal.`,
  },
  {
    heading: "Modification dictionary",
    body: `Mass differences are decoded against 47 dictionary entries covering all four canonical nucleotides (A, U, G, C) and 43 RNA modifications: dihydrouridine (D), pseudouridine variants (Um/m1Ψ, 320.04 Da), thio-uridines (s2U/s4U, mnm5s2U, cmnm5s2U, m5s2U, mcm5s2U, tm5s2U), acetyl-cytidine (ac4C), lysidine (k2C), inosines (I, m1I), isopentenyl-adenosines (i6A, io6A, ms2i6A), threonylcarbamoyl-adenosines (t6A, m6t6A, ms2t6A), wybutosine (yW, 469.10 Da) and its oxidation product (o2yW, 485.09 Da), methylguanosines (m22G, m22Gm), archaeosine, queuosine (Q), and glycosylated queuosines (manQ/galQ). Formally isobaric pairs — entries sharing the same monoisotopic mass — are reported as "A/B" and highlighted amber; they cannot be distinguished by mass alone. Near-isobaric pairs (Δ ≤ 0.02 Da, e.g. mo5U vs m5s2U at 336.02–336.04 Da) are resolved to the closest match; hover over each token to see the observed Δ mass and mass error, which can guide manual review.`,
  },
  {
    heading: "Interpreting results",
    body: `Candidate reads should be treated as sequencing hypotheses, not definitive calls. Key validation steps: (1) confirm that a paired 5′/3′ read pair's terminal masses sum to the measured intact RNA mass within ±1 Da; (2) cross-reference the decoded sequence against known tRNA family databases; (3) use orthogonal methods (HPLC-MS/MS, chemical probing, or metabolic labelling) to confirm isobaric or near-isobaric modification assignments; (4) hover over each sequence token to verify the observed Δ mass and mass error — calls with errors near the tolerance limit (0.05 Da) warrant extra caution; (5) check that high-intensity unexplained peaks (orange in the RT plot) are not artefacts before interpreting coverage gaps.`,
  },
  {
    heading: "Algorithm parameters (for methods sections)",
    body: `The following fixed parameters govern chain recovery and can be cited directly in a paper methods section:\n\n• Block window: 320 Da (Rel_I normalisation)\n• Chain-building mass tolerance: ±0.05 Da\n• Post-hoc decoding tolerance: ±0.07 Da\n• Max residues per extension step: 1 (strict single-residue only)\n• RT trend filter: monotonic; std-floor 0.30 min; min 3-point history\n• Modification dictionary: 47 entries (4 canonical + 43 modifications)\n• Default seed threshold: top 5% of block-normalised Rel_I\n• Default minimum read length: 10 positions\n• FDR null model: random peak-pair Δ mass sampling, same ±0.05 Da window\n\nSuggested citation text:\n"De-novo sequence reads were recovered from deconvoluted monoisotopic masses using a nested ladder alignment algorithm. Peaks were normalised within 320 Da mass windows; seeds were extended greedily by matching consecutive mass differences against a 47-entry RNA modification dictionary (±0.05 Da tolerance; strictly one residue per step). 5′/3′ terminus assignment was based on terminal-nucleotide decimal mass signatures, retention-time correlation, and precursor mass closure scoring. Reads ≥10 positions were retained; empirical FDR was estimated by random peak-pair sampling."`,
  },
];

// Extract the citation paragraph (last "block" after the blank line following "Suggested citation text:")
function extractCitationText(body: string): string {
  const marker = "Suggested citation text:\n";
  const idx = body.indexOf(marker);
  return idx >= 0 ? body.slice(idx + marker.length).trim() : "";
}

export function MethodsGuide() {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyCitation = useCallback((body: string) => {
    const text = extractCitationText(body);
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-gray-800">Methods &amp; Interpretation Guide</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Algorithm description, input requirements, FDR, modification dictionary, result interpretation
          </p>
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Left nav */}
          <div className="md:border-r border-gray-100 md:pr-4 mb-4 md:mb-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sections</p>
            <nav className="space-y-1">
              {SECTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                  className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    activeIdx === i
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {s.heading}
                </button>
              ))}
            </nav>
          </div>

          {/* Right content */}
          <div className="md:col-span-2 md:pl-5">
            {activeIdx === null ? (
              <p className="text-sm text-gray-400 italic">Select a section on the left to read more.</p>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                  {SECTIONS[activeIdx].heading}
                </h3>
                {SECTIONS[activeIdx].body.includes("\n") ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                      {SECTIONS[activeIdx].body.split("Suggested citation text:")[0]}
                    </p>
                    {SECTIONS[activeIdx].body.includes("Suggested citation text:") && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Suggested citation text</p>
                          <button
                            type="button"
                            onClick={() => handleCopyCitation(SECTIONS[activeIdx].body)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {copied ? "✓ Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="text-xs text-gray-700 italic leading-relaxed">
                          {extractCitationText(SECTIONS[activeIdx].body)}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {SECTIONS[activeIdx].body}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
