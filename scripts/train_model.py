from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBClassifier
except Exception:  # pragma: no cover - fallback only
    XGBClassifier = None


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "models"
MODEL_PATH = MODELS_DIR / "baseline_model.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"
FEATURES_PATH = MODELS_DIR / "feature_columns.json"

ARRAY_COLUMNS = ["flux_global", "flux_local", "flux_odd", "flux_even"]
METADATA_COLUMNS = [
    "period_days",
    "duration_hrs",
    "depth_ppm",
    "planet_radius_earth",
    "teff",
    "logg",
    "radius",
    "mass",
    "metallicity",
    "kepmag",
    "cdpp_3hr",
    "n_planets_in_system",
    "flux_raw_len",
]


def bytes_to_float_array(value) -> np.ndarray:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return np.array([], dtype=np.float32)
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, bytearray):
        value = bytes(value)
    if isinstance(value, bytes):
        return np.frombuffer(value, dtype=np.float32)
    if isinstance(value, np.ndarray):
        return value.astype(np.float32, copy=False)
    if isinstance(value, list):
        return np.asarray(value, dtype=np.float32)
    return np.array([], dtype=np.float32)


def array_features(arr: np.ndarray, prefix: str) -> dict[str, float]:
    if arr.size == 0 or not np.isfinite(arr).any():
        return {
            f"{prefix}_mean": 0.0,
            f"{prefix}_std": 0.0,
            f"{prefix}_min": 0.0,
            f"{prefix}_q01": 0.0,
            f"{prefix}_q05": 0.0,
            f"{prefix}_q50": 0.0,
            f"{prefix}_skew": 0.0,
            f"{prefix}_kurtosis": 0.0,
            f"{prefix}_depth": 0.0,
            f"{prefix}_left_right_asym": 0.0,
        }
    arr = arr[np.isfinite(arr)]
    q01, q05, q50 = np.nanpercentile(arr, [1, 5, 50])
    half = len(arr) // 2
    left = np.nanmean(arr[:half]) if half else np.nanmean(arr)
    right = np.nanmean(arr[half:]) if half else np.nanmean(arr)
    return {
        f"{prefix}_mean": float(np.nanmean(arr)),
        f"{prefix}_std": float(np.nanstd(arr)),
        f"{prefix}_min": float(np.nanmin(arr)),
        f"{prefix}_q01": float(q01),
        f"{prefix}_q05": float(q05),
        f"{prefix}_q50": float(q50),
        f"{prefix}_skew": float(stats.skew(arr, nan_policy="omit")) if len(arr) > 2 else 0.0,
        f"{prefix}_kurtosis": float(stats.kurtosis(arr, nan_policy="omit")) if len(arr) > 3 else 0.0,
        f"{prefix}_depth": float(max(0.0, q50 - np.nanmin(arr))),
        f"{prefix}_left_right_asym": float(left - right),
    }


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, row in df.iterrows():
        features = {}
        for col in METADATA_COLUMNS:
            features[col] = row.get(col, np.nan)
        features["has_transit_params"] = float(bool(row.get("has_transit_params", False)))
        features["mission_kepler"] = 1.0 if row.get("mission") == "kepler" else 0.0
        features["mission_tess"] = 1.0 if row.get("mission") == "tess" else 0.0
        features["mission_k2"] = 1.0 if row.get("mission") == "k2" else 0.0
        for col in ARRAY_COLUMNS:
            features.update(array_features(bytes_to_float_array(row.get(col)), col))
        if "flux_odd_depth" in features and "flux_even_depth" in features:
            features["odd_even_depth_delta"] = abs(features["flux_odd_depth"] - features["flux_even_depth"])
        rows.append(features)
    return pd.DataFrame(rows).replace([np.inf, -np.inf], np.nan)


def load_available_data(max_rows: int | None) -> pd.DataFrame:
    paths = [DATA_DIR / "train.parquet", DATA_DIR / "val.parquet", DATA_DIR / "test.parquet"]
    frames = []
    remaining = max_rows
    for path in paths:
        if not path.exists():
            continue
        df = pd.read_parquet(path)
        if remaining is not None:
            take = min(remaining, len(df))
            df = df.sample(n=take, random_state=11) if take < len(df) else df
            remaining -= take
        frames.append(df)
        if remaining is not None and remaining <= 0:
            break
    if not frames:
        raise FileNotFoundError("No parquet data found. Run npm run download:data or npm run download:data:full first.")
    return pd.concat(frames, ignore_index=True)


def train(max_rows: int | None = None) -> dict:
    start = time.time()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    df = load_available_data(max_rows)
    df = df[df["disposition"].isin(["PLANET", "FALSE_POSITIVE", "NO_SIGNAL"])].copy()
    y = (df["disposition"] == "PLANET").astype(int)
    X = build_feature_frame(df)
    feature_columns = X.columns.tolist()

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.22, random_state=21, stratify=y)
    pos_weight = max(1.0, float((len(y_train) - y_train.sum()) / max(y_train.sum(), 1)))

    if XGBClassifier is not None:
        classifier = XGBClassifier(
            n_estimators=260,
            max_depth=4,
            learning_rate=0.055,
            subsample=0.9,
            colsample_bytree=0.85,
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            scale_pos_weight=pos_weight,
            random_state=21,
            n_jobs=4,
        )
        model_name = "XGBoost baseline"
    else:
        classifier = RandomForestClassifier(
            n_estimators=240,
            max_depth=14,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=21,
            n_jobs=4,
        )
        model_name = "Random Forest baseline"

    model = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("classifier", classifier),
        ]
    )
    model.fit(X_train, y_train)
    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    cm = confusion_matrix(y_test, pred).tolist()
    metrics = {
        "model_name": model_name,
        "rows_used": int(len(df)),
        "features": len(feature_columns),
        "positive_rate": float(y.mean()),
        "precision": float(precision_score(y_test, pred, zero_division=0)),
        "recall": float(recall_score(y_test, pred, zero_division=0)),
        "f1": float(f1_score(y_test, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, proba)),
        "pr_auc": float(average_precision_score(y_test, proba)),
        "confusion_matrix": {
            "labels": ["not_planet", "planet"],
            "values": cm,
        },
        "elapsed_seconds": round(time.time() - start, 2),
    }
    joblib.dump(model, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    FEATURES_PATH.write_text(json.dumps(feature_columns, indent=2))
    print(json.dumps(metrics, indent=2))
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="Train baseline exoplanet candidate model.")
    parser.add_argument("--max-rows", type=int, default=None, help="Optional row cap for faster classroom/demo training.")
    args = parser.parse_args()
    train(args.max_rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
