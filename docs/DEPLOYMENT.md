# Local and server run

The final serving path uses the three T4 ensemble weights inside a Python 3.12 Linux container. This avoids the incompatible local macOS Python 3.14 runtime.

## Required calibration artifact

`models/t4_optimized/calibrator.joblib` is required. It is the isotonic calibrator fitted on validation predictions in the T4 notebook. Do not replace it with an uncalibrated score or a manually chosen threshold.

## Local test

```bash
cp ~/Downloads/calibrator.joblib models/t4_optimized/
docker compose up --build
```

Open `http://localhost:8080`, then check `/api/health` and `/api/model`.

## Scope

The API uses the T4 ensemble only when it can estimate a repeatable period from an uploaded curve and build global, local, odd and even phase-folded views. The published DR24 test metrics remain specific to the held-out AstroNet protocol; arbitrary uploads are screening scores.
