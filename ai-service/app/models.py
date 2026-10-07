"""Brain models as trained (see README): architectures, strict weight loading.

The weight files are dictionaries holding the parameters under "model_state".
They are only ever loaded with strict=True: a checkpoint that does not match
its architecture exactly leaves the model unloaded, never half-loaded.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path

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
    spec: ModelSpec
    module: nn.Module | None = None
    weights_sha256: str | None = None
    error: str | None = None

    @property
    def loaded(self) -> bool:
        return self.module is not None


@dataclass
class ModelRegistry:
    models: dict[str, LoadedModel] = field(default_factory=dict)

    def get(self, model_id: str) -> LoadedModel:
        return self.models[model_id]

    def status(self) -> list[dict]:
        return [
            {
                "modelId": entry.spec.model_id,
                "file": entry.spec.file_name,
                "loaded": entry.loaded,
                "weightsSha256": entry.weights_sha256,
                "error": entry.error,
            }
            for entry in self.models.values()
        ]


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


def load_registry(models_dir: Path) -> ModelRegistry:
    return ModelRegistry(models={spec.model_id: load_model(spec, models_dir) for spec in MODEL_SPECS})
