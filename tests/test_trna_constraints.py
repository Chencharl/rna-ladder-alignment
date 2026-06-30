import unittest

import pandas as pd

from backend.trna_constraints import (
    default_residue_dictionary,
    base_call_candidates,
    find_best_peak,
    normalise_sequence_tokens,
    raw_peak_qc,
    read_peak_table,
    residue_dictionary_from_table,
    sequence_to_theoretical_df,
)


class TRNASuiteConstraintTests(unittest.TestCase):
    def test_sample_type_changes_5p_intermediate_masses(self):
        residues = default_residue_dictionary()
        tokens = normalise_sequence_tokens("AUGC", residues)

        natural = sequence_to_theoretical_df(tokens, "5", residues, "natural_RNA")
        synthetic = sequence_to_theoretical_df(tokens, "5", residues, "synthetic_RNA")

        self.assertAlmostEqual(float(natural.iloc[0]["theo_mass"]), 427.0294, places=4)
        self.assertAlmostEqual(float(synthetic.iloc[0]["theo_mass"]), 347.0675, places=4)
        self.assertAlmostEqual(
            float(natural.iloc[-1]["theo_mass"]),
            float(synthetic.iloc[-1]["theo_mass"]),
            places=5,
        )

    def test_modification_dictionary_supports_aliases_and_custom_mass(self):
        table = pd.DataFrame([
            {"Symbol": "M", "Nucleotide": "m3G", "Base": "G", "Mass": 360.1},
            {"Symbol": "Y", "Nucleotide": "Ψ", "Base": "U"},
        ])
        residues = residue_dictionary_from_table(table)

        tokens = normalise_sequence_tokens("A M Y U", residues)

        self.assertEqual(tokens, ["A", "m3G", "Ψ", "U"])
        self.assertAlmostEqual(residues.mass("m3G"), 360.1)
        self.assertEqual(residues.base("M"), "G")
        self.assertEqual(residues.base("Y"), "U")

    def test_unknown_residue_does_not_fallback_to_guessed_mass(self):
        residues = default_residue_dictionary()

        with self.assertRaisesRegex(ValueError, "unknown residue"):
            normalise_sequence_tokens("A zz G U", residues)

    def test_ppm_match_selects_highest_intensity_peak(self):
        peaks = [
            {"peak_id": 1, "mass": 1000.005, "intensity": 10.0, "rt": 1.0},
            {"peak_id": 2, "mass": 999.999, "intensity": 99.0, "rt": 1.1},
        ]

        hit = find_best_peak(1000.0, peaks, ppm=10)

        self.assertEqual(hit["peak_id"], 2)

    def test_raw_peak_qc_reports_unmatched_filter_and_peak_reuse(self):
        peaks = read_peak_table(pd.DataFrame([
            {"Monoisotopic Mass": 1000.0, "Sum Intensity": 100.0, "Apex RT": 1.0},
            {"Monoisotopic Mass": 950.0, "Sum Intensity": 50.0, "Apex RT": 1.5},
            {"Monoisotopic Mass": 13000.0, "Sum Intensity": 20.0, "Apex RT": 2.0},
        ]))
        theo5 = pd.DataFrame([
            {"5'": "A", "theo_mass": 1000.0, "position": 1},
            {"5'": "C", "theo_mass": 1000.0, "position": 2},
        ])
        theo3 = pd.DataFrame([
            {"3'": "C", "theo_mass": 2000.0, "position": 1},
            {"3'": "A", "theo_mass": 3000.0, "position": 2},
        ])

        qc = raw_peak_qc(peaks, theo5, theo3, ppm=10, mass_min=900, mass_max=12000)

        self.assertEqual(qc["summary"]["matched_peaks"], 1)
        self.assertEqual(qc["peak_reuse"], [{"peak_id": 0, "times_used": 2}])
        self.assertEqual([p["mass"] for p in qc["unmatched"]], [950.0])

    def test_base_call_candidates_apply_alignment_and_sanity_filters(self):
        residues = default_residue_dictionary()
        tokens = normalise_sequence_tokens("ACGUACGU", residues)
        theo5 = sequence_to_theoretical_df(tokens, "5", residues)
        theo3 = sequence_to_theoretical_df(tokens, "3", residues)
        masses = [
            float(theo5.iloc[2]["theo_mass"]),
            float(theo5.iloc[3]["theo_mass"]),
            float(theo5.iloc[4]["theo_mass"]),
            float(theo5.iloc[5]["theo_mass"]),
        ]
        peaks = [
            {"peak_id": i, "mass": mass, "intensity": 1000.0 - i, "rt": None}
            for i, mass in enumerate(masses)
        ]

        result = base_call_candidates(
            peaks,
            [peaks[0]],
            tokens,
            theo5,
            theo3,
            residues,
            ppm=10,
            top_n=1,
            min_ladder_len=4,
        )

        self.assertEqual(result["summary"]["ladders"], 1)
        self.assertEqual(result["summary"]["matched_ladders"], 1)
        self.assertEqual(result["ladders"][0]["sequence"], "UAC")
        self.assertEqual(result["ladders"][0]["align_hits"][0]["orientation"], "5'")


if __name__ == "__main__":
    unittest.main()
