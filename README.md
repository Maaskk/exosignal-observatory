# ExoSignal Observatory

ExoSignal Observatory is a student project for classifying transit-like patterns in Kepler light curves. It includes a React interface, a FastAPI API, data preparation scripts and reproducible training notebooks.

## Final T4 evaluation

The final experiment used NASA Kepler DR24 AstroNet phase-folded views: global, local, odd and even. Three residual models were trained with different random seeds. Calibration and threshold selection used validation data only; the test split was evaluated once at the end.

| Metric | Test result |
|---|---:|
| Accuracy | 88.56% |
| Balanced accuracy | 84.77% |
| Precision | 73.68% |
| Recall | 77.78% |
| F1-score | 75.68% |
| ROC-AUC | 93.89% |
| PR-AUC | 76.57% |

Confusion matrix: `[[1114, 100], [80, 280]]`.

The test set contains 360 planet examples. The model detected 280, produced 100 false positives and missed 80.

## Files

- `notebooks/exosignal_t4_optimized_colab.ipynb` — GPU experiment notebork
- `models/t4_optimized/` — saved ensemble weights, preprocessing object and metrics
- `reports/t4_optimized/` — validation and test figures
- `scripts/` — dataset and training utilities
- `backend/` — FastAPI backend
- `src/` — React interface

## Run locally

Install dependencies:

    python3 -m venv .venv
    .venv/bin/pip install -r backend/requirements.txt
    npm ci

Start the API:

    .venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

In another terminal:
    npm run dev

Open `http://127.0.0.1:5173`.

## Scope

The application ranks transit-like signals for review. It does not confirm the existence of an exoplanet.
## Final T4 serving

The production API can serve the three-model T4 ensemble through Docker. It requires `models/t4_optimized/calibrator.joblib`; see `docs/DEPLOYMENT.md`. Uploaded curves must contain enough periodic information for phase folding.
