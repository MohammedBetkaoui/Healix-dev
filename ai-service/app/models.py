"""Brain models as trained (see README): architectures, strict weight loading.

The weight files are dictionaries holding the parameters under "model_state".
They are only ever loaded with strict=True: a checkpoint that does not match
its architecture exactly leaves the model unloaded, never half-loaded.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import segmentation_models_pytorch as smp
import timm
import torch
from torch import nn

logger = logging.getLogger(__name__)

CLASSIFIER_ID = "brain-efficientnetb4-tumor-classification"
MENINGIOMA_SEGMENTER_ID = "brain-unet-meningioma-segmentation"
PITUITARY_SEGMENTER_ID = "brain-unet-pituitary-segmentation"

# Index order of the classifier output (training label order).
CLASS_LABELS = ("glioma", "meningioma", "notumor", "pituitary")


class BrainTumorClassifier(nn.Module):
    """EfficientNet-B4 backbone + MLP head. Attribute names are state_dict keys."""

    def __init__(self) -> None:
        super().__init__()
        self.backbone = timm.create_model(
            "efficientnet_b4", pretrained=False, num_classes=0, global_pool="avg"
        )
        features = self.backbone.num_features
        self.head = nn.Sequential(
            nn.BatchNorm1d(features),
            nn.Dropout(0.35),
            nn.Linear(features, 512),
            nn.BatchNorm1d(512),
            nn.GELU(),
            nn.Dropout(0.175),
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Linear(128, len(CLASS_LABELS)),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))


def build_segmenter() -> nn.Module:
    return smp.Unet(
        encoder_name="efficientnet-b4",
        encoder_weights=None,
        in_channels=3,
        classes=1,
        decoder_channels=(256, 128, 64, 32, 16),
        activation=None,
    )


@dataclass(frozen=True)
class ModelSpec:
    model_id: str
    file_name: str
    input_size: int
    build: object


# Only these files are loaded. Out of scope, never loaded: healixdz_seg_best.pth
# (glioma, needs a T1ce/FLAIR/T2 composite), the v2 *_best.pth files without
# "v5" (biased pseudo-masks) and the v4 flair/multimodal files.
MODEL_SPECS = (
    ModelSpec(CLASSIFIER_ID, "fold_5_best.pth", 224, BrainTumorClassifier),
    ModelSpec(MENINGIOMA_SEGMENTER_ID, "healixdz_seg_meningioma_v5_best.pth", 256, build_segmenter),
    ModelSpec(PITUITARY_SEGMENTER_ID, "healixdz_seg_pituitary_v5_best.pth", 256, build_segmenter),
)


@dataclass
class LoadedModel:
    # A ModelSpec (brain, PyTorch) or a PathologySpec (pathology, Keras).
    spec: Any
    # A torch module (brain) or a Keras model (pathology).
    module: Any = None
    weights_sha256: str | None = None
    error: str | None = None
    # Inference settings read next to the weights (pathology only), with the
    # file they come from and its SHA-256.
    config: dict = field(default_factory=dict)
    config_file: str | None = None
    config_sha256: str | None = None
    # One inference at a time on this model (the pathology models; the brain
    # pipeline keeps its own lock).
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    @property
    def loaded(self) -> bool:
        return self.module is not None

    def status(self) -> dict:
        status = {
            "modelId": self.spec.model_id,
            "file": self.spec.file_name,
            "loaded": self.loaded,
            "weightsSha256": self.weights_sha256,
            "error": self.error,
        }
        if self.config_file is not None:
            status["config"] = {"file": self.config_file, "sha256": self.config_sha256}
        return status


@dataclass
class ModelRegistry:
    models: dict[str, LoadedModel] = field(default_factory=dict)

    def get(self, model_id: str) -> LoadedModel:
        return self.models[model_id]

    def status(self) -> list[dict]:
        return [entry.status() for entry in self.models.values()]


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_model(spec: ModelSpec, models_dir: Path) -> LoadedModel:
    path = models_dir / spec.file_name
    entry = LoadedModel(spec=spec)

    if not path.is_file():
        entry.error = "weights_missing"
        logger.warning("Model %s not loaded: %s not found.", spec.model_id, path)
        return entry

    entry.weights_sha256 = sha256_of(path)

    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        module = spec.build()
        module.load_state_dict(checkpoint["model_state"], strict=True)
    except Exception as error:  # noqa: BLE001
        # A mismatched or unreadable checkpoint (a weights_only refusal raises
        # an UnpicklingError) stays unloaded, without stopping the service: no
        # strict=False fallback.
        entry.error = "load_failed"
        logger.error("Model %s not loaded: strict load failed: %s", spec.model_id, error)
        return entry

    module.eval()
    entry.module = module
    logger.info("Model %s loaded (sha256 %s).", spec.model_id, entry.weights_sha256)
    return entry


class InvalidModelCard(Exception):
    """A model card that is unreadable or does not describe its model."""


def load_model_with_card(spec, models_dir: Path, read_card, build) -> LoadedModel:
    """A PyTorch model described by a card next to its weights (spec.config_file).

    The card is the single source of truth of the model's settings; its
    "sha256" must be the weights' own. read_card(path) returns the parsed card
    (entry.config) or raises InvalidModelCard; build(config) returns the
    module, loaded with weights_only=True and strict=True only. Errors:
    weights_missing, config_missing, config_invalid, weights_sha256_mismatch,
    load_failed: the model stays unloaded, never half-loaded.
    """
    path = models_dir / spec.file_name
    config_path = models_dir / spec.config_file
    entry = LoadedModel(spec=spec, config_file=spec.config_file)

    if not path.is_file():
        entry.error = "weights_missing"
        logger.warning("Model %s not loaded: %s not found.", spec.model_id, path)
        return entry
    entry.weights_sha256 = sha256_of(path)

    if not config_path.is_file():
        entry.error = "config_missing"
        logger.warning("Model %s not loaded: %s not found.", spec.model_id, config_path)
        return entry
    entry.config_sha256 = sha256_of(config_path)
    try:
        config = read_card(config_path)
    except InvalidModelCard as error:
        entry.error = "config_invalid"
        logger.error("Model %s not loaded: %s: %s", spec.model_id, spec.config_file, error)
        return entry

    # The card was written for these weights only.
    if config["sha256"] != entry.weights_sha256:
        entry.error = "weights_sha256_mismatch"
        logger.error(
            "Model %s not loaded: weights sha256 %s, the card expects %s.",
            spec.model_id,
            entry.weights_sha256,
            config["sha256"],
        )
        return entry
    entry.config = config

    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        module = build(config)
        module.load_state_dict(checkpoint["model_state"], strict=True)
    except Exception as error:  # noqa: BLE001
        entry.error = "load_failed"
        logger.error("Model %s not loaded: strict load failed: %s", spec.model_id, error)
        return entry

    module.eval()
    entry.module = module
    logger.info("Model %s loaded (sha256 %s).", spec.model_id, entry.weights_sha256)
    return entry


def load_registry(models_dir: Path) -> ModelRegistry:
    """The brain models only."""
    return ModelRegistry(models={spec.model_id: load_model(spec, models_dir) for spec in MODEL_SPECS})


def load_service_registry(models_dir: Path, tf_intra_op_threads: int, tf_inter_op_threads: int) -> ModelRegistry:
    """Every model the service serves: brain (PyTorch), pathology (Keras), cardiology ECG and MRI segmentation (PyTorch)."""
    from .cardio_seg_models import CARDIO_SEG_MODEL_ID, load_cardio_seg_model
    from .ecg_models import ECG_MODEL_ID, load_ecg_model
    from .pathology_models import configure_tensorflow_threads, load_pathology_models

    registry = load_registry(models_dir)
    configure_tensorflow_threads(tf_intra_op_threads, tf_inter_op_threads)
    registry.models.update(load_pathology_models(models_dir))
    registry.models[ECG_MODEL_ID] = load_ecg_model(models_dir)
    registry.models[CARDIO_SEG_MODEL_ID] = load_cardio_seg_model(models_dir)
    return registry
