"""Cardiology ECG pipeline: the notebook's preprocessing, window by window.

1. Resampling to the card's rate (scipy.signal.resample_poly, reduced
   fraction), none when the rate already matches.
2. Windows of the card's length (10 s), every 5 s, the last one aligned on
   the end of the signal: a 10 s ECG is one window.
3. Each window as in training: Butterworth band-pass (card: order, cut-offs),
   filtfilt on the time axis, then z-score per lead (eps 1e-8).
4. float32 inference on CPU, one at a time; sigmoid per class, probabilities
   averaged over the windows.

Decision support only: the result holds probabilities, the card's
thresholds and the classes above them, never an urgency nor a course of
action; the decision belongs to the physician.
"""

from __future__ import annotations

import time
from fractions import Fraction

import numpy as np
import torch
from scipy.signal import butter, filtfilt, resample_poly

from .ecg_input import read_ecg
from .ecg_models import ECG_MODEL_ID
from .models import LoadedModel, ModelRegistry
from .pipeline import ModelNotLoaded

# Window step, in seconds (the window's length comes from the card).
WINDOW_STEP_S = 5
# Z-score epsilon of the notebook (normalize_ecg).
ZSCORE_EPS = 1e-8


def resample(signal: np.ndarray, rate: int, target: int) -> np.ndarray:
    if rate == target:
        return signal
    ratio = Fraction(target, rate)
    return resample_poly(signal, ratio.numerator, ratio.denominator, axis=1)


def window_starts(samples: int, window: int, step: int) -> list[int]:
    """Start of each window: every step, the last one ending on the signal's end."""
    if samples < window:
        return []
    starts = list(range(0, samples - window + 1, step))
    if starts[-1] != samples - window:
        starts.append(samples - window)
    return starts


def bandpass(signal: np.ndarray, rate: int, low: float, high: float, order: int) -> np.ndarray:
    nyquist = 0.5 * rate
    b, a = butter(order, [low / nyquist, high / nyquist], btype="band")
    return filtfilt(b, a, signal, axis=-1)


def zscore(signal: np.ndarray) -> np.ndarray:
    mean = signal.mean(axis=1, keepdims=True)
    std = signal.std(axis=1, keepdims=True) + ZSCORE_EPS
    return (signal - mean) / std


def preprocess_window(window: np.ndarray, config: dict) -> np.ndarray:
    band = config["filter"]
    filtered = bandpass(window, config["sampling_rate"], band["low_hz"], band["high_hz"], band["order"])
    return zscore(filtered).astype(np.float32)


def predict(signal: np.ndarray, entry: LoadedModel) -> tuple[dict[str, float], int]:
    """Mean probability per class over the windows of a signal at the card's rate."""
    config = entry.config
    size = config["samples"]
    starts = window_starts(signal.shape[1], size, WINDOW_STEP_S * config["sampling_rate"])
    batch = np.stack([preprocess_window(signal[:, start : start + size], config) for start in starts])
    with entry.lock, torch.inference_mode():
        logits = entry.module(torch.from_numpy(batch))
    probabilities = torch.sigmoid(logits).double().mean(dim=0).tolist()
    return dict(zip(config["classes"], probabilities)), len(starts)


def trace_of(signal: np.ndarray, config: dict) -> dict[str, list[float]]:
    """The first window filtered, not normalized, in mV rounded to the µV: what the interface draws."""
    band = config["filter"]
    first = signal[:, : config["samples"]]
    filtered = bandpass(first, config["sampling_rate"], band["low_hz"], band["high_hz"], band["order"])
    return {lead: np.round(filtered[index], 3).tolist() for index, lead in enumerate(config["leads"])}


def analyze_ecg(data: bytes, sampling_rate, unit, registry: ModelRegistry) -> dict:
    started = time.perf_counter()
    entry = registry.get(ECG_MODEL_ID)
    if not entry.loaded:
        raise ModelNotLoaded()
    config = entry.config

    ecg = read_ecg(data, config["leads"], sampling_rate, unit)
    # At least 10 s (read_ecg): resample_poly rounds up, so at least one
    # full window, never padded.
    signal = resample(ecg.signal, ecg.sampling_rate, config["sampling_rate"])

    probabilities, windows = predict(signal, entry)
    thresholds = dict(config["thresholds"])
    positive = sorted(
        (label for label in config["classes"] if probabilities[label] >= thresholds[label]),
        key=lambda label: probabilities[label],
        reverse=True,
    )

    return {
        "modelId": ECG_MODEL_ID,
        "weightsSha256": entry.weights_sha256,
        "configSha256": entry.config_sha256,
        "probabilities": probabilities,
        "thresholds": thresholds,
        "positive": positive,
        "windows": windows,
        "inputSamplingRate": ecg.sampling_rate,
        "durationSeconds": round(ecg.duration_s, 3),
        "trace": trace_of(signal, config),
        "traceSamplingRate": config["sampling_rate"],
        "durationMs": round((time.perf_counter() - started) * 1000),
    }
