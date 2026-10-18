"""Cardiology ECG model as trained (notebooks/module-cardiologie.ipynb).

HealixDzECGNet, a ResNet1D-34 trained on PTB-XL 1.0.1 (records100) for 5
multi-label superclasses. Everything the pipeline needs (lead order, sampling
rate, window, filter, normalization, per-class thresholds, test metrics) is
read from the model card next to the weights, cardio-ecg-resnet1d-ptbxl.json:
the single source of truth, whose SHA-256 must match the weights file.

Loaded with torch.load(weights_only=True) and load_state_dict(strict=True)
only, as the brain models: a checkpoint, a card or a digest that does not
match leaves the model unloaded, never half-loaded.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import torch
from torch import nn

from .models import LoadedModel, sha256_of

logger = logging.getLogger(__name__)

ECG_MODEL_ID = "cardio-ecg-resnet1d-ptbxl-superdiagnostic"


class ResBlock1D(nn.Module):
    """Residual block, as in the notebook. Attribute names are state_dict keys."""

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1, dropout: float = 0.2) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, out_channels, kernel_size=3, stride=stride, padding=1, bias=False)
        self.bn1 = nn.BatchNorm1d(out_channels)
        self.relu = nn.ReLU(inplace=True)
        self.dropout = nn.Dropout(p=dropout)
        self.conv2 = nn.Conv1d(out_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm1d(out_channels)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv1d(in_channels, out_channels, kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm1d(out_channels),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.dropout(out)
        out = self.bn2(self.conv2(out))
        out = out + self.shortcut(x)
        return self.relu(out)


class HealixDzECGNet(nn.Module):
    """ResNet1D-34 of the notebook: stem, 3+4+6+3 residual blocks, GAP, MLP head."""

    def __init__(self, n_leads: int = 12, n_classes: int = 5, dropout: float = 0.3) -> None:
        super().__init__()
        self.n_classes = n_classes
        self.stem = nn.Sequential(
            nn.Conv1d(n_leads, 64, kernel_size=15, stride=2, padding=7, bias=False),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(kernel_size=3, stride=2, padding=1),
        )
        self.layer1 = self._make_layer(64, 64, n_blocks=3, stride=1, dropout=dropout)
        self.layer2 = self._make_layer(64, 128, n_blocks=4, stride=2, dropout=dropout)
        self.layer3 = self._make_layer(128, 256, n_blocks=6, stride=2, dropout=dropout)
        self.layer4 = self._make_layer(256, 512, n_blocks=3, stride=2, dropout=dropout)
        self.gap = nn.AdaptiveAvgPool1d(1)
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(512, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(256, n_classes),
        )

    @staticmethod
    def _make_layer(in_ch: int, out_ch: int, n_blocks: int, stride: int, dropout: float) -> nn.Sequential:
        layers = [ResBlock1D(in_ch, out_ch, stride, dropout)]
        for _ in range(1, n_blocks):
            layers.append(ResBlock1D(out_ch, out_ch, 1, dropout))
        return nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.gap(x)
        return self.head(x)


@dataclass(frozen=True)
class EcgSpec:
    model_id: str
    file_name: str
    # The model card, same name as the weights.
    config_file: str


ECG_SPEC = EcgSpec(ECG_MODEL_ID, "cardio-ecg-resnet1d-ptbxl.pt", "cardio-ecg-resnet1d-ptbxl.json")


class InvalidModelCard(Exception):
    """The model card is unreadable or does not describe this model."""


def read_model_card(path: Path, spec: EcgSpec = ECG_SPEC) -> dict:
    """The card, checked for what the pipeline reads; InvalidModelCard otherwise."""
    try:
        card = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise InvalidModelCard(f"unreadable: {error}") from error
    if not isinstance(card, dict):
        raise InvalidModelCard("not a JSON object")
    if card.get("id") != spec.model_id:
        raise InvalidModelCard(f"id is {card.get('id')!r}, expected {spec.model_id!r}")
    if card.get("weights_file") != spec.file_name:
        raise InvalidModelCard(f"weights_file is {card.get('weights_file')!r}, expected {spec.file_name!r}")

    try:
        architecture = card["architecture"]
        source = card["input"]
        leads = list(source["leads"])
        classes = list(card["classes"])
        thresholds = {label: float(card["thresholds"][label]) for label in classes}
        sampling_rate = int(source["sampling_rate_hz"])
        samples = int(source["samples"])
        band = source["filter"]
        low, high, order = float(band["low_hz"]), float(band["high_hz"]), int(band["order"])
        sha = str(card["sha256"])
    except (KeyError, TypeError, ValueError) as error:
        raise InvalidModelCard(f"missing or invalid field: {error}") from error

    if len(leads) != int(architecture["n_leads"]) or len(classes) != int(architecture["n_classes"]):
        raise InvalidModelCard("leads or classes do not match the architecture")
    if len(set(leads)) != len(leads) or len(set(classes)) != len(classes):
        raise InvalidModelCard("duplicate leads or classes")
    if sampling_rate <= 0 or samples <= 0 or not 0 < low < high < sampling_rate / 2 or order <= 0:
        raise InvalidModelCard("invalid sampling, window or filter")
    if not all(0.0 < value < 1.0 for value in thresholds.values()):
        raise InvalidModelCard("thresholds must lie in (0, 1)")

    return {
        "card": card,
        "classes": classes,
        "dropout": float(architecture.get("dropout", 0.3)),
        "filter": {"high_hz": high, "low_hz": low, "order": order},
        "leads": leads,
        "labels_fr": dict(card.get("labels_fr") or {}),
        "sampling_rate": sampling_rate,
        "samples": samples,
        "sha256": sha.lower(),
        "thresholds": thresholds,
    }


def load_ecg_model(models_dir: Path, spec: EcgSpec = ECG_SPEC) -> LoadedModel:
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
        config = read_model_card(config_path, spec)
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
        module = HealixDzECGNet(n_leads=len(config["leads"]), n_classes=len(config["classes"]), dropout=config["dropout"])
        module.load_state_dict(checkpoint["model_state"], strict=True)
    except Exception as error:  # noqa: BLE001
        entry.error = "load_failed"
        logger.error("Model %s not loaded: strict load failed: %s", spec.model_id, error)
        return entry

    module.eval()
    entry.module = module
    logger.info("Model %s loaded (sha256 %s).", spec.model_id, entry.weights_sha256)
    return entry
