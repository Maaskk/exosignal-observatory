import unittest
from pathlib import Path

from scripts.train_deep_learning import DATA_DIR, dataset_split_path


class DeepLearningDatasetProfileTest(unittest.TestCase):
    def test_default_profile_uses_existing_project_parquets(self):
        self.assertEqual(dataset_split_path("official", "train"), DATA_DIR / "train.parquet")

    def test_nasa_dr24_profile_uses_processed_dr24_parquets(self):
        expected = DATA_DIR / "nasa_dr24_tce" / "processed" / "train.parquet"
        self.assertEqual(dataset_split_path("nasa-dr24", "train"), expected)

    def test_custom_profile_path_can_point_to_any_processed_dataset(self):
        custom = Path("/tmp/exosignal_custom")
        self.assertEqual(dataset_split_path(str(custom), "val"), custom / "val.parquet")


if __name__ == "__main__":
    unittest.main()
