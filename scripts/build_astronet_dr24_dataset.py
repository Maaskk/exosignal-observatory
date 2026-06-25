from __future__ import annotations

import argparse
import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ASTRONET_DIR = DATA_DIR / "astronet_dr24"
RAW_DIR = ASTRONET_DIR / "raw"
PROCESSED_DIR = ASTRONET_DIR / "processed"
MANIFEST_PATH = ASTRONET_DIR / "manifest.json"

ASTRONET_DR24_FOLDER_URL = "https://drive.google.com/drive/folders/1Gw-o7sgWC1Y_mlaehN85qH5XC161EHSE?usp=sharing"

LABEL_MAP = {
    "PC": "PLANET",
    "AFP": "FALSE_POSITIVE",
    "NTP": "NO_SIGNAL",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def download_folder(output_dir: Path) -> None:
    try:
        import gdown
    except Exception as exc:
        raise SystemExit("gdown is required. Install with: pip install gdown") from exc
    output_dir.mkdir(parents=True, exist_ok=True)
    gdown.download_folder(
        url=ASTRONET_DR24_FOLDER_URL,
        output=str(output_dir),
        quiet=False,
        use_cookies=False,
        remaining_ok=True,
    )


def find_tfrecords(raw_dir: Path) -> dict[str, list[Path]]:
    all_files = [path for path in raw_dir.rglob("*") if path.is_file()]
    splits: dict[str, list[Path]] = {"train": [], "val": [], "test": []}
    for path in all_files:
        name = path.name.lower()
        if name.startswith("train"):
            splits["train"].append(path)
        elif name.startswith(("val", "validation", "eval")):
            splits["val"].append(path)
        elif name.startswith("test"):
            splits["test"].append(path)
    return {key: sorted(value) for key, value in splits.items()}


def feature_to_scalar(feature):
    if feature.bytes_list.value:
        return feature.bytes_list.value[0].decode("utf-8", errors="ignore")
    if feature.float_list.value:
        return float(feature.float_list.value[0])
    if feature.int64_list.value:
        return int(feature.int64_list.value[0])
    return None


def feature_to_float_array(feature) -> np.ndarray:
    if feature.float_list.value:
        return np.asarray(feature.float_list.value, dtype=np.float32)
    if feature.int64_list.value:
        return np.asarray(feature.int64_list.value, dtype=np.float32)
    return np.asarray([], dtype=np.float32)


def get_scalar(features: dict, *names: str):
    for name in names:
        if name in features:
            return feature_to_scalar(features[name])
    return None


def get_float(features: dict, *names: str) -> float:
    value = get_scalar(features, *names)
    try:
        return float(value)
    except (TypeError, ValueError):
        return np.nan


def decode_label(features: dict) -> str | None:
    raw = get_scalar(features, "av_training_set", "av_pred_class", "label")
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        numeric_map = {1: "PC", 0: "AFP", 2: "NTP"}
        raw = numeric_map.get(int(raw), str(raw))
    label_code = str(raw).upper().strip()
    return LABEL_MAP.get(label_code)


def normalize_view(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    values = values[np.isfinite(values)]
    if values.size == 0:
        return np.ones(1, dtype=np.float32)
    median = float(np.nanmedian(values))
    if np.isfinite(median) and abs(median) > 1e-8:
        values = values / median
    return np.clip(np.nan_to_num(values, nan=1.0, posinf=1.0, neginf=1.0), 0.65, 1.35).astype(np.float32)


def example_to_row(example, split: str) -> dict | None:
    features = example.features.feature
    disposition = decode_label(features)
    if disposition is None:
        return None
    global_view = normalize_view(feature_to_float_array(features["global_view"])) if "global_view" in features else np.ones(1, dtype=np.float32)
    local_view = normalize_view(feature_to_float_array(features["local_view"])) if "local_view" in features else np.ones(1, dtype=np.float32)
    kepid = get_scalar(features, "kepid", "kepler_id", "kic")
    planet_number = get_scalar(features, "tce_plnt_num", "planet_num", "tce_num")
    tce_id = f"KIC {kepid}.{planet_number}" if kepid is not None and planet_number is not None else f"{split}-{id(example)}"
    return {
        "source_dataset": "Google Research AstroNet / NASA Kepler DR24 TCE",
        "source_split": split,
        "mission": "kepler",
        "cadence": "long",
        "star_id": f"KIC {kepid}" if kepid is not None else "",
        "kepid": int(kepid) if kepid is not None else np.nan,
        "tce_plnt_num": int(planet_number) if planet_number is not None else np.nan,
        "tce_id": tce_id,
        "disposition": disposition,
        "period_days": get_float(features, "tce_period", "period"),
        "duration_hrs": get_float(features, "tce_duration", "duration"),
        "depth_ppm": get_float(features, "tce_depth", "depth"),
        "planet_radius_earth": get_float(features, "tce_prad", "planet_radius"),
        "teff": get_float(features, "tce_steff", "teff"),
        "logg": get_float(features, "tce_slogg", "logg"),
        "radius": get_float(features, "tce_sradius", "stellar_radius"),
        "mass": get_float(features, "tce_smass", "stellar_mass"),
        "metallicity": get_float(features, "tce_smet", "metallicity"),
        "kepmag": get_float(features, "kic_kepmag", "kepmag"),
        "cdpp_3hr": get_float(features, "tce_cdpp3", "cdpp_3hr"),
        "n_planets_in_system": get_float(features, "tce_num_planets", "n_planets_in_system"),
        "has_transit_params": bool(np.isfinite(get_float(features, "tce_period", "period"))),
        "flux_global": global_view.tobytes(),
        "flux_local": local_view.tobytes(),
        "flux_odd": local_view.tobytes(),
        "flux_even": local_view.tobytes(),
        "flux_raw_len": int(global_view.size + local_view.size),
    }


def read_tfrecord_rows(paths: list[Path], split: str, max_rows: int | None) -> list[dict]:
    try:
        import tensorflow as tf
    except Exception as exc:
        raise SystemExit("TensorFlow is required to read AstroNet TFRecords.") from exc
    rows: list[dict] = []
    for path in paths:
        print(f"reading {split}: {path}", flush=True)
        for raw_record in tf.data.TFRecordDataset(str(path)):
            example = tf.train.Example()
            example.ParseFromString(bytes(raw_record.numpy()))
            row = example_to_row(example, split)
            if row is not None:
                rows.append(row)
            if max_rows and len(rows) >= max_rows:
                return rows
    return rows


def split_distribution(frame: pd.DataFrame) -> dict[str, int]:
    if frame.empty:
        return {}
    return {str(k): int(v) for k, v in frame["disposition"].value_counts().sort_index().items()}


def convert(raw_dir: Path, output_dir: Path, max_rows_per_split: int | None) -> dict:
    splits = find_tfrecords(raw_dir)
    missing = [name for name, paths in splits.items() if not paths]
    if missing:
        raise SystemExit(f"Missing AstroNet TFRecord split(s): {missing}. Found files under {raw_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {}
    for split, paths in splits.items():
        rows = read_tfrecord_rows(paths, split, max_rows=max_rows_per_split)
        frame = pd.DataFrame(rows)
        path = output_dir / f"{split}.parquet"
        frame.to_parquet(path, index=False)
        summary[split] = {
            "rows": int(len(frame)),
            "class_distribution": split_distribution(frame),
            "unique_kepid": int(frame["kepid"].nunique()) if "kepid" in frame and len(frame) else 0,
            "path": str(path.relative_to(ROOT)),
        }
        print(json.dumps({split: summary[split]}, indent=2), flush=True)
    return summary


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download/convert Google AstroNet NASA Kepler DR24 TFRecords.")
    parser.add_argument("--download", action="store_true", help="Download the public precomputed AstroNet DR24 folder with gdown.")
    parser.add_argument("--clean", action="store_true", help="Remove existing raw/processed AstroNet files first.")
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--output-dir", type=Path, default=PROCESSED_DIR)
    parser.add_argument("--max-rows-per-split", type=int, default=None)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    start = time.time()
    if args.clean:
        shutil.rmtree(args.raw_dir, ignore_errors=True)
        shutil.rmtree(args.output_dir, ignore_errors=True)
    ASTRONET_DIR.mkdir(parents=True, exist_ok=True)
    if args.download:
        download_folder(args.raw_dir)
    summary = convert(args.raw_dir, args.output_dir, max_rows_per_split=args.max_rows_per_split)
    manifest = {
        "created_at": utc_now(),
        "source": {
            "name": "Google Research AstroNet precomputed NASA Kepler DR24 TCE views",
            "folder_url": ASTRONET_DR24_FOLDER_URL,
            "reference": "Shallue & Vanderburg 2018; AstroNet global/local phase-folded views",
        },
        "processed_dir": str(args.output_dir.relative_to(ROOT) if args.output_dir.is_relative_to(ROOT) else args.output_dir),
        "summary": summary,
        "elapsed_seconds": round(time.time() - start, 2),
        "notes": [
            "global_view is a 2001-bin phase-folded light curve",
            "local_view is a 201-bin zoom around the detected transit",
            "labels come from DR24 Autovetter training labels PC/AFP/NTP",
        ],
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
