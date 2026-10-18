"""Cardiac MRI segmentation model as trained (ACDC, U-Net EfficientNet-B4).

One short-axis cine MRI slice -> 4 classes: 0 background, 1 left ventricle
cavity, 2 right ventricle cavity, 3 left ventricle myocardium. Everything the
pipeline needs (architecture, input size, normalisation, labels, test
patients and metrics) is read from the model card next to the weights,
cardio-seg-acdc-unet-effb4.json: the single source of truth, whose SHA-256
must match the weights file (models.load_model_with_card).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import segmentation_models_pytorch as smp

from .models import InvalidModelCard, LoadedModel, load_model_with_card

CARDIO_SEG_MODEL_ID = "cardio-seg-acdc-unet-effb4"

# The structures, by class index (1, 2, 3): the card's labels, as named in
# its test metrics.
STRUCTURES = ("LV", "RV", "MYO")


@dataclass(frozen=True)
class CardioSegSpec:
    model_id: str
    file_name: str
    # The model card, same name as the weights.
    config_file: str


CARDIO_SEG_SPEC = CardioSegSpec(CARDIO_SEG_MODEL_ID, "cardio-seg-acdc-unet-effb4.pt", "cardio-seg-acdc-unet-effb4.json")


def read_model_card(path: Path, spec: CardioSegSpec = CARDIO_SEG_SPEC) -> dict:
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
        normalize = source["normalize"]
        mean = [float(value) for value in normalize["mean"]]
        std = [float(value) for value in normalize["std"]]
        max_pixel_value = float(normalize["max_pixel_value"])
        # "256 x 256, interpolation bilinéaire (cv2.INTER_LINEAR)"
        size = re.match(r"\s*(\d+)\s*x\s*(\d+)", str(source["resize"]))
        labels = {int(index): str(name) for index, name in card["labels"].items()}
        build = {
            "classes": int(architecture["classes"]),
            "decoder_channels": tuple(int(value) for value in architecture["decoder_channels"]),
            "encoder_name": str(architecture["encoder_name"]),
            "in_channels": int(architecture["in_channels"]),
        }
        test = card["test"]
        sha = str(card["sha256"])
    except (KeyError, TypeError, ValueError, AttributeError) as error:
        raise InvalidModelCard(f"missing or invalid field: {error}") from error

    if architecture.get("class") != "smp.Unet":
        raise InvalidModelCard(f"architecture class is {architecture.get('class')!r}, expected 'smp.Unet'")
    if build["classes"] != len(STRUCTURES) + 1 or sorted(labels) != list(range(build["classes"])):
        raise InvalidModelCard("classes and labels do not match the 3 structures and the background")
    if build["in_channels"] != 3 or len(mean) != 3 or len(std) != 3 or min(std) <= 0 or max_pixel_value <= 0:
        raise InvalidModelCard("invalid input channels or normalisation")
    if size is None or int(size.group(1)) != int(size.group(2)) or int(size.group(1)) <= 0:
        raise InvalidModelCard("invalid input size")
    if not all(isinstance(test.get(name), (int, float)) for name in (*STRUCTURES, "mean")):
        raise InvalidModelCard("missing test metrics")

    return {
        "build": build,
        "card": card,
        "input_size": int(size.group(1)),
        "labels": labels,
        "max_pixel_value": max_pixel_value,
        "mean": mean,
        "sha256": sha.lower(),
        "std": std,
    }


def build_unet(config: dict):
    return smp.Unet(encoder_weights=None, activation=None, **config["build"])


def load_cardio_seg_model(models_dir: Path, spec: CardioSegSpec = CARDIO_SEG_SPEC) -> LoadedModel:
    return load_model_with_card(spec, models_dir, lambda path: read_model_card(path, spec), build_unet)
