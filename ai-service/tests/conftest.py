from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient
from torch import nn

from app.config import Settings
from app.main import create_app
from app.models import (
    CLASS_LABELS,
    MODEL_SPECS,
    LoadedModel,
    ModelRegistry,
    load_registry,
)

TOKEN = "test-token"
MODELS_DIR = Path(os.environ.get("AI_MODELS_DIR", Path(__file__).resolve().parents[2] / "models"))
WEIGHTS_PRESENT = all((MODELS_DIR / spec.file_name).is_file() for spec in MODEL_SPECS)

requires_weights = pytest.mark.skipif(
    not WEIGHTS_PRESENT, reason=f"model weights not found in {MODELS_DIR}"
)


def make_settings(models_dir: Path = MODELS_DIR, **overrides) -> Settings:
    values = {
        "service_token": TOKEN,
        "models_dir": models_dir,
        "host": "127.0.0.1",
        "port": 0,
        "max_image_bytes": 20 * 1024 * 1024,
        "max_image_pixels": 50_000_000,
    }
    values.update(overrides)
    return Settings(**values)


def make_client(registry: ModelRegistry, **overrides) -> TestClient:
    return TestClient(create_app(make_settings(**overrides), registry))


def png_bytes(width: int = 320, height: int = 240) -> bytes:
    """Deterministic grey gradient (not a medical image)."""
    gradient = np.tile(np.linspace(0, 255, width, dtype=np.uint8), (height, 1))
    ok, encoded = cv2.imencode(".png", gradient)
    assert ok
    return encoded.tobytes()


def jpeg_bytes(width: int = 300, height: int = 200) -> bytes:
    image = np.full((height, width, 3), 90, dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


class FixedLogits(nn.Module):
    """Stands in for the classifier: always predicts `label`."""

    def __init__(self, label: str) -> None:
        super().__init__()
        logits = torch.full((len(CLASS_LABELS),), -2.0)
        logits[CLASS_LABELS.index(label)] = 3.0
        self.register_buffer("logits", logits)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.logits.expand(x.shape[0], -1)


class SquareMask(nn.Module):
    """Stands in for a segmenter: positive logits on the central quarter."""

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        size = x.shape[-1]
        logits = torch.full((x.shape[0], 1, size, size), -5.0)
        logits[:, :, size // 4 : 3 * size // 4, size // 4 : 3 * size // 4] = 5.0
        return logits


def fake_registry(top_label: str | None, segmenters_loaded: bool = True) -> ModelRegistry:
    """Registry of stand-in modules; top_label None leaves the classifier unloaded."""
    models: dict[str, LoadedModel] = {}
    for spec in MODEL_SPECS:
        entry = LoadedModel(spec=spec, weights_sha256=f"sha-{spec.model_id}")
        if spec.input_size == 224:
            entry.module = FixedLogits(top_label) if top_label else None
        elif segmenters_loaded:
            entry.module = SquareMask()
        if entry.module is None:
            entry.weights_sha256 = None
            entry.error = "weights_missing"
        models[spec.model_id] = entry
    return ModelRegistry(models=models)


@pytest.fixture(scope="session")
def real_registry() -> ModelRegistry:
    if not WEIGHTS_PRESENT:
        pytest.skip(f"model weights not found in {MODELS_DIR}")
    return load_registry(MODELS_DIR)
