from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.preprocessing import StandardScaler, label_binarize


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
MODEL_PATH = MODELS_DIR / "deep_lightcurve_cnn.keras"
METRICS_PATH = MODELS_DIR / "deep_model_metrics.json"
CONFIG_PATH = MODELS_DIR / "deep_model_config.json"
COMPARISON_PATH = REPORTS_DIR / "deep_learning_experiment_results.json"
TUNER_RESULT_PATH = REPORTS_DIR / "deep_learning_tuner_result.json"

ARRAY_COLUMNS = ["flux_global", "flux_local", "flux_odd", "flux_even"]
VALID_CLASSES = ["FALSE_POSITIVE", "NO_SIGNAL", "PLANET"]
METADATA_COLUMNS = [
    "period_days",
    "duration_hrs",
    "depth_ppm",
    "planet_radius_earth",
    "teff",
    "logg",
    "radius",
    "mass",
    "metallicity",
    "kepmag",
    "cdpp_3hr",
    "n_planets_in_system",
    "flux_raw_len",
]


@dataclass
class ExperimentConfig:
    task: str
    model_family: str
    sequence_length: int
    array_columns: list[str]
    epochs: int
    batch_size: int
    learning_rate: float
    filters: int
    kernel_size: int
    dropout: float
    dense_units: int
    loss: str
    mixed_precision: bool
    augment: bool
    lr_schedule: str
    tuner: str | None
    max_trials: int
    max_train_rows: int | None
    max_val_rows: int | None
    max_test_rows: int | None
    seed: int


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def bytes_to_float_array(value) -> np.ndarray:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return np.array([], dtype=np.float32)
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, bytearray):
        value = bytes(value)
    if isinstance(value, bytes):
        return np.frombuffer(value, dtype=np.float32)
    if isinstance(value, np.ndarray):
        return value.astype(np.float32, copy=False)
    if isinstance(value, list):
        return np.asarray(value, dtype=np.float32)
    return np.array([], dtype=np.float32)


def robust_sequence(value, length: int) -> np.ndarray:
    arr = bytes_to_float_array(value)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return np.ones(length, dtype=np.float32)
    median = float(np.nanmedian(arr))
    if np.isfinite(median) and abs(median) > 1e-8:
        arr = arr / median
    arr = np.nan_to_num(arr, nan=1.0, posinf=1.0, neginf=1.0)
    arr = np.clip(arr, 0.75, 1.25)
    if arr.size == length:
        return arr.astype(np.float32)
    source_x = np.linspace(0.0, 1.0, arr.size)
    target_x = np.linspace(0.0, 1.0, length)
    return np.interp(target_x, source_x, arr).astype(np.float32)


