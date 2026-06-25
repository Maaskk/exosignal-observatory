# Deep Learning Optimization And GitHub Push Design

## Goal

Upgrade ExoSignal Observatory from a first CNN baseline into a reproducible deep-learning experiment suite that can challenge the current XGBoost baseline, while keeping the deployable app stable and pushing only code/small artifacts to a new GitHub repository.

## Current State

The project already has a working FastAPI backend, React/Vite frontend, full local cleaned dataset files, NASA catalog snapshots, an active XGBoost baseline, and a first Colab CNN result.

Current data:

- Total cleaned samples: 23,567.
- Train: 18,853.
- Validation: 2,357.
- Test: 2,357.
- Missions: Kepler, K2, TESS.
- Classes: PLANET, FALSE_POSITIVE, NO_SIGNAL.
- Light-curve channels: flux_global, flux_local, flux_odd, flux_even.
- Engineered features: period, depth, duration, SNR, dip count, variability/noise, stellar metadata, mission flags, curve statistics.

Current model results:

- XGBoost baseline: ROC-AUC 0.951, PR-AUC 0.914, precision 0.813, recall 0.921, F1 0.864.
- First CNN: ROC-AUC 0.777, PR-AUC 0.608, precision 0.663, recall 0.947, F1 0.780.

The CNN has useful recall but too many false positives. The next version should keep recall high while improving precision, ROC-AUC, PR-AUC, and F1.

## Design Choice

Training and tuning stay in Google Colab/GPU. The local repository receives the complete training code, reproducible notebook, metrics schema, and integration logic. The local/online app keeps using the stronger XGBoost model until a deep model artifact beats or approaches it.

This avoids pretending the local Mac can efficiently run every deep experiment and keeps the GitHub repo professional: source code, notebooks, small metrics, and docs are versioned; heavy parquet data, virtual environments, build output, and model binaries are excluded.

## Deep Learning Experiment Suite

The upgraded training code will support these experiment modes:

- Binary classification: PLANET vs NOT_PLANET.
- Three-class classification: PLANET vs FALSE_POSITIVE vs NO_SIGNAL.
- Sequence lengths: 512, 1024, 2048.
- Full training set by default: all 18,853 train rows.
- Optional row caps for smoke tests.
- Random Search or Bayesian KerasTuner optimization.
- Baseline residual CNN.
- Hybrid model with a CNN light-curve branch and dense engineered-feature branch.
- Optional Temporal Convolutional Network model for long-range time-series structure.
- Focal loss for difficult binary and multiclass cases where false positives are confused with planets.
- Light-curve augmentation: circular/time shift, Gaussian noise injection, and small flux scaling.
- Class weighting for PLANET, FALSE_POSITIVE, and NO_SIGNAL imbalance.
- Mixed precision training on Colab T4 GPUs.
- Attention layer after convolutional feature extraction so the model can focus on transit windows.
- Cosine annealing learning-rate schedule for tuner runs, with ReduceLROnPlateau still available for baseline runs.

The experiment suite will report:

- ROC-AUC.
- PR-AUC.
- Precision.
- Recall.
- F1-score.
- Confusion matrix.
- Sequence length.
- Model family.
- Batch size.
- Peak tensor memory estimate.
- Training rows, validation rows, test rows.

## Architecture

`scripts/train_deep_learning.py` becomes the central local/Colab-compatible trainer. It will remain runnable from CLI, but it will be upgraded from a single fixed CNN to an experiment runner.

Core responsibilities:

- Load parquet splits.
- Convert byte-encoded light-curve columns into normalized tensors.
- Build engineered feature matrices.
- Build labels for binary or multiclass mode.
- Build residual CNN and hybrid CNN models.
- Run KerasTuner search when requested.
- Apply callbacks: EarlyStopping, ReduceLROnPlateau, ModelCheckpoint.
- Apply optional CosineDecayRestarts schedule for tuner/final runs.
- Apply TensorFlow mixed precision when explicitly enabled.
- Apply deterministic, seed-controlled augmentation only on training data.
- Save best model config, metrics, comparison report, and optional Keras artifact.

