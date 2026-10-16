"""Pathology models as trained (TensorFlow 2.20.0 / Keras 3.13.2, see README).

Loaded with keras.saving.load_model(path, compile=False, safe_mode=True) only.
A file that does not load, a model whose input or output differs from what
the pipeline feeds and reads, or (BreakHis) inference settings that differ
from the ones it was validated with, leave the model not loaded, with its
error: never a degraded load.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path

# Keras 3 picks its backend when imported: TensorFlow, as in training.
os.environ["KERAS_BACKEND"] = "tensorflow"

import keras  # noqa: E402
import tensorflow as tf  # noqa: E402

from .models import LoadedModel, sha256_of  # noqa: E402

logger = logging.getLogger(__name__)

BREAST_CLASSIFIER_ID = "pathology-breakhis-classification"
NUCLEI_SEGMENTER_ID = "pathology-unet-pannuke-segmentation"

# Output index order of the PanNuke segmenter (training label order).
NUCLEI_CLASSES = ("background", "neoplastic", "inflammatory", "connective", "dead", "epithelial")

# breakhis_inference_config.json (inference_config.json of the BreakHis
# notebook, notebooks/breakhis-classification-efficientnetb0.ipynb, renamed):
# the threshold is read from it, and must be the one calibrated on validation
# for "Phase 2 + TTA".
BREAKHIS_CONFIG_FILE = "breakhis_inference_config.json"
BREAKHIS_EXPECTED_THRESHOLD = 0.13
BREAKHIS_POSITIVE_CLASS = "malignant"


@dataclass(frozen=True)
class PathologySpec:
    model_id: str
    file_name: str
    # Input (None, size, size, 3) and output shape the pipeline relies on.
    input_size: int
    output_shape: tuple
    config_file: str | None = None


PATHOLOGY_SPECS = (
    PathologySpec(BREAST_CLASSIFIER_ID, "EfficientNetB0_BreakHis_phase2.keras", 224, (None, 1), BREAKHIS_CONFIG_FILE),
    PathologySpec(NUCLEI_SEGMENTER_ID, "pannuke_unet_efficientnetb0_phase2_best.keras", 256, (None, 256, 256, len(NUCLEI_CLASSES))),
)


class InvalidModelConfig(Exception):
    """The inference settings next to the weights are not the validated ones."""


def read_breakhis_config(path: Path) -> dict:
    """{"threshold": 0.13} from breakhis_inference_config.json; InvalidModelConfig otherwise."""
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise InvalidModelConfig(f"unreadable: {error}") from error
    if not isinstance(config, dict):
        raise InvalidModelConfig("not a JSON object")

    threshold = config.get("decision_threshold")
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or threshold != BREAKHIS_EXPECTED_THRESHOLD:
        raise InvalidModelConfig(f"decision_threshold is {threshold!r}, expected {BREAKHIS_EXPECTED_THRESHOLD}")
    if config.get("positive_class") != BREAKHIS_POSITIVE_CLASS:
        raise InvalidModelConfig(f"positive_class is {config.get('positive_class')!r}, expected {BREAKHIS_POSITIVE_CLASS!r}")
    return {"threshold": float(threshold)}


_threads_lock = threading.Lock()
_threads_configured = False


def configure_tensorflow_threads(intra_op: int, inter_op: int) -> None:
    """Caps TensorFlow's thread pools, leaving CPU to PyTorch.

    Only possible before TensorFlow runs its first operation: a later call
    (another app in the same process, as in the tests) logs the pools in use.
    """
    global _threads_configured
    with _threads_lock:
        if _threads_configured:
            return
        _threads_configured = True
        try:
            tf.config.threading.set_intra_op_parallelism_threads(intra_op)
            tf.config.threading.set_inter_op_parallelism_threads(inter_op)
        except RuntimeError:
            logger.warning("TensorFlow already started: its thread pools could not be capped.")
        logger.info(
            "TensorFlow threads: intra-op %s, inter-op %s.",
            tf.config.threading.get_intra_op_parallelism_threads(),
            tf.config.threading.get_inter_op_parallelism_threads(),
        )


def _check_shapes(model, spec: PathologySpec) -> None:
    expected_input = (None, spec.input_size, spec.input_size, 3)
    if tuple(model.input_shape) != expected_input:
        raise ValueError(f"input shape {model.input_shape}, expected {expected_input}")
    if tuple(model.output_shape) != spec.output_shape:
        raise ValueError(f"output shape {model.output_shape}, expected {spec.output_shape}")


def load_pathology_model(spec: PathologySpec, models_dir: Path) -> LoadedModel:
    path = models_dir / spec.file_name
    entry = LoadedModel(spec=spec, config_file=spec.config_file)

    if not path.is_file():
        entry.error = "weights_missing"
        logger.warning("Model %s not loaded: %s not found.", spec.model_id, path)
        return entry
    entry.weights_sha256 = sha256_of(path)

    if spec.config_file is not None:
        config_path = models_dir / spec.config_file
        if not config_path.is_file():
            entry.error = "config_missing"
            logger.warning("Model %s not loaded: %s not found.", spec.model_id, config_path)
            return entry
        entry.config_sha256 = sha256_of(config_path)
        try:
            entry.config = read_breakhis_config(config_path)
        except InvalidModelConfig as error:
            entry.error = "config_invalid"
            logger.error("Model %s not loaded: %s: %s", spec.model_id, spec.config_file, error)
            return entry

    try:
        if keras.backend.backend() != "tensorflow":
            raise RuntimeError(f"Keras backend is {keras.backend.backend()}, not tensorflow")
        model = keras.saving.load_model(path, compile=False, safe_mode=True)
        _check_shapes(model, spec)
    except Exception as error:  # noqa: BLE001
        # Unreadable file, unsafe content refused by safe_mode, or another
        # architecture: the model stays unloaded, the service keeps running.
        entry.error = "load_failed"
        logger.error("Model %s not loaded: %s", spec.model_id, error)
        return entry

    entry.module = model
    logger.info("Model %s loaded (sha256 %s).", spec.model_id, entry.weights_sha256)
    return entry


def load_pathology_models(models_dir: Path) -> dict[str, LoadedModel]:
    return {spec.model_id: load_pathology_model(spec, models_dir) for spec in PATHOLOGY_SPECS}
