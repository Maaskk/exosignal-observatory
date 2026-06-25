from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Iterable

import numpy as np
import pandas as pd
from scipy import signal


@dataclass
class CurveAnalysis:
    time: np.ndarray
    raw_flux: np.ndarray
    cleaned_flux: np.ndarray
    trend: np.ndarray
    dips: list[dict]
    features: dict


def _as_float_array(values: Iterable) -> np.ndarray:
    arr = np.asarray(list(values), dtype=float)
    return arr[np.isfinite(arr)]


def downsample_curve(time: np.ndarray, flux: np.ndarray, max_points: int = 900) -> list[dict]:
    if len(time) == 0:
        return []
    if len(time) > max_points:
        idx = np.linspace(0, len(time) - 1, max_points).astype(int)
        time = time[idx]
        flux = flux[idx]
    return [{"time": float(t), "flux": float(f)} for t, f in zip(time, flux)]


def robust_clean_flux(time: np.ndarray, flux: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mask = np.isfinite(time) & np.isfinite(flux)
    time = np.asarray(time[mask], dtype=float)
    flux = np.asarray(flux[mask], dtype=float)
    if len(time) == 0:
        return np.array([]), np.array([])
    order = np.argsort(time)
    time = time[order]
    flux = flux[order]

    median = np.nanmedian(flux)
    if not np.isfinite(median) or median == 0:
        median = 1.0
    flux = flux / median

    center = np.nanmedian(flux)
    mad = np.nanmedian(np.abs(flux - center))
    scale = 1.4826 * mad if mad > 0 else np.nanstd(flux)
    if scale and np.isfinite(scale) and scale > 0:
        keep = np.abs(flux - center) <= 6 * scale
        time = time[keep]
        flux = flux[keep]

    if len(flux) >= 9:
        flux = pd.Series(flux).interpolate(limit_direction="both").to_numpy()
    return time, flux


def detrend_and_normalize(flux: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(flux) == 0:
        return np.array([]), np.array([])
    window = max(9, min(401, (len(flux) // 40) * 2 + 1))
    if window >= len(flux):
        window = max(3, len(flux) // 2 * 2 - 1)
    if window >= 3:
        trend = signal.medfilt(flux, kernel_size=window)
        trend[trend == 0] = np.nanmedian(trend[trend != 0]) if np.any(trend != 0) else 1.0
    else:
        trend = np.ones_like(flux)
    cleaned = flux / trend
    cleaned = cleaned / np.nanmedian(cleaned)
    return cleaned, trend


def detect_periodic_dips(time: np.ndarray, flux: np.ndarray) -> list[dict]:
    if len(time) < 20 or len(flux) < 20:
        return []

    inverted = 1.0 - flux
    noise = np.nanstd(flux - np.nanmedian(flux))
    prominence = max(noise * 1.5, 0.0002)
    min_distance = max(5, len(flux) // 80)
    peaks, props = signal.find_peaks(inverted, prominence=prominence, distance=min_distance)
    if len(peaks) == 0:
        return []

    prominences = props.get("prominences", np.zeros(len(peaks)))
    ranked = np.argsort(prominences)[::-1][:12]
    selected = sorted(peaks[ranked])
    dips = []
    widths = signal.peak_widths(inverted, selected, rel_height=0.5)[0] if len(selected) else []
    dt = float(np.nanmedian(np.diff(time))) if len(time) > 1 else 1.0
    baseline = float(np.nanmedian(flux))

    for i, peak in enumerate(selected):
        width_points = float(widths[i]) if i < len(widths) else 1.0
        duration = abs(width_points * dt)
        depth = max(0.0, baseline - float(flux[peak]))
        snr = depth / noise if noise > 0 else 0.0
        if snr < 3.0:
            continue
        dips.append(
            {
                "index": int(peak),
                "time": float(time[peak]),
                "flux": float(flux[peak]),
                "depth": float(depth),
                "duration": float(duration),
                "snr": float(snr),
            }
        )
    return dips


def summarize_period(dips: list[dict]) -> float | None:
    if len(dips) < 2:
        return None
    times = np.array([d["time"] for d in dips], dtype=float)
    diffs = np.diff(np.sort(times))
    diffs = diffs[np.isfinite(diffs) & (diffs > 0)]
    if len(diffs) == 0:
        return None
    return float(np.nanmedian(diffs))


def summarize_periodicity(dips: list[dict]) -> float:
    if len(dips) < 3:
        return 0.0
    times = np.array([d["time"] for d in dips], dtype=float)
    diffs = np.diff(np.sort(times))
    diffs = diffs[np.isfinite(diffs) & (diffs > 0)]
    if len(diffs) < 2:
        return 0.0
    period = float(np.nanmedian(diffs))
    if period <= 0:
        return 0.0
    scatter = float(np.nanmedian(np.abs(diffs - period)))
    return float(np.clip(1.0 - scatter / period, 0.0, 1.0))


def extract_features(time: np.ndarray, flux: np.ndarray, dips: list[dict] | None = None) -> dict:
    if dips is None:
        dips = detect_periodic_dips(time, flux)
    if len(flux) == 0:
        return {}
    arr = np.asarray(flux, dtype=float)
    q = np.nanpercentile(arr, [1, 5, 25, 50, 75, 95, 99])
    std = float(np.nanstd(arr))
    depth = float(max(0.0, 1.0 - np.nanmin(arr)))
    dip_depths = [d["depth"] for d in dips]
    dip_snrs = [d["snr"] for d in dips]
    period = summarize_period(dips)
    periodicity = summarize_periodicity(dips)
    duration = float(np.nanmedian([d["duration"] for d in dips])) if dips else 0.0
    return {
        "point_count": int(len(arr)),
        "flux_mean": float(np.nanmean(arr)),
        "flux_std": std,
        "flux_min": float(np.nanmin(arr)),
        "flux_max": float(np.nanmax(arr)),
        "flux_q01": float(q[0]),
        "flux_q05": float(q[1]),
        "flux_q25": float(q[2]),
        "flux_q50": float(q[3]),
        "flux_q75": float(q[4]),
        "flux_q95": float(q[5]),
        "flux_q99": float(q[6]),
        "depth_estimate": depth,
        "dip_count": int(len(dips)),
        "period_estimate": float(period) if period else 0.0,
        "periodicity_score": periodicity,
        "duration_estimate": duration,
        "snr_estimate": float(np.nanmax(dip_snrs)) if dip_snrs else 0.0,
        "median_dip_depth": float(np.nanmedian(dip_depths)) if dip_depths else 0.0,
        "variability": float(np.nanstd(np.diff(arr))) if len(arr) > 1 else 0.0,
    }


def analyze_light_curve(time: np.ndarray, flux: np.ndarray) -> CurveAnalysis:
    time, flux = robust_clean_flux(time, flux)
    cleaned, trend = detrend_and_normalize(flux)
    dips = detect_periodic_dips(time, cleaned)
    features = extract_features(time, cleaned, dips)
    return CurveAnalysis(time=time, raw_flux=flux, cleaned_flux=cleaned, trend=trend, dips=dips, features=features)


def parse_csv_light_curve(content: bytes) -> tuple[np.ndarray, np.ndarray]:
    df = pd.read_csv(BytesIO(content))
    lower = {col.lower().strip(): col for col in df.columns}
    time_col = next((lower[c] for c in ["time", "bjd", "btjd", "bkjd", "jd", "timestamp"] if c in lower), None)
    flux_col = next(
        (lower[c] for c in ["flux", "pdcsap_flux", "sap_flux", "relative_flux", "normalized_flux", "brightness"] if c in lower),
        None,
    )
    if flux_col is None:
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if len(numeric_cols) >= 2:
            time_col, flux_col = numeric_cols[0], numeric_cols[1]
        elif len(numeric_cols) == 1:
            flux_col = numeric_cols[0]
    if flux_col is None:
        raise ValueError("CSV must include a flux column or at least one numeric column.")
    flux = df[flux_col].to_numpy(dtype=float)
    if time_col is None:
        time = np.arange(len(flux), dtype=float)
    else:
        time = df[time_col].to_numpy(dtype=float)
    return time, flux


def parse_fits_light_curve(content: bytes) -> tuple[np.ndarray, np.ndarray]:
    from astropy.io import fits

    with fits.open(BytesIO(content), memmap=False) as hdul:
        for hdu in hdul:
            data = getattr(hdu, "data", None)
            if data is None or not hasattr(data, "names") or data.names is None:
                continue
            names = {name.lower(): name for name in data.names}
            time_name = next((names[c] for c in ["time", "bjd", "btjd", "bkjd"] if c in names), None)
            flux_name = next((names[c] for c in ["pdcsap_flux", "sap_flux", "flux"] if c in names), None)
            if flux_name:
                flux = np.asarray(data[flux_name], dtype=float)
                time = np.asarray(data[time_name], dtype=float) if time_name else np.arange(len(flux), dtype=float)
                return time, flux
    raise ValueError("Could not find TIME and FLUX columns in FITS file.")


def make_demo_curve(seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    time = np.linspace(0, 28, 2400)
    flux = 1.0 + rng.normal(0, 0.0016, size=time.shape)
    period = 4.28
    duration = 0.18
    depth = 0.012
    for center in np.arange(2.2, time[-1], period):
        phase = np.abs(time - center)
        transit = np.exp(-0.5 * (phase / duration) ** 2)
        flux -= depth * transit
    flux += 0.002 * np.sin(2 * np.pi * time / 11.5)
    return time, flux
