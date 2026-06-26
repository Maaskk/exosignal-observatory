# Final T4 GPU Results — ExoSignal Observatory

## Experiment
- Dataset: NASA Kepler DR24 AstroNet precomputed light-curve views
- Train / validation / test rows: 12589 / 1574 / 1574
- Ensemble size: 3
- Sequence length: 1024
- Decision threshold: 0.320
- Threshold policy: max validation F1 (precision/recall constraints were not both achievable)

## Final untouched test metrics
| Metric | Value |
|---|---:|
| Accuracy | 88.5642% |
| Balanced accuracy | 84.7703% |
| Precision | 73.6842% |
| Recall | 77.7778% |
| F1-score | 75.6757% |
| ROC-AUC | 93.8936% |
| PR-AUC | 76.5678% |

## Confusion matrix
- True negatives: 1114
- False positives: 100
- False negatives: 80
- True positives: 280

Scientific note: this model prioritizes exoplanet candidates and does not confirm planets.
