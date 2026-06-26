from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from backend.app.config import (
    DEEP_CONFIG_PATH,
    DEEP_METRICS_PATH,
    DEEP_MODEL_PATH,
    FEATURES_PATH,
    METRICS_PATH,
    MODEL_PATH,
)


_DEEP_MODEL = None
_DEEP_MODEL_ERROR: str | None = None


DEFAULT_FEATURES = [
    "flux_mean",
    "flux_std",
    "flux_min",
    "flux_max",
    "flux_q01",
    "flux_q05",
    "flux_q25",
    "flux_q50",
    "flux_q75",
    "flux_q95",
    "flux_q99",
    "depth_estimate",
    "dip_count",
    "period_estimate",
    "duration_estimate",
    "snr_estimate",
    "median_dip_depth",
    "variability",
]


def load_metrics() -> dict[str, Any] | None:
    if METRICS_PATH.exists():
        return json.loads(METRICS_PATH.read_text())
    return None


def load_deep_metrics() -> dict[str, Any] | None:
    if DEEP_METRICS_PATH.exists():
        return json.loads(DEEP_METRICS_PATH.read_text())
    return None


def load_deep_config() -> dict[str, Any]:
    if DEEP_CONFIG_PATH.exists():
        return json.loads(DEEP_CONFIG_PATH.read_text())
    return {
        "model_type": "keras_1d_cnn",
        "sequence_length": 256,
        "array_columns": ["flux_global", "flux_local", "flux_odd", "flux_even"],
        "input_channels": 4,
        "threshold": 0.5,
    }


def load_feature_columns() -> list[str]:
    if FEATURES_PATH.exists():
        return json.loads(FEATURES_PATH.read_text())
    return DEFAULT_FEATURES


def load_model():
    if not MODEL_PATH.exists():
        return None
    return joblib.load(MODEL_PATH)


def load_deep_model():
    global _DEEP_MODEL, _DEEP_MODEL_ERROR
    if _DEEP_MODEL is not None:
        return _DEEP_MODEL
    if not DEEP_MODEL_PATH.exists():
        _DEEP_MODEL_ERROR = None
        return None
    try:
        import tensorflow as tf

        _DEEP_MODEL = tf.keras.models.load_model(DEEP_MODEL_PATH)
        _DEEP_MODEL_ERROR = None
        return _DEEP_MODEL
    except Exception as exc:  # pragma: no cover - depends on optional TensorFlow runtime
        _DEEP_MODEL_ERROR = str(exc)
        return None


def deep_model_status() -> dict[str, Any]:
    model_exists = DEEP_MODEL_PATH.exists()
    metrics = load_deep_metrics()
    config = load_deep_config()
    tensorflow_available = False
    tensorflow_error = None
    if model_exists:
        try:
            import tensorflow as tf

            tensorflow_available = True
            tensorflow_version = tf.__version__
        except Exception as exc:  # pragma: no cover - optional dependency
            tensorflow_version = None
            tensorflow_error = str(exc)
    else:
        tensorflow_version = None
    return {
        "configured": model_exists,
        "weights_installed": model_exists,
        "metrics_available": metrics is not None,
        "loadable": bool(model_exists and tensorflow_available and _DEEP_MODEL_ERROR is None),
        "model_path": str(DEEP_MODEL_PATH),
        "metrics": metrics,
        "config": config,
        "tensorflow_available": tensorflow_available,
        "tensorflow_version": tensorflow_version,
        "error": _DEEP_MODEL_ERROR or tensorflow_error,
    }


def active_model_status() -> dict[str, Any]:
    deep = deep_model_status()
    baseline_metrics = load_metrics()
    if deep["configured"] and deep["tensorflow_available"]:
        return {
            "name": "1D CNN deep light-curve model",
            "family": "deep_learning",
            "artifact": str(DEEP_MODEL_PATH),
            "metrics": deep["metrics"],
            "fallback": "XGBoost/Random Forest baseline remains available",
        }
    return {
        "name": (baseline_metrics or {}).get("model_name", "XGBoost/Random Forest baseline"),
        "family": "baseline",
        "artifact": str(MODEL_PATH),
        "metrics": baseline_metrics,
        "fallback": "Deep learning artifact not active yet",
    }


