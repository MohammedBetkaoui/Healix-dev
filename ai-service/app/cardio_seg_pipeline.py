"""Cardiac MRI segmentation pipeline: the training notebook's preprocessing.

1. to_uint8: the pixels > 0 are z-scored with their own mean and standard
   deviation (eps 1e-8); the others keep their value. Clipped to [-3, 3],
   then (x + 3) / 6 * 255 as uint8. A wholly empty image stays at 0.
2. Grey -> RGB (3 identical channels), resized to the card's size with
   cv2.INTER_LINEAR, / max_pixel_value, then the card's mean and std: what
   albumentations' Resize and Normalize did in training.
3. float32 inference on CPU, one image at a time (analyze_cardio_seg) or a
   batch of them (predict_labels_batch, the images of a cine stack: each one
   preprocessed exactly as above, a batch being only several of them stacked);
   argmax of the 4 logits, the class map brought back to the slice's size with
   cv2.INTER_NEAREST.

The answer for one slice is a segmentation: the class map, its colour overlay,
and the area of each structure (in mm² when a DICOM gives its pixel spacing).
Never a diagnosis, an ejection fraction nor a volume: one slice does not allow
it (cardio_volume_pipeline does it for a whole cine stack).
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from pathlib import Path

import cv2
import numpy as np
import torch

from .cardio_seg_input import read_slice
from .cardio_seg_models import CARDIO_SEG_MODEL_ID, STRUCTURES
from .label_maps import load_palette, overlay_lut, png_base64
from .models import ModelRegistry
from .pipeline import ModelNotLoaded

ZSCORE_EPS = 1e-8
# Images per forward pass of a cine stack: the memory of a batch of 3 x 256 x 256
# images and the logits of 4 classes stays small on a CPU.
DEFAULT_BATCH_SIZE = 8
CARDIO_SEG_PALETTE_FILE = Path(__file__).with_name("cardio_seg_palette.json")


def load_cardio_seg_palette(path: Path = CARDIO_SEG_PALETTE_FILE) -> dict[str, str]:
    """{structure: "#RRGGBB"} for exactly LV, RV and MYO; ValueError otherwise."""
    return load_palette(path, STRUCTURES)


CARDIO_SEG_PALETTE = load_cardio_seg_palette()
# (4, 4) BGRA rows by class index; background fully transparent.
CARDIO_SEG_OVERLAY_LUT = overlay_lut(CARDIO_SEG_PALETTE, STRUCTURES)


def to_uint8(pixels: np.ndarray) -> np.ndarray:
    """As the notebook (ACDCDataset): z-score of the pixels > 0, clip, then 0-255."""
    image = pixels.astype(np.float32, copy=True)
    foreground = image > 0
    if not foreground.any():
        return np.zeros(image.shape, dtype=np.uint8)
    values = image[foreground]
    image[foreground] = (values - values.mean()) / (values.std() + ZSCORE_EPS)
    image = np.clip(image, -3, 3)
    return ((image + 3) / 6 * 255).clip(0, 255).astype(np.uint8)


def model_input(pixels: np.ndarray, config: dict) -> torch.Tensor:
    """(1, 3, size, size) float32 tensor, as in training."""
    rgb = cv2.cvtColor(to_uint8(pixels), cv2.COLOR_GRAY2RGB)
    size = config["input_size"]
    resized = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_LINEAR)
    mean = np.array(config["mean"], dtype=np.float32) * np.float32(config["max_pixel_value"])
    std = np.array(config["std"], dtype=np.float32) * np.float32(config["max_pixel_value"])
    normalized = (resized.astype(np.float32) - mean) / std
    return torch.from_numpy(normalized.transpose(2, 0, 1).copy()).unsqueeze(0)


def predict_labels_batch(
    images: Sequence[np.ndarray], entry, batch_size: int = DEFAULT_BATCH_SIZE
) -> list[np.ndarray]:
    """One (size, size) uint8 class map (indices 0-3) per image, at the model's
    input size, the images going through the model `batch_size` at a time. Each
    is preprocessed by model_input, alone: only the forward pass is shared."""
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1.")
    maps: list[np.ndarray] = []
    for start in range(0, len(images), batch_size):
        batch = torch.cat([model_input(pixels, entry.config) for pixels in images[start : start + batch_size]])
        with entry.lock, torch.inference_mode():
            logits = entry.module(batch)
        maps.extend(logits.argmax(dim=1).numpy().astype(np.uint8))
    return maps


def predict_labels(pixels: np.ndarray, entry) -> np.ndarray:
    """(size, size) uint8 class indices 0-3, at the model's input size."""
    return predict_labels_batch([pixels], entry)[0]


