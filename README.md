# ExoSignal Observatory

Full-stack exoplanet transit detection project built around the professor's requirements:

- load and visualize real Kepler/K2/TESS light curves;
- clean and normalize brightness signals;
- detect periodic dips compatible with transits;
- extract period, depth, duration, SNR, and other engineered features;
- train a baseline Random Forest or XGBoost model;
- evaluate with precision, recall, F1, ROC-AUC, PR-AUC, and confusion matrix;
- expose a polished website with upload, demo visualization, candidate probability, and scientific caution.

## Dataset

Primary large dataset target:

[`bingbangboom/exoplanet-transit-detection`](https://huggingface.co/datasets/bingbangboom/exoplanet-transit-detection) on Hugging Face.

It contains 23,567 real rows from NASA Kepler, K2, and TESS missions, including raw normalized light curves, folded views, labels, stellar metadata, transit parameters, and source URLs. The full repository is about 1.95 GB.

The current local copy has the full `metadata`, `train`, `val`, and `test` files downloaded.

## Current Baseline

The saved model artifact is a real trained baseline at `models/baseline_model.joblib`.

- Model: XGBoost baseline
- Training rows used: 6,000
- Engineered features: 58
- Precision: 0.813
- Recall: 0.921
- F1-score: 0.864
- ROC-AUC: 0.951
- PR-AUC: 0.914
- Confusion matrix: `[[658, 116], [43, 503]]` for `[not_planet, planet]`

`scripts/train_model.py` uses XGBoost automatically when it can import it. This local macOS setup uses the compatible `xgboost==1.7.6` wheel because the latest wheel requires a newer system `libomp`/Command Line Tools setup.

## Deep Learning Upgrade

The project now includes a Colab-ready 1D CNN pipeline for folded light curves:

- Notebook: `notebooks/exosignal_deep_learning_colab.ipynb`
- Local script: `scripts/train_deep_learning.py`
- Exported artifacts expected by the backend:
  - `models/deep_lightcurve_cnn.keras`
  - `models/deep_model_metrics.json`
  - `models/deep_model_config.json`

The FastAPI backend automatically checks for the deep artifact. If it exists and TensorFlow is available locally, uploaded/demo curves use the deep model blended with the baseline calibration. If it is not available, the app continues to use the current XGBoost/Random Forest baseline.

Latest Colab run:

- Environment: Google Colab T4 GPU
- Training rows: 12,000
- Test rows: 2,357
- Precision: 0.663
- Recall: 0.947
- F1-score: 0.780
- ROC-AUC: 0.777
- PR-AUC: 0.608
- Confusion matrix: `[[906, 471], [52, 928]]` for `[not_planet, planet]`

Interpretation: this first CNN is high-recall, meaning it catches most candidate planets, but it creates too many false positives. That is acceptable for a first candidate-prioritization deep model, not for a production scientific detector.

## Deep Learning Optimization Plan

The first CNN underperformed the XGBoost baseline, so the new training pipeline tests whether the problem is information loss, architecture, class confusion, or insufficient tuning.

Implemented in `scripts/train_deep_learning.py`:

- full training split by default: 18,853 train rows;
- sequence-length experiments: 512, 1024, 2048;
- residual CNN blocks with BatchNormalization, Dropout, and GlobalAveragePooling1D;
- attention CNN using MultiHeadAttention after convolutional blocks;
- TCN-style dilated residual convolutions for longer-range time structure;
- hybrid model: CNN light-curve branch plus dense engineered-feature branch;
- focal loss for hard PLANET vs FALSE_POSITIVE cases;
- class weights for binary and three-class tasks;
- light-curve augmentation: time shift, Gaussian noise, flux scaling;
- mixed precision training for Colab T4 GPUs;
- EarlyStopping, ReduceLROnPlateau, ModelCheckpoint;
- cosine annealing learning-rate schedule;
- KerasTuner Random Search or Bayesian Optimization;
- binary classification and three-class classification reports.

Memory estimate for full train/val/test tensors:

| Sequence length | Train tensor | Val tensor | Test tensor | All tensors |
|---:|---:|---:|---:|---:|
| 512 | 147.29 MB | 18.41 MB | 18.41 MB | 184.12 MB |
| 1024 | 294.58 MB | 36.83 MB | 36.83 MB | 368.23 MB |
| 2048 | 589.16 MB | 73.66 MB | 73.66 MB | 736.47 MB |

Colab commands:

```bash
pip install -r requirements-deep.txt
python scripts/download_dataset.py --splits metadata train val test
python scripts/train_deep_learning.py --print-memory-plan --sweep-sequence-lengths 512,1024,2048
python scripts/train_deep_learning.py --smoke --max-train-rows 512 --max-val-rows 256 --max-test-rows 256
python scripts/train_deep_learning.py --task binary --model-family hybrid --sequence-length 1024 --epochs 40 --batch-size 32 --mixed-precision --augment --loss focal
python scripts/train_deep_learning.py --task binary --model-family hybrid --sequence-length 1024 --tune --tuner random --max-trials 24 --mixed-precision --augment --loss focal
python scripts/train_deep_learning.py --task multiclass --model-family attention --sequence-length 1024 --epochs 40 --batch-size 32 --mixed-precision --augment --loss focal
```

Binary runs must be compared to XGBoost first because the XGBoost baseline is binary. Three-class runs are then used to separate `PLANET`, `FALSE_POSITIVE`, and `NO_SIGNAL`.

Official NASA catalog snapshots can be downloaded with:

```bash
npm run download:nasa:catalogs
```

This fetches NASA Exoplanet Archive TAP tables for confirmed planetary systems, TESS Objects of Interest, and Kepler KOIs. Full Kepler DR25 light curves remain a cloud-scale dataset: NASA notes that quarterly scripts can retrieve about 175 GB each and the full Kepler light-curve set approaches 3 TB.

## Setup

```bash
cd exoplanet-hunter
/Users/oussamaashad/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm install
```

## Data And Model

Download the lighter validated splits first:

```bash
npm run download:data
```

Download the full training data:

```bash
npm run download:data:full
```

Train a fast demo model:

```bash
npm run demo:model
```

Train from all available rows:

```bash
npm run train
```

Train the deep CNN locally only if TensorFlow is installed:

```bash
npm run train:deep
```

Recommended for free GPU training: open `notebooks/exosignal_deep_learning_colab.ipynb` in Google Colab, run all cells, download `exosignal_deep_model_artifacts.zip`, and unzip it into this project root.

## Run

Terminal 1:

```bash
npm run api
```

Terminal 2:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`.

## Scientific Caveat

The model does not officially confirm exoplanets. It detects and prioritizes candidates for deeper analysis. Confirmation requires domain validation, vetting, and follow-up observations.