def heuristic_candidate_score(features: dict[str, Any]) -> float:
    snr = float(features.get("snr_estimate", 0) or 0)
    depth = float(features.get("depth_estimate", 0) or 0)
    period = float(features.get("period_estimate", 0) or 0)
    dips = float(features.get("dip_count", 0) or 0)
    variability = float(features.get("variability", 0) or 0)
    periodicity = float(features.get("periodicity_score", 0) or 0)
    score = 0.06
    score += min(max((snr - 2.0) / 8.0, 0.0), 1.0) * 0.32
    score += min(depth / 0.012, 1.0) * 0.22
    score += min(dips / 4.0, 1.0) * 0.12
    score += periodicity * 0.18
    score += (1.0 if period > 0 else 0.0) * 0.06
    score += max(0.0, 1.0 - min(variability / 0.006, 1.0)) * 0.04
    return float(np.clip(score, 0.02, 0.98))


def _feature_number(features: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = features.get(key, default)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if np.isfinite(number) else default


def _resample_curve(values: np.ndarray, length: int) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float32)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return np.ones(length, dtype=np.float32)
    median = float(np.nanmedian(arr))
    if np.isfinite(median) and abs(median) > 1e-8:
        arr = arr / median
    arr = np.nan_to_num(arr, nan=1.0, posinf=1.0, neginf=1.0)
    arr = np.clip(arr, 0.75, 1.25)
    if arr.size == length:
        return arr.astype(np.float32)
    source_x = np.linspace(0.0, 1.0, arr.size)
    target_x = np.linspace(0.0, 1.0, length)
    return np.interp(target_x, source_x, arr).astype(np.float32)


def predict_deep_candidate(cleaned_flux: np.ndarray | list[float] | None) -> float | None:
    if cleaned_flux is None or not DEEP_MODEL_PATH.exists():
        return None
    deep_model = load_deep_model()
    if deep_model is None:
        return None
    config = load_deep_config()
    sequence_length = int(config.get("sequence_length", 256))
    input_channels = int(config.get("input_channels") or len(config.get("array_columns", [])) or 1)
    base = _resample_curve(np.asarray(cleaned_flux, dtype=np.float32), sequence_length)
    tensor = np.stack([base for _ in range(input_channels)], axis=-1)[None, :, :]
    probability = float(deep_model.predict(tensor, verbose=0)[0][0])
    return float(np.clip(probability, 0.0, 1.0))


def bridge_live_curve_features(features: dict[str, Any]) -> dict[str, Any]:
    """Translate upload-time light-curve features into the trained dataset schema."""
    bridged = dict(features)
    period = _feature_number(features, "period_estimate")
    duration = _feature_number(features, "duration_estimate")
    depth = _feature_number(features, "depth_estimate")
    median_depth = _feature_number(features, "median_dip_depth", depth)
    variability = _feature_number(features, "variability")
    flux_std = _feature_number(features, "flux_std", variability)

    bridged.setdefault("period_days", period)
    bridged.setdefault("duration_hrs", duration * 24.0)
    bridged.setdefault("depth_ppm", depth * 1_000_000.0)
    bridged.setdefault("flux_raw_len", _feature_number(features, "point_count"))
    bridged.setdefault("has_transit_params", 1.0 if period > 0 and depth > 0 else 0.0)

    global_map = {
        "flux_global_mean": "flux_mean",
        "flux_global_std": "flux_std",
        "flux_global_min": "flux_min",
        "flux_global_q01": "flux_q01",
        "flux_global_q05": "flux_q05",
        "flux_global_q50": "flux_q50",
    }
    for target, source in global_map.items():
        bridged.setdefault(target, _feature_number(features, source))

    bridged.setdefault("flux_global_depth", depth)
    bridged.setdefault("flux_local_mean", max(0.0, 1.0 - median_depth))
    bridged.setdefault("flux_local_std", flux_std)
    bridged.setdefault("flux_local_min", max(0.0, 1.0 - depth))
    bridged.setdefault("flux_local_q01", max(0.0, 1.0 - depth))
    bridged.setdefault("flux_local_q05", max(0.0, 1.0 - median_depth))
    bridged.setdefault("flux_local_q50", 1.0)
    bridged.setdefault("flux_local_depth", median_depth or depth)

    for prefix in ("flux_odd", "flux_even"):
        bridged.setdefault(f"{prefix}_mean", max(0.0, 1.0 - median_depth))
        bridged.setdefault(f"{prefix}_std", flux_std)
        bridged.setdefault(f"{prefix}_min", max(0.0, 1.0 - depth))
        bridged.setdefault(f"{prefix}_q01", max(0.0, 1.0 - depth))
        bridged.setdefault(f"{prefix}_q05", max(0.0, 1.0 - median_depth))
        bridged.setdefault(f"{prefix}_q50", 1.0)
        bridged.setdefault(f"{prefix}_depth", median_depth or depth)
        bridged.setdefault(f"{prefix}_left_right_asym", 0.0)

    bridged.setdefault("flux_global_left_right_asym", 0.0)
    bridged.setdefault("flux_local_left_right_asym", 0.0)
    bridged.setdefault("odd_even_depth_delta", 0.0)
    return bridged


