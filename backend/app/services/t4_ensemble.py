from __future__ import annotations

"""Serving adapter for the final DR24 T4 ensemble."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[3]
ARTIFACT_DIR = ROOT_DIR / "models" / "t4_optimized"
MODEL_PATHS = [
    ARTIFACT_DIR / "seed_21_best.keras",
    ARTIFACT_DIR / "seed_37_best.keras",
    ARTIFACT_DIR / "seed_53_best.keras",
]
PREPROCESSING_PATH = ARTIFACT_DIR / "preprocessing.joblib"
CALIBRATOR_PATH = ARTIFACT_DIR / "calibrator.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"


def _finite(values: Any) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float64).reshape(-1)
    return arr[np.isfinite(arr)]


def _training_curve(values: Any, length: int) -> np.ndarray:
    """Match T4 notebook curve normalization."""
    arr = _finite(values)
    if arr.size == 0:
        return np.zeros(length, dtype=np.float32)
    median = float(np.median(arr))
    if abs(median) > 1e-8:
        arr = arr / median
    arr = np.clip(arr - 1.0, -0.20, 0.20)
    if arr.size == length:
        return arr.astype(np.float32)
    return np.interp(
        np.linspace(0.0, 1.0, length),
        np.linspace(0.0, 1.0, arr.size),
        arr,
    ).astype(np.float32)


def _phase_bins(phase: np.ndarray, flux: np.ndarray, left: float, right: float, bins: int) -> np.ndarray:
    keep = np.isfinite(phase) & np.isfinite(flux) & (phase >= left) & (phase <= right)
    phase, flux = phase[keep], flux[keep]
    centers = np.linspace(left, right, bins)
    if phase.size < 8:
        return np.ones(bins, dtype=np.float32)
    edges = np.linspace(left, right, bins + 1)
    index = np.clip(np.digitize(phase, edges) - 1, 0, bins - 1)
    sums = np.bincount(index, weights=flux, minlength=bins)
    counts = np.bincount(index, minlength=bins)
    values = np.full(bins, np.nan, dtype=np.float64)
    values[counts > 0] = sums[counts > 0] / counts[counts > 0]
    valid = np.isfinite(values)
    if valid.sum() == 0:
        return np.ones(bins, dtype=np.float32)
    if valid.sum() == 1:
        values[:] = values[valid][0]
    else:
        values = np.interp(centers, centers[valid], values[valid])
    return values.astype(np.float32)


def _view_stats(values: np.ndarray, prefix: str) -> dict[str, float]:
    arr = _finite(values)
    if arr.size == 0:
        return {f"{prefix}_{name}": float("nan") for name in ("mean", "std", "min", "q01", "q05", "depth")}
    q01, q05, q50 = np.percentile(arr, [1, 5, 50])
    return {
        f"{prefix}_mean": float(arr.mean()),
        f"{prefix}_std": float(arr.std()),
        f"{prefix}_min": float(arr.min()),
        f"{prefix}_q01": float(q01),
        f"{prefix}_q05": float(q05),
        f"{prefix}_depth": float(max(0.0, q50 - arr.min())),
    }


def _number(features: dict[str, Any], name: str, default: float = 0.0) -> float:
    try:
        value = float(features.get(name, default))
    except (TypeError, ValueError):
        return default
    return value if np.isfinite(value) else default


def build_upload_inputs(time: Any, cleaned_flux: Any, features: dict[str, Any], sequence_length: int) -> tuple[np.ndarray, np.ndarray]:
    """Build global/local/odd/even phase-folded channels for one upload."""
    t = _finite(time)
    flux = _finite(cleaned_flux)
    n = min(t.size, flux.size)
    if n < 64:
        raise ValueError("At least 64 finite time/flux samples are required for T4 ensemble scoring.")
    t, flux = t[:n], flux[:n]
    order = np.argsort(t)
    t, flux = t[order], flux[order]

    period = _number(features, "period_estimate")
    if period <= 0:
        raise ValueError("No repeatable transit period was detected; T4 ensemble scoring was not applied.")
    duration_days = max(_number(features, "duration_estimate"), 0.0)
    epoch = float(t[int(np.argmin(flux))])
    phase = ((t - epoch + 0.5 * period) % period) / period - 0.5
    cycle = np.rint((t - epoch) / period).astype(int)

    global_view = _phase_bins(phase, flux, -0.5, 0.5, 2001)
    local_half_width = float(np.clip(max(4.0 * duration_days / period, 0.025), 0.025, 0.40))
    local_view = _phase_bins(phase, flux, -local_half_width, local_half_width, 201)
    odd_mask = (cycle % 2) != 0
    even_mask = ~odd_mask
    odd_view = _phase_bins(phase[odd_mask], flux[odd_mask], -local_half_width, local_half_width, 201)
    even_view = _phase_bins(phase[even_mask], flux[even_mask], -local_half_width, local_half_width, 201)
    if odd_mask.sum() < 8:
        odd_view = local_view.copy()
    if even_mask.sum() < 8:
        even_view = local_view.copy()

    views = {"flux_global": global_view, "flux_local": local_view, "flux_odd": odd_view, "flux_even": even_view}
    curve = np.stack([_training_curve(views[name], sequence_length) for name in ("flux_global", "flux_local", "flux_odd", "flux_even")], axis=-1)[None, :, :]

    global_depth = _view_stats(global_view, "flux_global")["flux_global_depth"]
    row: dict[str, float] = {
        "period_days": period,
        "duration_hrs": duration_days * 24.0,
        "depth_ppm": max(_number(features, "depth_estimate"), global_depth) * 1_000_000.0,
        "planet_radius_earth": float("nan"),
        "flux_raw_len": float(n),
    }
    for key, values in views.items():
        row.update(_view_stats(values, key))
    row["odd_even_depth_delta"] = abs(row["flux_odd_depth"] - row["flux_even_depth"])
    return curve.astype(np.float32), pd.DataFrame([row])


@lru_cache(maxsize=1)
def _assets() -> dict[str, Any]:
    missing = [str(path.relative_to(ROOT_DIR)) for path in [*MODEL_PATHS, PREPROCESSING_PATH, CALIBRATOR_PATH] if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing final T4 serving artifact(s): " + ", ".join(missing))
    import tensorflow as tf
    payload = joblib.load(PREPROCESSING_PATH)
    models = [tf.keras.models.load_model(path, compile=False) for path in MODEL_PATHS]
    calibrator = joblib.load(CALIBRATOR_PATH)
    return {"models": models, "calibrator": calibrator, **payload}


def t4_model_status() -> dict[str, Any]:
    required = [*MODEL_PATHS, PREPROCESSING_PATH, CALIBRATOR_PATH]
    missing = [str(path.relative_to(ROOT_DIR)) for path in required if not path.exists()]
    metrics = json.loads(METRICS_PATH.read_text()) if METRICS_PATH.exists() else None
    if missing:
        return {"ready": False, "missing": missing, "metrics": metrics, "message": "Final T4 artifacts are incomplete."}
    try:
        import tensorflow as tf
        return {
            "ready": True,
            "runtime": "tensorflow",
            "tensorflow_version": tf.__version__,
            "ensemble_size": len(MODEL_PATHS),
            "threshold": float(joblib.load(PREPROCESSING_PATH)["threshold"]),
            "metrics": metrics,
            "upload_note": "Uploaded curves are phase-folded from the app's detected period. Published DR24 test metrics are specific to the held-out AstroNet protocol.",
        }
    except Exception as exc:
        return {"ready": False, "metrics": metrics, "message": f"TensorFlow serving runtime unavailable: {exc}"}


def score_t4_candidate(time: Any, cleaned_flux: Any, features: dict[str, Any]) -> dict[str, Any]:
    status = t4_model_status()
    if not status.get("ready"):
        return {"used": False, "reason": status.get("message") or "Final T4 ensemble is unavailable."}
    try:
        assets = _assets()
        curve, feature_frame = build_upload_inputs(time, cleaned_flux, features, int(assets["sequence_length"]))
        feature_frame = feature_frame.reindex(columns=assets["feature_columns"])
        scaled = assets["scaler"].transform(assets["imputer"].transform(feature_frame)).astype(np.float32)
        raw = float(np.mean([model.predict([curve, scaled], verbose=0).ravel()[0] for model in assets["models"]]))
        probability = float(assets["calibrator"].transform([raw])[0])
        threshold = float(assets["threshold"])
        return {
            "used": True,
            "candidate_probability": float(np.clip(probability, 0.0, 1.0)),
            "raw_ensemble_probability": float(np.clip(raw, 0.0, 1.0)),
            "threshold": threshold,
            "label": "candidate" if probability >= threshold else "low-priority",
            "source": "t4-dr24-residual-ensemble",
            "note": "The upload was converted to approximate phase-folded views. This is a prioritization score, not an exoplanet confirmation.",
        }
    except ValueError as exc:
        return {"used": False, "reason": str(exc)}
    except Exception as exc:
        return {"used": False, "reason": f"T4 ensemble inference failed: {exc}"}
