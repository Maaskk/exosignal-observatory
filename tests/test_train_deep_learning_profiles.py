import unittest
from pathlib import Path

from scripts.train_deep_learning import DATA_DIR, config_from_args, dataset_split_path, parse_args


class DeepLearningDatasetProfileTest(unittest.TestCase):
    def test_default_profile_uses_existing_project_parquets(self):
        self.assertEqual(dataset_split_path("official", "train"), DATA_DIR / "train.parquet")

    def test_nasa_dr24_profile_uses_processed_dr24_parquets(self):
        expected = DATA_DIR / "nasa_dr24_tce" / "processed" / "train.parquet"
        self.assertEqual(dataset_split_path("nasa-dr24", "train"), expected)

    def test_custom_profile_path_can_point_to_any_processed_dataset(self):
        custom = Path("/tmp/exosignal_custom")
        self.assertEqual(dataset_split_path(str(custom), "val"), custom / "val.parquet")

    def test_cli_accepts_stronger_deep_learning_options(self):
        args = parse_args(
            [
                "--model-family",
                "inceptiontime",
                "--ensemble",
                "3",
                "--calibration",
                "isotonic",
                "--tta-runs",
                "8",
            ]
        )
        config = config_from_args(args)

        self.assertEqual(config.model_family, "inceptiontime")
        self.assertEqual(config.ensemble, 3)
        self.assertEqual(config.calibration, "isotonic")
        self.assertEqual(config.tta_runs, 8)


if __name__ == "__main__":
    unittest.main()
