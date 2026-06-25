# Deep Learning Optimization And GitHub Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible GPU-ready deep-learning experiment suite for ExoSignal Observatory and push code-only project files to GitHub.

**Architecture:** Keep FastAPI/React stable while upgrading `scripts/train_deep_learning.py` into a Colab-compatible experiment runner. Training stays on Colab/GPU; local code verifies CLI, JSON outputs, backend status, and frontend build. Heavy data/model binaries stay out of GitHub.

**Tech Stack:** Python, pandas, NumPy, scikit-learn metrics, TensorFlow/Keras, optional KerasTuner, FastAPI, React/Vite, Git/GitHub.

---

### Task 1: Git Hygiene And Repo Safety

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Update `.gitignore` to exclude heavy artifacts and keep small metrics**

Ensure `.gitignore` excludes:

```gitignore
.DS_Store
node_modules/
dist/
.venv/
__pycache__/
*.pyc
.pytest_cache/
uploads/
logs/
*.pid
data/*.parquet
data/*.jsonl
data/*.fits
data/*.fit
data/*.fts
models/*.joblib
models/*.pkl
models/*.keras
models/*.h5
models/checkpoints/
models/tuner/
models/experiments/
!models/*.json
!data/.gitkeep
!models/.gitkeep
```

- [ ] **Step 2: Verify no heavy files are staged**

Run:

```bash
find . -type f -size +50M -not -path './.venv/*' -not -path './node_modules/*' -not -path './data/*'
```

Expected: no source files over 50 MB.

### Task 2: Deep Learning Experiment Runner

**Files:**
- Replace: `scripts/train_deep_learning.py`

- [ ] **Step 1: Add CLI options**

The script must support:

```bash
python scripts/train_deep_learning.py --help
python scripts/train_deep_learning.py --smoke
python scripts/train_deep_learning.py --task binary --model-family hybrid --sequence-length 1024
python scripts/train_deep_learning.py --task multiclass --model-family attention --sequence-length 512
python scripts/train_deep_learning.py --sweep-sequence-lengths 512,1024,2048
python scripts/train_deep_learning.py --tune --tuner random --max-trials 20
```

- [ ] **Step 2: Implement data loading and preprocessing**

Implement functions:

```python
bytes_to_float_array(value) -> np.ndarray
robust_sequence(value, length: int) -> np.ndarray
frame_to_tensor(df, sequence_length, array_columns, augment=False, seed=21) -> np.ndarray
build_engineered_features(df) -> tuple[np.ndarray, list[str]]
build_labels(df, task: str) -> tuple[np.ndarray, list[str]]
```

For augmentation, apply only to train tensors:

```python
time shift: np.roll(channel, shift)
noise: channel + rng.normal(0, sigma, size=channel.shape)
flux scale: channel * rng.uniform(0.995, 1.005)
```

- [ ] **Step 3: Implement losses and schedules**

Implement:

```python
binary focal loss
categorical focal loss
class weights for binary and multiclass
ReduceLROnPlateau callback
CosineDecayRestarts schedule
ModelCheckpoint callback
EarlyStopping callback
mixed precision policy when requested
```

- [ ] **Step 4: Implement model families**

Implement:

```python
residual CNN
attention CNN
TCN
hybrid CNN + engineered features
```

All sequence models must use BatchNormalization, Dropout, GlobalAveragePooling1D, and configurable filters/kernel/dropout/learning rate.

- [ ] **Step 5: Implement evaluation**

Binary output metrics:

```json
{
  "roc_auc": 0.0,
  "pr_auc": 0.0,
  "precision": 0.0,
  "recall": 0.0,
  "f1": 0.0,
  "confusion_matrix": {"labels": ["not_planet", "planet"], "values": [[0, 0], [0, 0]]}
}
```

Multiclass output metrics:

```json
{
  "roc_auc_ovr": 0.0,
  "pr_auc_macro": 0.0,
  "precision_macro": 0.0,
  "recall_macro": 0.0,
  "f1_macro": 0.0,
  "confusion_matrix": {"labels": ["FALSE_POSITIVE", "NO_SIGNAL", "PLANET"], "values": [[0, 0, 0], [0, 0, 0], [0, 0, 0]]}
}
```

- [ ] **Step 6: Implement KerasTuner integration**

If KerasTuner is installed, support Random Search and Bayesian Optimization. If missing, print:

```text
KerasTuner is not installed. Run: pip install keras-tuner
```

Do not crash with a vague import error.

### Task 3: Colab Notebook

**Files:**
- Replace: `notebooks/exosignal_deep_learning_colab.ipynb`

- [ ] **Step 1: Build notebook cells**

Notebook cells:

1. install dependencies,
2. download/check dataset,
3. import project trainer,
4. run smoke test,
5. run binary sequence sweep,
6. run hybrid tuner,
7. run multiclass experiment,
8. export artifacts zip.

- [ ] **Step 2: Include Colab-friendly commands**

Notebook must include:

```python
!python scripts/train_deep_learning.py --smoke --max-train-rows 512 --max-val-rows 256 --max-test-rows 256
!python scripts/train_deep_learning.py --task binary --model-family hybrid --sequence-length 1024 --epochs 40 --batch-size 32 --mixed-precision --loss focal
```

### Task 4: README And Reports

**Files:**
- Modify: `README.md`
- Create: `reports/deep_learning_optimization_plan.md`

- [ ] **Step 1: Document the ML upgrade**

README must explain:

- why CNN underperformed,
- why full train set is required,
- sequence length investigation,
- binary vs multiclass comparison,
- focal loss, augmentation, attention, TCN, mixed precision,
- how to run in Colab.

- [ ] **Step 2: Create report template**

The report template must include empty-but-structured tables for:

- model comparison,
- sequence length comparison,
- memory/runtime comparison,
- confusion matrix summary.

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Python syntax check**

Run:

```bash
. .venv/bin/activate && python -m compileall backend scripts
```

Expected: exit code 0.

- [ ] **Step 2: CLI help check**

Run:

```bash
. .venv/bin/activate && python scripts/train_deep_learning.py --help
```

Expected: options for task, model-family, sequence length, tuner, focal loss, mixed precision.

- [ ] **Step 3: Backend status check**

Run:

```bash
curl -s http://127.0.0.1:8000/api/model | python -m json.tool
```

Expected: active baseline and deep metrics status remain readable.

- [ ] **Step 4: Frontend build**

Run:

```bash
npm run build
```

Expected: Vite build succeeds.

### Task 6: GitHub Code-Only Push

**Files:**
- Use git commands.

- [ ] **Step 1: Initialize git repo if needed**

Run:

```bash
git init
git status --short
```

- [ ] **Step 2: Inspect ignored heavy files**

Run:

```bash
git status --ignored --short | sed -n '1,200p'
```

Expected: `.venv/`, `node_modules/`, `dist/`, `data/*.parquet`, and model binaries are ignored.

- [ ] **Step 3: Commit code**

Run:

```bash
git add .
git status --short
git commit -m "feat: add deep learning optimization pipeline"
```

- [ ] **Step 4: Create/push GitHub repo**

Use GitHub CLI if authenticated:

```bash
gh repo create exosignal-observatory --private --source=. --remote=origin --push
```

If `gh` is not authenticated, stop and ask the user to authenticate or provide a repository URL.
