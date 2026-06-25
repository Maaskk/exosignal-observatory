from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
UPLOADS_DIR = ROOT_DIR / "uploads"

DATASET_REPO = "bingbangboom/exoplanet-transit-detection"
DATASET_BASE_URL = f"https://huggingface.co/datasets/{DATASET_REPO}/resolve/main"

MODEL_PATH = MODELS_DIR / "baseline_model.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"
FEATURES_PATH = MODELS_DIR / "feature_columns.json"
STATUS_PATH = MODELS_DIR / "training_status.json"
DEEP_MODEL_PATH = MODELS_DIR / "deep_lightcurve_cnn.keras"
DEEP_METRICS_PATH = MODELS_DIR / "deep_model_metrics.json"
DEEP_CONFIG_PATH = MODELS_DIR / "deep_model_config.json"

for directory in [DATA_DIR, MODELS_DIR, UPLOADS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)
