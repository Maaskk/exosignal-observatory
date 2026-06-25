from __future__ import annotations

import argparse
import contextlib
import json
import signal
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlencode

import numpy as np
import pandas as pd
import requests


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DR24_DIR = DATA_DIR / "nasa_dr24_tce"
PROCESSED_DIR = DR24_DIR / "processed"
METADATA_PATH = DR24_DIR / "dr24_tce_metadata.csv"
LABELED_PATH = DR24_DIR / "dr24_tce_labeled.csv"
MANIFEST_PATH = DR24_DIR / "manifest.json"

NASA_TAP_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
NASA_TCE_TABLE = "q1_q17_dr24_tce"

NASA_TCE_COLUMNS = [
    "kepid",
    "tce_plnt_num",
    "ra",
    "dec",
    "tce_period",
    "tce_time0bk",
    "tce_duration",
    "tce_depth",
    "tce_model_snr",
    "tce_prad",
    "tce_sradius",
    "tce_steff",
    "tce_slogg",
    "tce_smet",
    "tce_num_transits",
    "tce_max_mult_ev",
    "av_training_set",
    "av_pred_class",
    "av_pp_pc",
    "av_pp_afp",
    "av_pp_ntp",
    "boot_fap",
    "tce_datalink_dvr",
    "tce_datalink_dvs",
]

LABEL_MAP = {
    "PC": "PLANET",
    "AFP": "FALSE_POSITIVE",
    "NTP": "NO_SIGNAL",
}


class TargetTimeoutError(TimeoutError):
    pass


