# ExoSignal Deep Learning Optimization Report

## Objective

Improve the weak first CNN so it approaches the XGBoost baseline while preserving high recall for exoplanet candidate discovery.

The model is still a candidate-prioritization model. It does not confirm exoplanets officially; it ranks light curves for follow-up analysis.

## Dataset

| Item | Value |
|---|---:|
| Source missions | Kepler, K2, TESS |
| Cleaned samples | 23,567 |
| Training rows | 18,853 |
| Validation rows | 2,357 |
| Test rows | 2,357 |
| Light-curve channels | flux_global, flux_local, flux_odd, flux_even |
| Engineered features | 46 |
| Final sequence length | 1,024 |
| Final runtime | Google Colab T4 GPU |

## Baseline Reference

| Model | Task | ROC-AUC | PR-AUC | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| XGBoost baseline | PLANET vs NOT_PLANET | 0.951 | 0.914 | 0.813 | 0.921 | 0.864 |
| First CNN baseline | PLANET vs NOT_PLANET | 0.777 | 0.608 | 0.663 | 0.947 | 0.780 |
| Final tuned hybrid CNN | PLANET vs NOT_PLANET | 0.944 | 0.913 | 0.776 | 0.913 | 0.839 |

## Sequence Length Comparison

| Sequence length | Training rows | Tensor memory MB | ROC-AUC | PR-AUC | F1 | Runtime |
|---:|---:|---:|---:|---:|---:|---:|
| 512 | 18,853 | 184.12 | 0.931 | 0.887 | 0.827 | 147.33 s |
| 1,024 | 18,853 | 368.23 | 0.935 | 0.896 | 0.827 | Colab sweep |
| 2,048 | 18,853 | 736.47 | 0.937 | Colab JSON | 0.827 | Colab sweep |
| 1,024 tuned | 18,853 | 368.23 | 0.944 | 0.913 | 0.839 | final run |

The 1,024-point sequence is the best practical choice from the current experiments. It improves ROC-AUC and PR-AUC without the extra memory cost of 2,048.

## Final Tuned Model

| Setting | Value |
|---|---|
| Architecture | Hybrid residual CNN + engineered-feature dense branch |
| Task | Binary classification |
| Classes | not_planet, planet |
| Sequence length | 1,024 |
| Channels | flux_global, flux_local, flux_odd, flux_even |
| Engineered features | 46 |
| Filters | 32 |
| Kernel size | 11 |
| Dense units | 192 |
| Dropout | 0.20 |
| Batch size | 64 |
| Learning rate | 0.01 |
| Loss | Focal loss |
| Schedule | Cosine decay |
| Augmentation | Time shift, noise injection, flux scaling |
| Mixed precision | Enabled |

## Final Test Results

| Metric | Value |
|---|---:|
| Threshold | 0.380 |
| ROC-AUC | 0.944019 |
| PR-AUC | 0.912560 |
| Precision | 0.775563 |
| Recall | 0.913265 |
| F1-score | 0.838800 |

## Confusion Matrix

| Actual \ Predicted | not_planet | planet |
|---|---:|---:|
| not_planet | 1,118 | 259 |
| planet | 85 | 895 |

Interpretation:

- True planets found: 895
- Missed planets: 85
- False alarms: 259
- Correct rejections: 1,118

The tuned deep model is scientifically useful because recall remains high: it finds about 91.3% of true planet examples in the test set. XGBoost remains stronger on F1, so the production recommendation is to keep XGBoost as the active baseline and present the deep model as an optimized research branch.

## Tuner Result

KerasTuner selected:

| Hyperparameter | Best value |
|---|---:|
| Batch size | 64 |
| Filters | 32 |
| Kernel size | 11 |
| Dropout | 0.20 |
| Learning rate | 0.01 |
| Dense units | 192 |
| Best validation PR-AUC | 0.908440 |

Batch-size search:

| Batch size | Validation PR-AUC |
|---:|---:|
| 64 | 0.908440 |
| 32 | 0.907849 |
| 16 | 0.895967 |

## Other Experiments

| Model | Task | ROC-AUC | PR-AUC | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| TCN | Binary | 0.860 | -- | -- | -- | 0.781 |
| Attention hybrid | Three-class | 0.880 | 0.754 | 0.850 macro | 0.716 macro | 0.692 macro |

The three-class model is scientifically richer because it separates PLANET, FALSE_POSITIVE, and NO_SIGNAL, but it needs more optimization before it should replace binary candidate ranking.

## Final Recommendation

Use this stack for the current project defense:

1. XGBoost or Random Forest remains the active production-style baseline because it has the best F1 and ROC-AUC.
2. The tuned hybrid CNN is the deep-learning research branch and proves that the CNN was improved from ROC-AUC 0.777 to 0.944.
3. The website should describe the score as candidate probability, not official confirmation.
4. The next scientific upgrade is an ensemble: XGBoost engineered features + hybrid CNN light-curve representation + calibrated probability threshold.
