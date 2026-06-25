import unittest

import numpy as np

from scripts.build_astronet_dr24_dataset import LABEL_MAP, normalize_view


class AstroNetDr24BuilderTest(unittest.TestCase):
    def test_label_map_matches_dr24_autovetter_classes(self):
        self.assertEqual(LABEL_MAP["PC"], "PLANET")
        self.assertEqual(LABEL_MAP["AFP"], "FALSE_POSITIVE")
        self.assertEqual(LABEL_MAP["NTP"], "NO_SIGNAL")

    def test_normalize_view_returns_finite_clipped_float32(self):
        view = normalize_view(np.array([1.0, np.nan, 1.1, 0.5, 5.0], dtype=np.float32))

        self.assertEqual(view.dtype, np.float32)
        self.assertTrue(np.isfinite(view).all())
        self.assertGreaterEqual(float(view.min()), 0.649)
        self.assertLessEqual(float(view.max()), 1.351)


if __name__ == "__main__":
    unittest.main()
