# NASA DR24 Training Source

This project can now build a second, official NASA dataset from the Kepler DR24 Threshold Crossing Events table in the NASA Exoplanet Archive.

Source TAP endpoint:

`https://exoplanetarchive.ipac.caltech.edu/TAP/sync`

Table:

`q1_q17_dr24_tce`

## Label Options

`--label-source clean`

- Human-reviewed Robovetter training labels from `av_training_set`.
- Excludes `UNK`.
- 15,737 labeled TCE rows.
- 9,865 unique Kepler targets.
- PLANET: 3,600
- FALSE_POSITIVE: 9,596
- NO_SIGNAL: 2,541

`--label-source predicted`

- Robovetter predicted labels from `av_pred_class`.
- Uses all labeled predicted rows, including rows missing human training labels.
- 20,367 TCE rows.
- 12,669 unique Kepler targets.
- PLANET: 3,900
- FALSE_POSITIVE: 10,264
- NO_SIGNAL: 6,203

For final scientific evaluation, prefer `clean`. For extra training volume, use `predicted` as weakly labeled data and keep a clean validation/test set.

## Colab Commands

Metadata-only sanity check:

```bash
python scripts/build_nasa_dr24_dataset.py --label-source clean --sequence-length 1024
```

Build processed folded light-curve tensors:

```bash
python scripts/build_nasa_dr24_dataset.py \
  --label-source clean \
  --download-lightcurves \
  --sequence-length 1024
```

Train the deep model from the processed DR24 parquets:

```bash
python scripts/train_deep_learning.py \
  --dataset-profile nasa-dr24 \
  --task binary \
  --model-family hybrid \
  --backbone inceptiontime \
  --sequence-length 1024 \
  --epochs 40 \
  --batch-size 32 \
  --mixed-precision \
  --augment \
  --loss focal \
  --lr-schedule cosine \
  --ensemble 3 \
  --calibration isotonic \
  --tta-runs 8
```

Run the all-rows weak-label version when Colab disk/time allows:

```bash
python scripts/build_nasa_dr24_dataset.py \
  --label-source predicted \
  --download-lightcurves \
  --sequence-length 1024
```

The raw Kepler light-curve archive is huge. NASA's own bulk-download notes warn that full Kepler light curves approach terabytes, so this builder downloads only the targets needed for selected TCE rows and stores processed folded views.
