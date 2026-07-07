"use client";

import { useState } from "react";

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
    body: `Seeds are the highest-intensity (block-normalized Rel_I) unassigned peaks. Each seed is extended greedily in both mass directions by matching consecutive peak-to-peak mass differences against the modification dictionary (±0.05 Da tolerance). A monotonic RT trend filter prevents physically implausible chains. Block-wise Rel_I normalization — computed within 320 Da mass windows — prevents high-density regions from dominating the seed queue. The algorithm returns all chains above the minimum length threshold, ranked by seed intensity.`,
  },
  {
    heading: "5′ / 3′ classification",
    body: `Paired chains — one from the 5′ end, one from the 3′ end — share the same intact RNA and therefore have complementary mass ranges. The classifier scores candidate pairs on six criteria: (1) the decimal fractional mass of the terminal nucleotide (a physical signature that differs between 5′-OH and 3′-cyclic phosphate termini), (2) RT correlation, (3) mass range overlap, (4) relative intensity rank gap, (5) block start position agreement, and (6) precursor mass closure if the intact mass is provided. High-confidence pairs are called 5′ or 3′; others are reported as ambiguous or conflict.`,
  },
  {
    heading: "Coverage and FDR",
    body: `Coverage is measured as the fraction of peaks above each intensity threshold that are explained by at least one candidate read. The empirical false-discovery rate estimates the probability that a chain of a given length arose entirely from random mass coincidences — computed by sampling all consecutive peak-pair mass differences in the dataset and measuring the fraction that fall within tolerance of any residue mass. For chains ≥10 positions, the FDR is typically <10⁻¹⁰ %, confirming that matched chains represent real biochemical signal.`,
  },
  {
    heading: "Modification dictionary",
    body: `Mass differences are decoded against 48 entries covering all four canonical nucleotides and 44 known tRNA modifications including D, Ψ variants, thio-uridines, acetyl-cytidines, isopentenyl-adenosines, methylated guanosines, queuosine, and archaeosine. Isobaric pairs (e.g. Um/m1Ψ at 320.04 Da, s2U/s4U at 322.00 Da, mA/Am at 343.07 Da) cannot be distinguished by mass alone and are flagged in amber throughout the interface. Positions with mass differences not matching any dictionary entry within tolerance are reported as unresolved (grey).`,
  },
  {
    heading: "Interpreting results",
    body: `Candidate reads should be treated as sequencing hypotheses, not definitive calls. Key validation steps: (1) confirm that a paired 5′/3′ read pair's terminal masses sum to the measured intact RNA mass within ±1 Da; (2) cross-reference the decoded sequence against known tRNA family databases; (3) use orthogonal methods (HPLC-MS/MS, chemical probing) to confirm isobaric modification assignments; (4) check that high-intensity unexplained peaks (orange diamonds in the RT plot) are not artefacts before interpreting coverage gaps.`,
  },
];

export function MethodsGuide() {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

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
                <p className="text-sm text-gray-600 leading-relaxed">
                  {SECTIONS[activeIdx].body}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
