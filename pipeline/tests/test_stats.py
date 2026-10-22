"""Run: python -m unittest discover -s tests (from pipeline/)."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from uhi.stats import correlation, period_difference, trend  # noqa: E402


class TrendTests(unittest.TestCase):
    def test_exact_linear_trend(self):
        years = list(range(2014, 2026))
        vals = [0.1 * (y - 2014) for y in years]
        t = trend(years, vals)
        self.assertAlmostEqual(t["slope_per_decade"], 1.0, places=6)
        self.assertTrue(t["significant"])
        self.assertAlmostEqual(t["kendall_tau"], 1.0)

    def test_missing_years_are_skipped(self):
        years = list(range(2014, 2026))
        vals = [None if y % 3 == 0 else float(y) for y in years]
        self.assertEqual(trend(years, vals)["n"], 8)

    def test_too_few_years(self):
        self.assertIsNone(trend([2014, 2015, 2016], [1.0, 2.0, 3.0]))

    def test_noise_is_not_significant(self):
        rng = np.random.default_rng(1)
        years = list(range(2014, 2026))
        t = trend(years, list(rng.normal(0, 1, len(years))))
        self.assertFalse(t["significant"])


class PeriodTests(unittest.TestCase):
    def test_clear_shift_detected(self):
        r = period_difference([0.0, 0.1, -0.1, 0.05, 0.0], [2.0, 2.1, 1.9, 2.05, 2.0], n_perm=2000)
        self.assertAlmostEqual(r["difference"], 2.0, places=2)
        self.assertTrue(r["significant"])
        self.assertLess(r["ci95"][0], 2.0)
        self.assertGreater(r["ci95"][1], 2.0)

    def test_identical_groups_not_significant(self):
        a = [1.0, 2.0, 3.0, 4.0]
        r = period_difference(a, a, n_perm=2000)
        self.assertEqual(r["difference"], 0.0)
        self.assertFalse(r["significant"])

    def test_needs_three_per_group(self):
        self.assertIsNone(period_difference([1.0, 2.0], [3.0, 4.0, 5.0]))


class CorrelationTests(unittest.TestCase):
    def test_perfect_negative(self):
        x = np.linspace(0, 1, 50)
        c = correlation(x, -2 * x + 3)
        self.assertAlmostEqual(c["pearson_r"], -1.0)
        self.assertAlmostEqual(c["spearman_r"], -1.0)


if __name__ == "__main__":
    unittest.main()