The notebook `notebooks/exosignal_deep_learning_colab.ipynb` will call the same logic or mirror it clearly so Colab can run:

- data check/download,
- quick smoke run,
- full sequence sweep,
- tuner run,
- best hybrid training,
- artifact export.

The backend will not train models. It only loads saved artifacts and reports model status. This preserves app reliability.

## Model Design

Residual CNN:

- Input: `(sequence_length, 4)`.
- Conv1D blocks with BatchNormalization, ReLU, Dropout, and residual/skip connections.
- GlobalAveragePooling1D.
- Dense classification head.

Attention CNN:

- Same residual CNN trunk.
- Self-attention or multi-head attention block over the convolutional sequence.
- GlobalAveragePooling1D after attention.
- Dense classification head.

TCN alternative:

- Dilated Conv1D residual blocks.
- Increasing dilation rates to capture long-range relationships.
- GlobalAveragePooling1D.
- Dense classification head.

Hybrid model:

- Light-curve branch: residual CNN over flux channels.
- Feature branch: normalized engineered features through dense layers.
- Concatenation layer.
- Dense head for binary sigmoid or multiclass softmax.

Hyperparameters:

- Filters: 32, 64, 128, 256.
- Kernel size: 3, 5, 7, 11.
- Dropout: 0.2, 0.3, 0.4, 0.5.
- Learning rate: 1e-2, 1e-3, 5e-4, 1e-4.
- Batch size: 16, 32, 64.
- Loss: binary cross-entropy, categorical cross-entropy, focal loss.
- Architecture family: residual CNN, attention CNN, hybrid CNN, TCN.

Search strategy:

- Random Search by default because exhaustive grid search would require 4 x 4 x 4 x 4 x 3 = 768 combinations before sequence length/model family/classification mode multipliers.
- Bayesian Optimization is supported as an option when runtime allows.
- Binary classification runs first to compare fairly against the current XGBoost baseline. Three-class classification runs second because it is scientifically richer but harder.

## Sequence Length Investigation

The trainer will estimate tensor memory for 512, 1024, and 2048 lengths and record actual experiment settings. This directly tests whether downsampling to 256 removed transit detail.

Expected trade-off:

- 512: faster, likely less detail loss than 256.
- 1024: balanced scientific detail and GPU memory.
- 2048: highest detail, slower, may need smaller batch size.

The first investigation is sequence length before heavy architecture tuning. If 512 or 1024 improves recall/precision balance, it indicates 256-point interpolation was degrading transit information.

## GitHub Scope

The GitHub repository will contain:

- Frontend source.
- Backend source.
- Training scripts.
- Colab notebook.
- README and project documentation.
- Small metrics/config JSON files.
- Small demo CSV curves.

The GitHub repository will not contain:

- `.venv/`
- `node_modules/`
- `dist/`
- `data/*.parquet`
- large raw CSV data
- uploaded files
- Keras model binaries unless the user explicitly approves adding a specific artifact
- local logs and PID files

The `.gitignore` will allow selected small model metrics/config JSON files while excluding heavyweight trained model binaries.

## Acceptance Criteria

- `scripts/train_deep_learning.py --help` documents binary, multiclass, sequence lengths, tuner, and hybrid options.
- A smoke test can run without TensorFlow installed far enough to validate imports/CLI structure, or exits cleanly with a TensorFlow message.
- Existing FastAPI backend still compiles and serves model status.
- Frontend build still passes.
- README explains how to run the Colab optimization workflow.
- Git repository is initialized if needed.
- Code-only repository is pushed to GitHub.

## Non-Goals For This Round

- No Contabo deployment yet.
- No public production backend yet.
- No forced local TensorFlow installation on the Mac.
- No pushing the 1.8 GB local dataset to GitHub.
- No claiming a CNN has beaten XGBoost until real metrics prove it.
