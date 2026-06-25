import math
import unittest

import numpy as np
import pandas as pd

from scripts.build_nasa_dr24_dataset import (
    build_label_frame,
    fold_and_bin,
    split_frame,
)


class NasaDr24BuilderTest(unittest.TestCase):
    def test_label_frame_uses_clean_human_labels_and_excludes_unknown(self):
        frame = pd.DataFrame(
            {
                "kepid": [1, 2, 3, 4],
                "av_training_set": ["PC", "AFP", "NTP", "UNK"],
                "av_pred_class": ["PC", "AFP", "NTP", "PC"],
            }
        )

        labeled = build_label_frame(frame, label_source="clean")

        self.assertEqual(len(labeled), 3)
        self.assertEqual(labeled["disposition"].tolist(), ["PLANET", "FALSE_POSITIVE", "NO_SIGNAL"])
        self.assertTrue(labeled["label_is_human_reviewed"].all())

    def test_label_frame_can_use_all_predicted_labels(self):
        frame = pd.DataFrame(
            {
                "kepid": [1, 2, 3, 4],
                "av_training_set": ["PC", "UNK", "UNK", "AFP"],
                "av_pred_class": ["PC", "AFP", "NTP", "UNK"],
            }
        )

        labeled = build_label_frame(frame, label_source="predicted")

        self.assertEqual(len(labeled), 3)
        self.assertEqual(labeled["disposition"].tolist(), ["PLANET", "FALSE_POSITIVE", "NO_SIGNAL"])
        self.assertFalse(labeled["label_is_human_reviewed"].any())

    def test_fold_and_bin_returns_fixed_length_normalized_view(self):
        time = np.linspace(0.0, 20.0, 400, dtype=np.float32)
        flux = np.ones_like(time)
        phase = ((time - 1.0 + 0.5 * 5.0) % 5.0) / 5.0 - 0.5
        flux[np.abs(phase) < 0.03] -= 0.02

        binned = fold_and_bin(time, flux, period_days=5.0, epoch_days=1.0, length=128)

        self.assertEqual(binned.shape, (128,))
        self.assertTrue(np.isfinite(binned).all())
        self.assertLess(float(binned.min()), 0.995)
        self.assertTrue(math.isclose(float(np.nanmedian(binned)), 1.0, rel_tol=0.02))

    def test_split_frame_is_disjoint_and_preserves_rows(self):
        rows = []
        for index in range(30):
            rows.append(
                {
                    "kepid": index // 2,
                    "disposition": "PLANET" if index % 3 == 0 else "FALSE_POSITIVE",
                }
            )
        frame = pd.DataFrame(rows)

        train, val, test = split_frame(frame, seed=7)

        self.assertEqual(len(train) + len(val) + len(test), len(frame))
        self.assertTrue(set(train["kepid"]).isdisjoint(set(val["kepid"])))
        self.assertTrue(set(train["kepid"]).isdisjoint(set(test["kepid"])))
        self.assertTrue(set(val["kepid"]).isdisjoint(set(test["kepid"])))


if __name__ == "__main__":
    unittest.main()