def segment(pixels: np.ndarray, entry) -> np.ndarray:
    """(H, W) uint8 class indices 0-3, at the slice's size."""
    return segment_batch([pixels], entry)[0]


def segment_batch(images: Sequence[np.ndarray], entry, batch_size: int = DEFAULT_BATCH_SIZE) -> list[np.ndarray]:
    """One (H, W) uint8 class map per image, each at its own size."""
    return [
        cv2.resize(labels, (pixels.shape[1], pixels.shape[0]), interpolation=cv2.INTER_NEAREST)
        for pixels, labels in zip(images, predict_labels_batch(images, entry, batch_size), strict=True)
    ]


def structure_areas(labels: np.ndarray, spacing: tuple[float, float] | None) -> dict:
    """Pixels per structure, and mm² when the pixel spacing is known."""
    counts = np.bincount(labels.ravel(), minlength=len(STRUCTURES) + 1)
    pixel_mm2 = spacing[0] * spacing[1] if spacing else None
    return {
        name: {
            "pixels": int(counts[index]),
            "areaMm2": None if pixel_mm2 is None else round(float(counts[index]) * pixel_mm2, 2),
        }
        for index, name in enumerate(STRUCTURES, start=1)
    }


def display_uint8(pixels: np.ndarray) -> np.ndarray:
    """The slice as analysed, its intensity range stretched to 0-255: what is
    shown under the overlay (a DICOM cannot be shown as it is)."""
    low, high = float(pixels.min()), float(pixels.max())
    if high <= low:
        return np.zeros(pixels.shape, dtype=np.uint8)
    return np.round((pixels.astype(np.float32) - low) / (high - low) * 255).astype(np.uint8)


def overlay_rgba(labels: np.ndarray) -> np.ndarray:
    """(H, W, 4) BGRA image (OpenCV order): each structure in its colour, background transparent."""
    return CARDIO_SEG_OVERLAY_LUT[labels]


def analyze_cardio_seg(data: bytes, registry: ModelRegistry, max_pixels: int) -> dict:
    started = time.perf_counter()
    slice_ = read_slice(data, max_pixels)
    entry = registry.models.get(CARDIO_SEG_MODEL_ID)
    if entry is None or not entry.loaded:
        raise ModelNotLoaded()

    labels = segment(slice_.pixels, entry)
    structures = structure_areas(labels, slice_.pixel_spacing_mm)
    height, width = labels.shape
    return {
        "modelId": CARDIO_SEG_MODEL_ID,
        "weightsSha256": entry.weights_sha256,
        "configSha256": entry.config_sha256,
        "labelMapPng": png_base64(labels, "label map"),
        "overlayPng": png_base64(overlay_rgba(labels), "overlay"),
        "slicePng": png_base64(display_uint8(slice_.pixels), "slice"),
        "structures": structures,
        "pixelSpacingMm": list(slice_.pixel_spacing_mm) if slice_.pixel_spacing_mm else None,
        "noStructureFound": all(area["pixels"] == 0 for area in structures.values()),
        "source": slice_.source,
        "imageWidth": width,
        "imageHeight": height,
        "durationMs": round((time.perf_counter() - started) * 1000),
    }