@contextlib.contextmanager
def target_timeout(seconds: int):
    if seconds <= 0 or not hasattr(signal, "SIGALRM"):
        yield
        return

    def _handler(signum, frame):
        raise TargetTimeoutError(f"target download exceeded {seconds} seconds")

    previous_handler = signal.signal(signal.SIGALRM, _handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fetch_tce_metadata(max_rows: int | None = None, timeout: int = 120) -> pd.DataFrame:
    limit = f"TOP {int(max_rows)} " if max_rows else ""
    columns = ", ".join(NASA_TCE_COLUMNS)
    query = f"select {limit}{columns} from {NASA_TCE_TABLE} order by kepid, tce_plnt_num"
    response = requests.get(NASA_TAP_URL, params={"query": query, "format": "json"}, timeout=timeout)
    response.raise_for_status()
    frame = pd.DataFrame(response.json())
    frame.columns = [str(col).lower() for col in frame.columns]
    return frame


def build_label_frame(metadata: pd.DataFrame, label_source: str) -> pd.DataFrame:
    if label_source not in {"clean", "predicted"}:
        raise ValueError("label_source must be 'clean' or 'predicted'")
    source_column = "av_training_set" if label_source == "clean" else "av_pred_class"
    frame = metadata.copy()
    values = frame[source_column].astype(str).str.upper().str.strip()
    frame = frame[values.isin(LABEL_MAP)].copy()
    frame["disposition"] = values[values.isin(LABEL_MAP)].map(LABEL_MAP).to_numpy()
    frame["label_code"] = values[values.isin(LABEL_MAP)].to_numpy()
    frame["label_source"] = "NASA_DR24_ROBOVETTER_HUMAN" if label_source == "clean" else "NASA_DR24_ROBOVETTER_PREDICTED"
    frame["label_is_human_reviewed"] = bool(label_source == "clean")
    frame["mission"] = "kepler"
    frame["cadence"] = "long"
    frame["star_id"] = "KIC " + frame["kepid"].astype(str)
    planet_number = frame["tce_plnt_num"] if "tce_plnt_num" in frame else pd.Series(np.arange(1, len(frame) + 1), index=frame.index)
    frame["tce_id"] = frame["star_id"] + "." + planet_number.astype(str)
    frame["period_days"] = pd.to_numeric(frame.get("tce_period"), errors="coerce")
    frame["duration_hrs"] = pd.to_numeric(frame.get("tce_duration"), errors="coerce")
    frame["depth_ppm"] = pd.to_numeric(frame.get("tce_depth"), errors="coerce")
    frame["planet_radius_earth"] = pd.to_numeric(frame.get("tce_prad"), errors="coerce")
    frame["teff"] = pd.to_numeric(frame.get("tce_steff"), errors="coerce")
    frame["logg"] = pd.to_numeric(frame.get("tce_slogg"), errors="coerce")
    frame["radius"] = pd.to_numeric(frame.get("tce_sradius"), errors="coerce")
    frame["metallicity"] = pd.to_numeric(frame.get("tce_smet"), errors="coerce")
    frame["has_transit_params"] = frame[["period_days", "duration_hrs", "depth_ppm"]].notna().all(axis=1)
    frame["source_table"] = NASA_TCE_TABLE
    return frame.reset_index(drop=True)


def finite_float_array(values) -> np.ndarray:
    array = np.asarray(values, dtype=np.float32)
    return array[np.isfinite(array)]


def normalize_flux(flux: np.ndarray) -> np.ndarray:
    clean = finite_float_array(flux)
    if clean.size == 0:
        return clean
    median = float(np.nanmedian(clean))
    if np.isfinite(median) and abs(median) > 1e-8:
        clean = clean / median
    return np.clip(np.nan_to_num(clean, nan=1.0, posinf=1.0, neginf=1.0), 0.65, 1.35).astype(np.float32)


def phase_fold(time: np.ndarray, period_days: float, epoch_days: float) -> np.ndarray:
    return ((time - epoch_days + 0.5 * period_days) % period_days) / period_days - 0.5


def fold_and_bin(
    time,
    flux,
    period_days: float,
    epoch_days: float,
    length: int,
    phase_min: float = -0.5,
    phase_max: float = 0.5,
) -> np.ndarray:
    time_arr = np.asarray(time, dtype=np.float32)
    flux_arr = np.asarray(flux, dtype=np.float32)
    mask = np.isfinite(time_arr) & np.isfinite(flux_arr)
    time_arr = time_arr[mask]
    flux_arr = normalize_flux(flux_arr[mask])
    if time_arr.size == 0 or flux_arr.size == 0 or not np.isfinite(period_days) or period_days <= 0:
        return np.ones(length, dtype=np.float32)
    epoch = float(epoch_days) if np.isfinite(epoch_days) else float(time_arr[0])
    phase = phase_fold(time_arr, float(period_days), epoch)
    view_mask = (phase >= phase_min) & (phase <= phase_max)
    phase = phase[view_mask]
    flux_arr = flux_arr[view_mask]
    if phase.size == 0:
        return np.ones(length, dtype=np.float32)
    order = np.argsort(phase)
    phase = phase[order]
    flux_arr = flux_arr[order]
    edges = np.linspace(phase_min, phase_max, length + 1)
    centers = (edges[:-1] + edges[1:]) / 2.0
    binned = np.full(length, np.nan, dtype=np.float32)
    bin_index = np.clip(np.searchsorted(edges, phase, side="right") - 1, 0, length - 1)
    for index in range(length):
        values = flux_arr[bin_index == index]
        if values.size:
            binned[index] = float(np.nanmedian(values))
    valid = np.isfinite(binned)
    if not valid.any():
        return np.ones(length, dtype=np.float32)
    if valid.sum() == 1:
        binned[~valid] = float(binned[valid][0])
    else:
        binned[~valid] = np.interp(centers[~valid], centers[valid], binned[valid])
    median = float(np.nanmedian(binned))
    if np.isfinite(median) and abs(median) > 1e-8:
        binned = binned / median
    return np.clip(binned, 0.65, 1.35).astype(np.float32)


def local_phase_window(period_days: float, duration_hrs: float, multiplier: float = 8.0) -> float:
    if not np.isfinite(period_days) or period_days <= 0 or not np.isfinite(duration_hrs) or duration_hrs <= 0:
        return 0.08
    duration_phase = (duration_hrs / 24.0) / period_days
    return float(np.clip(duration_phase * multiplier, 0.025, 0.18))


def split_frame(frame: pd.DataFrame, seed: int, val_fraction: float = 0.10, test_fraction: float = 0.10):
    rng = np.random.default_rng(seed)
    groups = np.asarray(sorted(frame["kepid"].dropna().unique()))
    rng.shuffle(groups)
    total = len(groups)
    test_count = max(1, int(round(total * test_fraction)))
    val_count = max(1, int(round(total * val_fraction)))
    test_groups = set(groups[:test_count].tolist())
    val_groups = set(groups[test_count : test_count + val_count].tolist())
    train_groups = set(groups[test_count + val_count :].tolist())
    train = frame[frame["kepid"].isin(train_groups)].copy()
    val = frame[frame["kepid"].isin(val_groups)].copy()
    test = frame[frame["kepid"].isin(test_groups)].copy()
    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


def download_kepler_light_curve(kepid: int, cache_dir: Path):
    try:
        import lightkurve as lk
    except Exception as exc:
        raise SystemExit("lightkurve is required for --download-lightcurves. Run: pip install lightkurve astropy") from exc
    target = f"KIC {int(kepid)}"
    search = lk.search_lightcurve(target, mission="Kepler", author="Kepler", cadence="long")
    if len(search) == 0:
        return None
    collection = search.download_all(download_dir=str(cache_dir))
    if collection is None or len(collection) == 0:
        return None
    stitched = collection.stitch().remove_nans().normalize()
    try:
        flattened = stitched.flatten(window_length=401)
    except Exception:
        flattened = stitched
    time_values = np.asarray(flattened.time.value, dtype=np.float32)
    flux_values = np.asarray(flattened.flux.value, dtype=np.float32)
    mask = np.isfinite(time_values) & np.isfinite(flux_values)
    return time_values[mask], flux_values[mask]


def materialize_row_from_curve(row: pd.Series, curve: tuple[np.ndarray, np.ndarray] | None, sequence_length: int):
    if curve is None:
        return None
    time_values, flux_values = curve
    period = float(row.get("period_days", np.nan))
    epoch = float(row.get("tce_time0bk", np.nan))
    duration = float(row.get("duration_hrs", np.nan))
    window = local_phase_window(period, duration)
    global_view = fold_and_bin(time_values, flux_values, period, epoch, sequence_length, -0.5, 0.5)
    local_view = fold_and_bin(time_values, flux_values, period, epoch, sequence_length, -window, window)
    phase = phase_fold(time_values, period, epoch)
    transit_number = np.floor((time_values - epoch) / period).astype(int) if np.isfinite(period) and period > 0 else np.zeros_like(time_values, dtype=int)
    odd_mask = transit_number % 2 != 0
    even_mask = ~odd_mask
    odd_view = fold_and_bin(time_values[odd_mask], flux_values[odd_mask], period, epoch, sequence_length, -window, window)
    even_view = fold_and_bin(time_values[even_mask], flux_values[even_mask], period, epoch, sequence_length, -window, window)
    result = row.to_dict()
    result.update(
        {
            "flux_global": global_view.tobytes(),
            "flux_local": local_view.tobytes(),
            "flux_odd": odd_view.tobytes(),
            "flux_even": even_view.tobytes(),
            "flux_raw_len": int(len(flux_values)),
            "phase_window": float(window),
            "phase_min_observed": float(np.nanmin(phase)) if phase.size else np.nan,
            "phase_max_observed": float(np.nanmax(phase)) if phase.size else np.nan,
        }
    )
    return result


def write_split_parquets(frame: pd.DataFrame, output_dir: Path, seed: int) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    train, val, test = split_frame(frame, seed=seed)
    splits = {"train": train, "val": val, "test": test}
    summary = {}
    for name, split in splits.items():
        path = output_dir / f"{name}.parquet"
        split.to_parquet(path, index=False)
        summary[name] = {
            "rows": int(len(split)),
            "planets": int((split["disposition"] == "PLANET").sum()),
            "false_positive": int((split["disposition"] == "FALSE_POSITIVE").sum()),
            "no_signal": int((split["disposition"] == "NO_SIGNAL").sum()),
            "unique_kepid": int(split["kepid"].nunique()),
            "path": str(path.relative_to(ROOT)),
        }
    return summary


def build_lightcurve_dataset(
    labeled: pd.DataFrame,
    output_dir: Path,
    sequence_length: int,
    max_rows: int | None,
    seed: int,
    keep_lightcurve_cache: bool,
    target_timeout_seconds: int,
    checkpoint_rows: int,
) -> tuple[pd.DataFrame, dict]:
    if max_rows and max_rows < len(labeled):
        labeled = labeled.sample(n=max_rows, random_state=seed).reset_index(drop=True)
    cache_dir = DR24_DIR / "lightkurve-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    failures = []
    processed = 0
    last_checkpoint_rows = 0
    split_summary = {}
    groups = list(labeled.groupby("kepid", sort=False))
    for group_index, (kepid, group) in enumerate(groups, start=1):
        target_cache_dir = cache_dir / str(int(kepid))
        print(
            f"target {group_index}/{len(groups)} KIC {int(kepid)} rows={len(group)} processed={processed} kept_rows={len(rows)}",
            flush=True,
        )
        try:
            with target_timeout(target_timeout_seconds):
                curve = download_kepler_light_curve(int(kepid), target_cache_dir)
        except TargetTimeoutError as exc:
            curve = None
            failures.append({"kepid": int(kepid), "reason": str(exc)})
        except Exception as exc:
            curve = None
            failures.append({"kepid": int(kepid), "reason": str(exc)})
        for index, row in group.iterrows():
            processed += 1
            materialized = materialize_row_from_curve(row, curve, sequence_length)
            if materialized is None:
                failures.append({"index": int(index), "kepid": int(kepid), "reason": "no_light_curve"})
                continue
            rows.append(materialized)
        if not keep_lightcurve_cache:
            shutil.rmtree(target_cache_dir, ignore_errors=True)
        if checkpoint_rows > 0 and len(rows) - last_checkpoint_rows >= checkpoint_rows:
            split_summary = write_split_parquets(pd.DataFrame(rows), output_dir, seed=seed)
            last_checkpoint_rows = len(rows)
            print(f"checkpoint wrote {len(rows)} rows to {output_dir}", flush=True)
        if processed % 50 == 0 or processed >= len(labeled):
            print(f"materialized {len(rows)} rows from {processed} TCE rows; failures={len(failures)}", flush=True)
    dataset = pd.DataFrame(rows)
    split_summary = write_split_parquets(dataset, output_dir, seed=seed) if len(dataset) else split_summary
    return dataset, {"materialized_rows": int(len(dataset)), "failures": failures[:50], "split_summary": split_summary}


def class_distribution(frame: pd.DataFrame) -> dict[str, int]:
    return {str(label): int(count) for label, count in frame["disposition"].value_counts().sort_index().items()}


def build_manifest(metadata: pd.DataFrame, labeled: pd.DataFrame, args: argparse.Namespace, materialization: dict | None = None) -> dict:
    return {
        "created_at": utc_now(),
        "source": {
            "name": "NASA Exoplanet Archive Kepler DR24 Threshold Crossing Events",
            "tap_url": NASA_TAP_URL,
            "table": NASA_TCE_TABLE,
            "query_columns": NASA_TCE_COLUMNS,
            "query_url": NASA_TAP_URL + "?" + urlencode({"query": f"select {', '.join(NASA_TCE_COLUMNS)} from {NASA_TCE_TABLE}", "format": "json"}),
        },
        "label_source": args.label_source,
        "metadata_rows": int(len(metadata)),
        "labeled_rows": int(len(labeled)),
        "unique_kepid": int(labeled["kepid"].nunique()) if len(labeled) else 0,
        "class_distribution": class_distribution(labeled) if len(labeled) else {},
        "human_reviewed_rows": int(labeled["label_is_human_reviewed"].sum()) if len(labeled) else 0,
        "sequence_length": int(args.sequence_length),
        "lightcurves_downloaded": bool(args.download_lightcurves),
        "kept_lightcurve_cache": bool(args.keep_lightcurve_cache),
        "target_timeout_seconds": int(args.target_timeout_seconds),
        "checkpoint_rows": int(args.checkpoint_rows),
        "materialization": materialization or {},
        "notes": [
            "clean labels use av_training_set and exclude UNK",
            "predicted labels use av_pred_class and include more rows but are weak labels",
            "full Kepler light-curve materialization can approach Colab disk limits; use max rows for smoke runs",
        ],
    }


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a NASA Kepler DR24 TCE dataset for ExoSignal.")
    parser.add_argument("--label-source", choices=["clean", "predicted"], default="clean")
    parser.add_argument("--max-metadata-rows", type=int, default=None)
    parser.add_argument("--download-lightcurves", action="store_true")
    parser.add_argument("--keep-lightcurve-cache", action="store_true")
    parser.add_argument("--target-timeout-seconds", type=int, default=180)
    parser.add_argument("--checkpoint-rows", type=int, default=50)
    parser.add_argument("--max-lightcurve-rows", type=int, default=None)
    parser.add_argument("--sequence-length", type=int, default=1024)
    parser.add_argument("--output-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--seed", type=int, default=21)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    DR24_DIR.mkdir(parents=True, exist_ok=True)
    start = time.time()
    metadata = fetch_tce_metadata(max_rows=args.max_metadata_rows)
    metadata.to_csv(METADATA_PATH, index=False)
    labeled = build_label_frame(metadata, label_source=args.label_source)
    labeled.to_csv(LABELED_PATH, index=False)
    materialization = None
    if args.download_lightcurves:
        _, materialization = build_lightcurve_dataset(
            labeled,
            output_dir=args.output_dir,
            sequence_length=args.sequence_length,
            max_rows=args.max_lightcurve_rows,
            seed=args.seed,
            keep_lightcurve_cache=args.keep_lightcurve_cache,
            target_timeout_seconds=args.target_timeout_seconds,
            checkpoint_rows=args.checkpoint_rows,
        )
    manifest = build_manifest(metadata, labeled, args, materialization=materialization)
    manifest["elapsed_seconds"] = round(time.time() - start, 2)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