def predict_candidate(
    features: dict[str, Any],
    cleaned_flux: np.ndarray | list[float] | None = None,
    time: np.ndarray | list[float] | None = None,
) -> dict[str, Any]:
    # Prefer the final T4 ensemble when all serving artifacts are available.
    if time is not None and cleaned_flux is not None:
        from backend.app.services.t4_ensemble import score_t4_candidate
        t4 = score_t4_candidate(time, cleaned_flux, features)
        if t4.get("used"):
            probability = float(t4["candidate_probability"])
            return {
                "candidate_probability": probability,
                "source": t4["source"],
                "label": t4["label"],
                "caution": "This model prioritizes candidates; it does not officially confirm an exoplanet.",
                "t4_ensemble": {
                    "raw_probability": t4["raw_ensemble_probability"],
                    "threshold": t4["threshold"],
                    "note": t4["note"],
                },
            }

    model = load_model()
    columns = load_feature_columns()
    model_features = bridge_live_curve_features(features)
    row = pd.DataFrame([{col: model_features.get(col, 0.0) for col in columns}]).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    deep_probability = predict_deep_candidate(cleaned_flux)
    live_curve_probability = heuristic_candidate_score(features)

    if model is None:
        probability = deep_probability if deep_probability is not None else live_curve_probability
        return {
            "candidate_probability": probability,
            "source": "deep-cnn" if deep_probability is not None else "heuristic-fallback",
            "label": "candidate" if probability >= 0.55 else "low-priority",
            "caution": "This model prioritizes candidates; it does not officially confirm an exoplanet.",
            "deep_probability": deep_probability,
            "live_curve_probability": float(np.clip(live_curve_probability, 0.0, 1.0)),
        }

    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(row)[0]
        classes = list(getattr(model, "classes_", []))
        if 1 in classes:
            model_probability = float(proba[classes.index(1)])
        elif "PLANET" in classes:
            model_probability = float(proba[classes.index("PLANET")])
        else:
            model_probability = float(np.max(proba))
    else:
        model_probability = float(model.predict(row)[0])
    is_live_curve = "point_count" in features or "period_estimate" in features
    if deep_probability is not None and is_live_curve:
        probability = 0.70 * deep_probability + 0.20 * model_probability + 0.10 * live_curve_probability
        source = "deep-cnn+baseline-calibration"
    else:
        probability = 0.45 * model_probability + 0.55 * live_curve_probability if is_live_curve else model_probability
        source = "trained-baseline+live-calibration" if is_live_curve else "trained-baseline"
    return {
        "candidate_probability": float(np.clip(probability, 0.0, 1.0)),
        "source": source,
        "label": "candidate" if probability >= 0.55 else "low-priority",
        "caution": "This model prioritizes candidates; it does not officially confirm an exoplanet.",
        "model_probability": float(np.clip(model_probability, 0.0, 1.0)),
        "deep_probability": deep_probability,
        "live_curve_probability": float(np.clip(live_curve_probability, 0.0, 1.0)),
    }
