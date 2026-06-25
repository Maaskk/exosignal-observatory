from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Annotated

import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.config import DATA_DIR, DATASET_REPO, DEEP_METRICS_PATH, DEEP_MODEL_PATH, MODEL_PATH, ROOT_DIR, STATUS_PATH
from backend.app.services.lightcurve import (
    analyze_light_curve,
    downsample_curve,
    make_demo_curve,
    parse_csv_light_curve,
    parse_fits_light_curve,
)
from backend.app.services.model import active_model_status, deep_model_status, load_metrics, predict_candidate


app = FastAPI(
    title="ExoSignal Observatory API",
    description="Light-curve cleaning, transit dip detection, feature extraction, and baseline exoplanet candidate scoring.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _dataset_files():
    return {
        "metadata": DATA_DIR / "metadata.csv",
        "train": DATA_DIR / "train.parquet",
        "val": DATA_DIR / "val.parquet",
        "test": DATA_DIR / "test.parquet",
    }


def _file_status(path: Path) -> dict:
    return {
        "exists": path.exists(),
        "size_mb": round(path.stat().st_size / 1024 / 1024, 2) if path.exists() else 0,
        "path": str(path.relative_to(ROOT_DIR)) if path.exists() else str(path.relative_to(ROOT_DIR)),
    }


def _eda_summary() -> dict | None:
    metadata_path = DATA_DIR / "metadata.csv"
    if not metadata_path.exists():
        return None
    df = pd.read_csv(metadata_path)
    numeric = {}
    for col in ["period_days", "duration_hrs", "depth_ppm", "planet_radius_earth", "teff", "radius", "cdpp_3hr"]:
        if col in df.columns:
            series = pd.to_numeric(df[col], errors="coerce")
            numeric[col] = {
                "median": None if series.dropna().empty else float(series.median()),
                "p10": None if series.dropna().empty else float(series.quantile(0.10)),
                "p90": None if series.dropna().empty else float(series.quantile(0.90)),
            }
    return {
        "row_count": int(len(df)),
        "class_distribution": df["disposition"].fillna("UNKNOWN").value_counts().to_dict()
        if "disposition" in df.columns
        else {},
        "mission_distribution": df["mission"].fillna("unknown").value_counts().to_dict() if "mission" in df.columns else {},
        "cadence_distribution": df["cadence"].fillna("unknown").value_counts().to_dict() if "cadence" in df.columns else {},
        "transit_parameter_coverage": float(df["has_transit_params"].mean()) if "has_transit_params" in df.columns else None,
        "numeric_ranges": numeric,
    }


@app.get("/api/health")
def health():
    return {"ok": True, "service": "ExoSignal Observatory API"}


@app.get("/api/dataset")
def dataset_status():
    files = {name: _file_status(path) for name, path in _dataset_files().items()}
    return {
        "repo": DATASET_REPO,
        "files": files,
        "full_dataset_rows": 23567,
        "missions": ["Kepler", "K2", "TESS"],
        "classes": ["PLANET", "FALSE_POSITIVE", "NO_SIGNAL"],
        "source_note": "Labels from NASA Exoplanet Archive; light curves from MAST via Lightkurve in the published dataset.",
        "eda": _eda_summary(),
    }


@app.get("/api/model")
def model_status():
    return {
        "trained": MODEL_PATH.exists(),
        "model_path": str(MODEL_PATH.relative_to(ROOT_DIR)),
        "deep_trained": DEEP_MODEL_PATH.exists(),
        "deep_metrics_available": DEEP_METRICS_PATH.exists(),
        "deep_model_path": str(DEEP_MODEL_PATH.relative_to(ROOT_DIR)),
        "active_model": active_model_status(),
        "deep_learning": deep_model_status(),
        "metrics": load_metrics(),
        "training_status": json.loads(STATUS_PATH.read_text()) if STATUS_PATH.exists() else None,
    }


def _run_training(max_rows: int | None = None):
    cmd = [str(ROOT_DIR / ".venv" / "bin" / "python"), str(ROOT_DIR / "scripts" / "train_model.py")]
    if max_rows:
        cmd += ["--max-rows", str(max_rows)]
    STATUS_PATH.write_text(json.dumps({"status": "running", "message": "Training baseline model..."}, indent=2))
    try:
        result = subprocess.run(cmd, cwd=ROOT_DIR, capture_output=True, text=True, check=False)
        if result.returncode == 0:
            STATUS_PATH.write_text(
                json.dumps({"status": "complete", "message": "Training finished.", "stdout": result.stdout[-4000:]}, indent=2)
            )
        else:
            STATUS_PATH.write_text(
                json.dumps(
                    {
                        "status": "failed",
                        "message": "Training failed.",
                        "stdout": result.stdout[-4000:],
                        "stderr": result.stderr[-4000:],
                    },
                    indent=2,
                )
            )
    except Exception as exc:
        STATUS_PATH.write_text(json.dumps({"status": "failed", "message": str(exc)}, indent=2))


@app.post("/api/train")
def train(background_tasks: BackgroundTasks, max_rows: int | None = 6000):
    background_tasks.add_task(_run_training, max_rows)
    return {"started": True, "message": "Training started in the background.", "max_rows": max_rows}


def _analysis_payload(time, raw_flux, name: str):
    analysis = analyze_light_curve(time, raw_flux)
    prediction = predict_candidate(analysis.features, cleaned_flux=analysis.cleaned_flux)
    return {
        "target_name": name,
        "raw_curve": downsample_curve(analysis.time, analysis.raw_flux),
        "cleaned_curve": downsample_curve(analysis.time, analysis.cleaned_flux),
        "dips": analysis.dips,
        "features": analysis.features,
        "prediction": prediction,
        "scientific_caution": "Candidate probability is a prioritization score, not an official exoplanet confirmation.",
    }


@app.get("/api/demo")
def demo_curve():
    time, flux = make_demo_curve()
    return _analysis_payload(time, flux, "Synthetic transit demo shaped like a Kepler/TESS light curve")


@app.post("/api/analyze")
async def analyze(file: Annotated[UploadFile, File()]):
    content = await file.read()
    suffix = Path(file.filename or "").suffix.lower()
    try:
        if suffix in [".fits", ".fit", ".fts"]:
            time, flux = parse_fits_light_curve(content)
        else:
            time, flux = parse_csv_light_curve(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse(_analysis_payload(time, flux, file.filename or "uploaded light curve"))