def augment_sequence(sequence: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    augmented = sequence.copy()
    max_shift = max(1, augmented.shape[0] // 32)
    shift = int(rng.integers(-max_shift, max_shift + 1))
    augmented = np.roll(augmented, shift=shift, axis=0)
    augmented += rng.normal(0.0, 0.0015, size=augmented.shape).astype(np.float32)
    augmented *= float(rng.uniform(0.995, 1.005))
    return np.clip(augmented, 0.75, 1.25).astype(np.float32)


def frame_to_tensor(
    df: pd.DataFrame,
    sequence_length: int,
    array_columns: list[str],
    augment: bool = False,
    seed: int = 21,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    tensors = []
    for _, row in df.iterrows():
        channels = [robust_sequence(row.get(col), sequence_length) for col in array_columns]
        tensor = np.stack(channels, axis=-1)
        if augment:
            tensor = augment_sequence(tensor, rng)
        tensors.append(tensor)
    return np.asarray(tensors, dtype=np.float32)


def array_stats(arr: np.ndarray, prefix: str) -> dict[str, float]:
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {
            f"{prefix}_mean": 0.0,
            f"{prefix}_std": 0.0,
            f"{prefix}_min": 0.0,
            f"{prefix}_q01": 0.0,
            f"{prefix}_q05": 0.0,
            f"{prefix}_q50": 0.0,
            f"{prefix}_depth": 0.0,
        }
    q01, q05, q50 = np.nanpercentile(arr, [1, 5, 50])
    return {
        f"{prefix}_mean": float(np.nanmean(arr)),
        f"{prefix}_std": float(np.nanstd(arr)),
        f"{prefix}_min": float(np.nanmin(arr)),
        f"{prefix}_q01": float(q01),
        f"{prefix}_q05": float(q05),
        f"{prefix}_q50": float(q50),
        f"{prefix}_depth": float(max(0.0, q50 - np.nanmin(arr))),
    }


def build_engineered_frame(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, row in df.iterrows():
        features = {col: row.get(col, np.nan) for col in METADATA_COLUMNS}
        features["has_transit_params"] = float(bool(row.get("has_transit_params", False)))
        features["mission_kepler"] = 1.0 if row.get("mission") == "kepler" else 0.0
        features["mission_tess"] = 1.0 if row.get("mission") == "tess" else 0.0
        features["mission_k2"] = 1.0 if row.get("mission") == "k2" else 0.0
        for col in ARRAY_COLUMNS:
            features.update(array_stats(bytes_to_float_array(row.get(col)), col))
        features["odd_even_depth_delta"] = abs(features.get("flux_odd_depth", 0.0) - features.get("flux_even_depth", 0.0))
        rows.append(features)
    return pd.DataFrame(rows).replace([np.inf, -np.inf], np.nan)


def fit_feature_matrix(train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame):
    train_features = build_engineered_frame(train_df)
    val_features = build_engineered_frame(val_df)
    test_features = build_engineered_frame(test_df)
    columns = train_features.columns.tolist()
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()
    x_train = scaler.fit_transform(imputer.fit_transform(train_features)).astype(np.float32)
    x_val = scaler.transform(imputer.transform(val_features)).astype(np.float32)
    x_test = scaler.transform(imputer.transform(test_features)).astype(np.float32)
    return x_train, x_val, x_test, columns


def load_split(name: str, max_rows: int | None, seed: int) -> pd.DataFrame:
    path = DATA_DIR / f"{name}.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run npm run download:data:full first.")
    df = pd.read_parquet(path)
    df = df[df["disposition"].isin(VALID_CLASSES)].copy()
    if max_rows and max_rows < len(df):
        df = df.sample(n=max_rows, random_state=seed)
    return df.reset_index(drop=True)


def build_labels(df: pd.DataFrame, task: str):
    labels = df["disposition"].astype(str).str.upper()
    if task == "binary":
        return (labels == "PLANET").astype("float32").to_numpy(), ["not_planet", "planet"]
    class_to_index = {name: index for index, name in enumerate(VALID_CLASSES)}
    return labels.map(class_to_index).astype("int64").to_numpy(), VALID_CLASSES


def class_weights(y: np.ndarray, task: str) -> dict[int, float]:
    if task == "binary":
        counts = np.bincount(y.astype(int), minlength=2).astype(float)
    else:
        counts = np.bincount(y.astype(int), minlength=len(VALID_CLASSES)).astype(float)
    total = float(counts.sum())
    return {index: total / (len(counts) * max(count, 1.0)) for index, count in enumerate(counts)}


def estimate_tensor_memory_mb(rows: int, sequence_length: int, channels: int, copies: int = 3) -> float:
    return round(rows * sequence_length * channels * np.dtype(np.float32).itemsize * copies / 1024 / 1024, 2)


def require_tensorflow(mixed_precision: bool = False):
    try:
        import tensorflow as tf
        from tensorflow import keras
        from tensorflow.keras import layers
    except Exception as exc:
        raise SystemExit(
            "TensorFlow is not installed in this environment. "
            "Run this script in Google Colab or install tensorflow first."
        ) from exc
    if mixed_precision:
        try:
            tf.keras.mixed_precision.set_global_policy("mixed_float16")
            print("mixed precision enabled:", tf.keras.mixed_precision.global_policy())
        except Exception as exc:
            print("mixed precision requested but not enabled:", exc)
    return tf, keras, layers


def focal_loss(task: str, gamma: float = 2.0, alpha: float = 0.25):
    tf, _, _ = require_tensorflow(False)

    def binary_loss(y_true, y_pred):
        y_true_float = tf.reshape(tf.cast(y_true, tf.float32), [-1, 1])
        y_pred_clipped = tf.clip_by_value(tf.cast(y_pred, tf.float32), 1e-7, 1.0 - 1e-7)
        bce = -(y_true_float * tf.math.log(y_pred_clipped) + (1.0 - y_true_float) * tf.math.log(1.0 - y_pred_clipped))
        p_t = y_true_float * y_pred_clipped + (1.0 - y_true_float) * (1.0 - y_pred_clipped)
        alpha_factor = y_true_float * alpha + (1.0 - y_true_float) * (1.0 - alpha)
        return tf.reduce_mean(alpha_factor * tf.pow(1.0 - p_t, gamma) * bce)

    def categorical_loss(y_true, y_pred):
        y_true_flat = tf.reshape(tf.cast(y_true, tf.int32), [-1])
        y_true_one_hot = tf.one_hot(y_true_flat, depth=len(VALID_CLASSES))
        y_pred_clipped = tf.clip_by_value(tf.cast(y_pred, tf.float32), 1e-7, 1.0 - 1e-7)
        ce = -y_true_one_hot * tf.math.log(y_pred_clipped)
        focal = tf.pow(1.0 - y_pred_clipped, gamma) * ce
        return tf.reduce_mean(tf.reduce_sum(focal, axis=-1))

    return binary_loss if task == "binary" else categorical_loss


def residual_block(x, layers, filters: int, kernel_size: int, dropout: float, dilation_rate: int = 1):
    shortcut = x
    y = layers.Conv1D(filters, kernel_size, padding="same", dilation_rate=dilation_rate, use_bias=False)(x)
    y = layers.BatchNormalization()(y)
    y = layers.Activation("relu")(y)
    y = layers.Dropout(dropout)(y)
    y = layers.Conv1D(filters, kernel_size, padding="same", dilation_rate=dilation_rate, use_bias=False)(y)
    y = layers.BatchNormalization()(y)
    if shortcut.shape[-1] != filters:
        shortcut = layers.Conv1D(filters, 1, padding="same", use_bias=False)(shortcut)
    y = layers.Add()([shortcut, y])
    return layers.Activation("relu")(y)


def output_layer(x, layers, task: str):
    if task == "binary":
        return layers.Dense(1, activation="sigmoid", dtype="float32", name="candidate_probability")(x)
    return layers.Dense(len(VALID_CLASSES), activation="softmax", dtype="float32", name="class_probability")(x)


def compile_model(model, keras, config: ExperimentConfig, steps_per_epoch: int):
    if config.lr_schedule == "cosine":
        learning_rate = keras.optimizers.schedules.CosineDecayRestarts(
            initial_learning_rate=config.learning_rate,
            first_decay_steps=max(steps_per_epoch * 4, 1),
            t_mul=2.0,
            m_mul=0.75,
            alpha=1e-2,
        )
    else:
        learning_rate = config.learning_rate
    optimizer = keras.optimizers.Adam(learning_rate=learning_rate)
    if config.loss == "focal":
        loss = focal_loss(config.task)
    elif config.task == "binary":
        loss = "binary_crossentropy"
    else:
        loss = "sparse_categorical_crossentropy"
    metrics = [
        keras.metrics.BinaryAccuracy(name="accuracy") if config.task == "binary" else keras.metrics.SparseCategoricalAccuracy(name="accuracy"),
    ]
    if config.task == "binary":
        metrics.extend([keras.metrics.AUC(name="roc_auc"), keras.metrics.AUC(curve="PR", name="pr_auc")])
    model.compile(optimizer=optimizer, loss=loss, metrics=metrics)
    return model


def build_sequence_model(config: ExperimentConfig, feature_count: int | None = None):
    tf, keras, layers = require_tensorflow(config.mixed_precision)
    tf.keras.utils.set_random_seed(config.seed)
    sequence_input = keras.Input(shape=(config.sequence_length, len(config.array_columns)), name="folded_light_curve")
    x = layers.Conv1D(config.filters, config.kernel_size, padding="same", use_bias=False)(sequence_input)
    x = layers.BatchNormalization()(x)
    x = layers.Activation("relu")(x)

    if config.model_family == "tcn":
        for dilation in [1, 2, 4, 8]:
            x = residual_block(x, layers, config.filters, config.kernel_size, config.dropout, dilation_rate=dilation)
    else:
        x = residual_block(x, layers, config.filters, config.kernel_size, config.dropout)
        x = layers.MaxPooling1D(2)(x)
        x = residual_block(x, layers, config.filters * 2, max(3, config.kernel_size - 2), config.dropout)
        x = layers.MaxPooling1D(2)(x)
        x = residual_block(x, layers, config.filters * 4, 3, config.dropout)

    if config.model_family == "attention":
        attention = layers.MultiHeadAttention(num_heads=4, key_dim=max(8, config.filters // 2), dropout=config.dropout)(x, x)
        x = layers.Add()([x, attention])
        x = layers.LayerNormalization()(x)

    x = layers.GlobalAveragePooling1D()(x)
    x = layers.Dense(config.dense_units, activation="relu")(x)
    x = layers.Dropout(config.dropout)(x)
    outputs = output_layer(x, layers, config.task)
    model = keras.Model(sequence_input, outputs, name=f"exosignal_{config.model_family}_{config.task}")
    return compile_model(model, keras, config, steps_per_epoch=1), keras


def build_hybrid_model(config: ExperimentConfig, feature_count: int):
    tf, keras, layers = require_tensorflow(config.mixed_precision)
    tf.keras.utils.set_random_seed(config.seed)
    sequence_input = keras.Input(shape=(config.sequence_length, len(config.array_columns)), name="folded_light_curve")
    features_input = keras.Input(shape=(feature_count,), name="engineered_features")

    x = layers.Conv1D(config.filters, config.kernel_size, padding="same", use_bias=False)(sequence_input)
    x = layers.BatchNormalization()(x)
    x = layers.Activation("relu")(x)
    x = residual_block(x, layers, config.filters, config.kernel_size, config.dropout)
    x = layers.MaxPooling1D(2)(x)
    x = residual_block(x, layers, config.filters * 2, 5, config.dropout)
    attention = layers.MultiHeadAttention(num_heads=4, key_dim=max(8, config.filters // 2), dropout=config.dropout)(x, x)
    x = layers.Add()([x, attention])
    x = layers.LayerNormalization()(x)
    x = layers.GlobalAveragePooling1D()(x)

    f = layers.Dense(config.dense_units, activation="relu")(features_input)
    f = layers.BatchNormalization()(f)
    f = layers.Dropout(config.dropout)(f)
    f = layers.Dense(max(32, config.dense_units // 2), activation="relu")(f)

    joined = layers.Concatenate()([x, f])
    joined = layers.Dense(config.dense_units, activation="relu")(joined)
    joined = layers.Dropout(config.dropout)(joined)
    outputs = output_layer(joined, layers, config.task)
    model = keras.Model([sequence_input, features_input], outputs, name=f"exosignal_hybrid_{config.task}")
    return compile_model(model, keras, config, steps_per_epoch=1), keras


def best_threshold(y_true: np.ndarray, probabilities: np.ndarray) -> tuple[float, float]:
    best_score = -1.0
    best_cutoff = 0.5
    for threshold in np.linspace(0.10, 0.90, 161):
        score = f1_score(y_true, probabilities >= threshold, zero_division=0)
        if score > best_score:
            best_score = float(score)
            best_cutoff = float(threshold)
    return best_cutoff, best_score


def evaluate_binary(y_true: np.ndarray, probabilities: np.ndarray, threshold: float, validation_f1: float) -> dict:
    predictions = (probabilities >= threshold).astype(int)
    return {
        "threshold": float(threshold),
        "validation_best_f1": float(validation_f1),
        "precision": float(precision_score(y_true, predictions, zero_division=0)),
        "recall": float(recall_score(y_true, predictions, zero_division=0)),
        "f1": float(f1_score(y_true, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "pr_auc": float(average_precision_score(y_true, probabilities)),
        "confusion_matrix": {
            "labels": ["not_planet", "planet"],
            "values": confusion_matrix(y_true, predictions).tolist(),
        },
    }


def evaluate_multiclass(y_true: np.ndarray, probabilities: np.ndarray, class_labels: list[str]) -> dict:
    predictions = np.argmax(probabilities, axis=1)
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, predictions, average="macro", zero_division=0)
    y_binary = label_binarize(y_true, classes=list(range(len(class_labels))))
    pr_scores = []
    for index in range(len(class_labels)):
        pr_scores.append(average_precision_score(y_binary[:, index], probabilities[:, index]))
    return {
        "precision_macro": float(precision),
        "recall_macro": float(recall),
        "f1_macro": float(f1),
        "roc_auc_ovr": float(roc_auc_score(y_true, probabilities, multi_class="ovr")),
        "pr_auc_macro": float(np.mean(pr_scores)),
        "confusion_matrix": {
            "labels": class_labels,
            "values": confusion_matrix(y_true, predictions, labels=list(range(len(class_labels)))).tolist(),
        },
    }


def callbacks(keras, config: ExperimentConfig, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    monitor = "val_pr_auc" if config.task == "binary" else "val_accuracy"
    callback_list = [
        keras.callbacks.EarlyStopping(monitor=monitor, mode="max", patience=7, restore_best_weights=True),
        keras.callbacks.ModelCheckpoint(
            output_dir / "best_model.keras",
            monitor=monitor,
            mode="max",
            save_best_only=True,
        ),
    ]
    if config.lr_schedule == "plateau":
        callback_list.append(
            keras.callbacks.ReduceLROnPlateau(monitor=monitor, mode="max", patience=3, factor=0.45, min_lr=1e-6)
        )
    return callback_list


def train_once(config: ExperimentConfig) -> dict:
    start = time.time()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    train_df = load_split("train", config.max_train_rows, config.seed)
    val_df = load_split("val", config.max_val_rows, config.seed + 1)
    test_df = load_split("test", config.max_test_rows, config.seed + 2)

    x_train_seq = frame_to_tensor(train_df, config.sequence_length, config.array_columns, augment=config.augment, seed=config.seed)
    x_val_seq = frame_to_tensor(val_df, config.sequence_length, config.array_columns)
    x_test_seq = frame_to_tensor(test_df, config.sequence_length, config.array_columns)
    x_train_features, x_val_features, x_test_features, feature_columns = fit_feature_matrix(train_df, val_df, test_df)
    y_train, class_labels = build_labels(train_df, config.task)
    y_val, _ = build_labels(val_df, config.task)
    y_test, _ = build_labels(test_df, config.task)

    if config.model_family == "hybrid":
        model, keras = build_hybrid_model(config, feature_count=x_train_features.shape[1])
        train_inputs = [x_train_seq, x_train_features]
        val_inputs = [x_val_seq, x_val_features]
        test_inputs = [x_test_seq, x_test_features]
    else:
        model, keras = build_sequence_model(config, feature_count=x_train_features.shape[1])
        train_inputs = x_train_seq
        val_inputs = x_val_seq
        test_inputs = x_test_seq

    experiment_dir = MODELS_DIR / "experiments" / f"{config.task}_{config.model_family}_{config.sequence_length}_{int(time.time())}"
    history = model.fit(
        train_inputs,
        y_train,
        validation_data=(val_inputs, y_val),
        epochs=config.epochs,
        batch_size=config.batch_size,
        class_weight=class_weights(y_train, config.task),
        callbacks=callbacks(keras, config, experiment_dir),
        verbose=2,
    )

    val_probabilities = model.predict(val_inputs, batch_size=config.batch_size, verbose=0)
    test_probabilities = model.predict(test_inputs, batch_size=config.batch_size, verbose=0)
    if config.task == "binary":
        val_probabilities = val_probabilities.ravel()
        test_probabilities = test_probabilities.ravel()
        threshold, validation_f1 = best_threshold(y_val, val_probabilities)
        metrics = evaluate_binary(y_test, test_probabilities, threshold, validation_f1)
    else:
        metrics = evaluate_multiclass(y_test, test_probabilities, class_labels)

    model.save(MODEL_PATH)
    metrics.update(
        {
            "model_name": f"{config.model_family} deep light-curve model",
            "task": config.task,
            "model_family": config.model_family,
            "training_rows": int(len(train_df)),
            "validation_rows": int(len(val_df)),
            "test_rows": int(len(test_df)),
            "sequence_length": int(config.sequence_length),
            "input_channels": config.array_columns,
            "engineered_feature_count": int(len(feature_columns)),
            "estimated_tensor_memory_mb": estimate_tensor_memory_mb(len(train_df) + len(val_df) + len(test_df), config.sequence_length, len(config.array_columns), copies=1),
            "elapsed_seconds": round(time.time() - start, 2),
            "history": {key: [float(x) for x in values] for key, values in history.history.items()},
            "config": asdict(config),
        }
    )
    model_config = {
        "model_type": f"keras_{config.model_family}",
        "model_path": str(MODEL_PATH.relative_to(ROOT)),
        "task": config.task,
        "class_labels": class_labels,
        "sequence_length": int(config.sequence_length),
        "array_columns": config.array_columns,
        "input_channels": len(config.array_columns),
        "engineered_feature_columns": feature_columns,
        "normalization": "median-normalized, clipped to [0.75, 1.25], interpolated",
        "threshold": metrics.get("threshold"),
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    CONFIG_PATH.write_text(json.dumps(model_config, indent=2))
    update_comparison(metrics)
    print(json.dumps(metrics, indent=2))
    return metrics


def update_comparison(metrics: dict) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    if COMPARISON_PATH.exists():
        rows = json.loads(COMPARISON_PATH.read_text())
    rows.append(metrics)
    COMPARISON_PATH.write_text(json.dumps(rows, indent=2))


def tuner_search(config: ExperimentConfig) -> dict:
    try:
        import keras_tuner as kt
    except Exception as exc:
        raise SystemExit("KerasTuner is not installed. Run: pip install keras-tuner") from exc
    tf, keras, layers = require_tensorflow(config.mixed_precision)
    train_df = load_split("train", config.max_train_rows, config.seed)
    val_df = load_split("val", config.max_val_rows, config.seed + 1)
    x_train_seq = frame_to_tensor(train_df, config.sequence_length, config.array_columns, augment=config.augment, seed=config.seed)
    x_val_seq = frame_to_tensor(val_df, config.sequence_length, config.array_columns)
    x_train_features, x_val_features, _, feature_columns = fit_feature_matrix(train_df, val_df, val_df)
    y_train, _ = build_labels(train_df, config.task)
    y_val, _ = build_labels(val_df, config.task)

    def model_builder(hp):
        tuned = ExperimentConfig(
            **{
                **asdict(config),
                "filters": hp.Choice("filters", [32, 64, 128, 256]),
                "kernel_size": hp.Choice("kernel_size", [3, 5, 7, 11]),
                "dropout": hp.Choice("dropout", [0.2, 0.3, 0.4, 0.5]),
                "learning_rate": hp.Choice("learning_rate", [1e-2, 1e-3, 5e-4, 1e-4]),
                "dense_units": hp.Choice("dense_units", [64, 96, 128, 192]),
            }
        )
        if tuned.model_family == "hybrid":
            model, _ = build_hybrid_model(tuned, x_train_features.shape[1])
        else:
            model, _ = build_sequence_model(tuned, x_train_features.shape[1])
        return model

    objective = "val_pr_auc" if config.task == "binary" else "val_accuracy"
    tuner_cls = kt.BayesianOptimization if config.tuner == "bayesian" else kt.RandomSearch
    train_inputs = [x_train_seq, x_train_features] if config.model_family == "hybrid" else x_train_seq
    val_inputs = [x_val_seq, x_val_features] if config.model_family == "hybrid" else x_val_seq
    batch_candidates = [16, 32, 64]
    searches = []
    for batch_size in batch_candidates:
        tuner = tuner_cls(
            model_builder,
            objective=kt.Objective(objective, direction="max"),
            max_trials=max(1, math.ceil(config.max_trials / len(batch_candidates))),
            directory=MODELS_DIR / "tuner",
            project_name=f"{config.task}_{config.model_family}_{config.sequence_length}_bs{batch_size}",
            overwrite=False,
        )
        tuner.search(
            train_inputs,
            y_train,
            validation_data=(val_inputs, y_val),
            epochs=config.epochs,
            batch_size=batch_size,
            class_weight=class_weights(y_train, config.task),
            callbacks=callbacks(keras, ExperimentConfig(**{**asdict(config), "batch_size": batch_size}), MODELS_DIR / "tuner" / "checkpoints"),
            verbose=2,
        )
        best_trial = tuner.oracle.get_best_trials(1)[0]
        best_hp = tuner.get_best_hyperparameters(1)[0]
        searches.append(
            {
                "batch_size": batch_size,
                "score": float(best_trial.score) if best_trial.score is not None else None,
                "hyperparameters": best_hp.values,
            }
        )
    searches.sort(key=lambda item: item["score"] if item["score"] is not None else -float("inf"), reverse=True)
    best_search = searches[0]
    result = {
        "task": config.task,
        "model_family": config.model_family,
        "sequence_length": config.sequence_length,
        "best_batch_size": best_search["batch_size"],
        "best_hyperparameters": best_search["hyperparameters"],
        "batch_size_searches": searches,
        "feature_count": len(feature_columns),
    }
    TUNER_RESULT_PATH.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return result


def config_from_tuner_result(base_config: ExperimentConfig, result: dict) -> ExperimentConfig:
    hp = result.get("best_hyperparameters") or {}
    return ExperimentConfig(
        **{
            **asdict(base_config),
            "task": result.get("task", base_config.task),
            "model_family": result.get("model_family", base_config.model_family),
            "sequence_length": int(result.get("sequence_length", base_config.sequence_length)),
            "batch_size": int(result.get("best_batch_size", base_config.batch_size)),
            "filters": int(hp.get("filters", base_config.filters)),
            "kernel_size": int(hp.get("kernel_size", base_config.kernel_size)),
            "dropout": float(hp.get("dropout", base_config.dropout)),
            "learning_rate": float(hp.get("learning_rate", base_config.learning_rate)),
            "dense_units": int(hp.get("dense_units", base_config.dense_units)),
            "tuner": None,
        }
    )


def train_from_tuner_result(base_config: ExperimentConfig, result_path: Path) -> dict:
    if not result_path.exists():
        raise SystemExit(f"Missing tuner result file: {result_path}")
    result = json.loads(result_path.read_text())
    tuned_config = config_from_tuner_result(base_config, result)
    print("training best tuned configuration")
    print(json.dumps(asdict(tuned_config), indent=2))
    return train_once(tuned_config)


def sequence_sweep(config: ExperimentConfig, lengths: list[int]) -> list[dict]:
    results = []
    for length in lengths:
        run_config = ExperimentConfig(**{**asdict(config), "sequence_length": int(length)})
        print(f"running sequence length {length}")
        results.append(train_once(run_config))
    return results


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run ExoSignal deep-learning experiments on Kepler/K2/TESS light curves.")
    parser.add_argument("--task", choices=["binary", "multiclass"], default="binary")
    parser.add_argument("--model-family", choices=["residual", "attention", "tcn", "hybrid"], default="hybrid")
    parser.add_argument("--sequence-length", type=int, default=1024)
    parser.add_argument("--sweep-sequence-lengths", type=parse_csv, default=None)
    parser.add_argument("--array-columns", type=parse_csv, default=ARRAY_COLUMNS)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--filters", type=int, choices=[32, 64, 128, 256], default=64)
    parser.add_argument("--kernel-size", type=int, choices=[3, 5, 7, 11], default=7)
    parser.add_argument("--dropout", type=float, choices=[0.2, 0.3, 0.4, 0.5], default=0.3)
    parser.add_argument("--dense-units", type=int, default=128)
    parser.add_argument("--loss", choices=["crossentropy", "focal"], default="focal")
    parser.add_argument("--mixed-precision", action="store_true")
    parser.add_argument("--augment", action="store_true")
    parser.add_argument("--lr-schedule", choices=["plateau", "cosine"], default="cosine")
    parser.add_argument("--tune", action="store_true")
    parser.add_argument("--tune-and-train-best", action="store_true")
    parser.add_argument(
        "--train-from-tuner-result",
        default=None,
        help="Train/evaluate the best config stored in reports/deep_learning_tuner_result.json or a provided path.",
    )
    parser.add_argument("--tuner", choices=["random", "bayesian"], default="random")
    parser.add_argument("--max-trials", type=int, default=20)
    parser.add_argument("--max-train-rows", type=int, default=None)
    parser.add_argument("--max-val-rows", type=int, default=None)
    parser.add_argument("--max-test-rows", type=int, default=None)
    parser.add_argument("--smoke", action="store_true", help="Run a tiny configuration for Colab/runtime validation.")
    parser.add_argument("--seed", type=int, default=21)
    parser.add_argument("--print-memory-plan", action="store_true")
    return parser.parse_args(argv)


def config_from_args(args: argparse.Namespace) -> ExperimentConfig:
    if args.smoke:
        args.epochs = min(args.epochs, 2)
        args.batch_size = min(args.batch_size, 16)
        args.max_train_rows = args.max_train_rows or 512
        args.max_val_rows = args.max_val_rows or 256
        args.max_test_rows = args.max_test_rows or 256
        args.sequence_length = min(args.sequence_length, 512)
    return ExperimentConfig(
        task=args.task,
        model_family=args.model_family,
        sequence_length=args.sequence_length,
        array_columns=list(args.array_columns),
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        filters=args.filters,
        kernel_size=args.kernel_size,
        dropout=args.dropout,
        dense_units=args.dense_units,
        loss=args.loss,
        mixed_precision=args.mixed_precision,
        augment=args.augment,
        lr_schedule=args.lr_schedule,
        tuner=args.tuner if args.tune else None,
        max_trials=args.max_trials,
        max_train_rows=args.max_train_rows,
        max_val_rows=args.max_val_rows,
        max_test_rows=args.max_test_rows,
        seed=args.seed,
    )


def print_memory_plan(lengths: list[int], channels: int) -> None:
    rows = {"train": 18853, "val": 2357, "test": 2357}
    plan = []
    for length in lengths:
        plan.append(
            {
                "sequence_length": int(length),
                "train_tensor_mb": estimate_tensor_memory_mb(rows["train"], length, channels, copies=1),
                "val_tensor_mb": estimate_tensor_memory_mb(rows["val"], length, channels, copies=1),
                "test_tensor_mb": estimate_tensor_memory_mb(rows["test"], length, channels, copies=1),
                "all_tensors_mb": estimate_tensor_memory_mb(sum(rows.values()), length, channels, copies=1),
            }
        )
    print(json.dumps(plan, indent=2))


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    lengths = [int(x) for x in args.sweep_sequence_lengths] if args.sweep_sequence_lengths else [args.sequence_length]
    if args.print_memory_plan:
        print_memory_plan(lengths, len(args.array_columns))
        return 0
    config = config_from_args(args)
    if args.train_from_tuner_result:
        result_path = Path(args.train_from_tuner_result)
        if not result_path.is_absolute():
            result_path = ROOT / result_path
        train_from_tuner_result(config, result_path)
    elif args.tune:
        result = tuner_search(config)
        if args.tune_and_train_best:
            tuned_config = config_from_tuner_result(config, result)
            print("training best tuned configuration")
            print(json.dumps(asdict(tuned_config), indent=2))
            train_once(tuned_config)
    elif args.sweep_sequence_lengths:
        sequence_sweep(config, lengths)
    else:
        train_once(config)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
