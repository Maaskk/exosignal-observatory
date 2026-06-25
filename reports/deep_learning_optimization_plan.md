# ExoSignal Deep Learning Optimization Report

## Objective

Improve the CNN family so it approaches or exceeds the current XGBoost baseline while preserving high recall for exoplanet candidate discovery.

## Baseline Reference

| Model | Task | ROC-AUC | PR-AUC | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|
| XGBoost baseline | PLANET vs NOT_PLANET | 0.951 | 0.914 | 0.813 | 0.921 | 0.864 |
| First CNN baseline | PLANET vs NOT_PLANET | 0.777 | 0.608 | 0.663 | 0.947 | 0.780 |

## Sequence Length Comparison

| Sequence length | Model family | Batch size | Tensor memory MB | ROC-AUC | PR-AUC | Precision | Recall | F1 | Runtime |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 512 | pending | pending | 184.12 | pending | pending | pending | pending | pending | pending |
| 1024 | pending | pending | 368.23 | pending | pending | pending | pending | pending | pending |
| 2048 | pending | pending | 736.47 | pending | pending | pending | pending | pending | pending |

## Model Comparison

| Model family | Task | Loss | Augmentation | Attention | Mixed precision | ROC-AUC | PR-AUC | Precision | Recall | F1 |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|
| Residual CNN | Binary | Focal | Yes | No | Yes | pending | pending | pending | pending | pending |
| Attention CNN | Binary | Focal | Yes | Yes | Yes | pending | pending | pending | pending | pending |
| Hybrid CNN + features | Binary | Focal | Yes | Yes | Yes | pending | pending | pending | pending | pending |
| TCN | Binary | Focal | Yes | No | Yes | pending | pending | pending | pending | pending |
| Hybrid CNN + features | Three-class | Focal | Yes | Yes | Yes | pending | pending | pending | pending | pending |

## Confusion Matrix Summary

### Binary

| Model | TN | FP | FN | TP |
|---|---:|---:|---:|---:|
| XGBoost baseline | 658 | 116 | 43 | 503 |
| First CNN baseline | 906 | 471 | 52 | 928 |
| Best optimized model | pending | pending | pending | pending |

### Three-Class

| Model | FALSE_POSITIVE row | NO_SIGNAL row | PLANET row |
|---|---|---|---|
| Best optimized model | pending | pending | pending |

## Interpretation Notes

- Binary experiments are compared directly to XGBoost because the current XGBoost score is binary.
- Three-class experiments are scientifically richer because they separate false positives from empty/no-signal curves.
- The key target is not raw accuracy. The target is high recall with improved precision and ROC/PR-AUC.
- If longer sequence lengths improve the model, the earlier 256-point interpolation was losing transit information.
