"""Pathology pipelines: BreakHis classification and PanNuke nuclei segmentation.

Preprocessing as in the training notebooks (see README):

- BreakHis: RGB -> float32 in [0, 255] (no /255: EfficientNetB0 rescales
  internally) -> bilinear resize to 224 x 224 with antialiasing -> clip to
  [0, 255]; four views (original, left-right flip, up-down flip, both) and
  the mean of their sigmoid outputs, compared with the calibrated threshold.
  The score is not calibrated: it is never presented as a probability.
- PanNuke: RGB -> float32 / 255, 256 x 256 exactly; argmax of the softmax.
  A larger image is cut into 256 x 256 tiles overlapping by 32 px, mirrored
  at the image borders, of which only the central part is kept. The class map
  is also returned as a colour overlay (nuclei_palette.json, background
  transparent).
"""

from __future__ import annotations

import logging
import math
import time
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf

from .label_maps import (
    check_sides,
    load_palette,
    overlay_lut,
    png_base64,
)
from .models import ModelRegistry
from .pathology_models import BREAST_CLASSIFIER_ID, NUCLEI_CLASSES, NUCLEI_SEGMENTER_ID
from .pipeline import ModelNotLoaded
from .preprocess import decode_image

logger = logging.getLogger(__name__)

# Magnification of the slide: not a model input, returned and logged.
MAGNIFICATIONS = (40, 100, 200, 400)
BREAKHIS_INPUT_SIZE = 224
TTA_VIEWS = ("original", "flip_left_right", "flip_up_down", "flip_left_right_and_up_down")

NUCLEI_TILE = 256
NUCLEI_OVERLAP = 32
# Kept from each tile: its centre, NUCLEI_MARGIN px away from every edge.
NUCLEI_MARGIN = NUCLEI_OVERLAP // 2
NUCLEI_STRIDE = NUCLEI_TILE - NUCLEI_OVERLAP
# Tiles per forward pass (bounds memory on large images).
NUCLEI_BATCH = 8

# Overlay colour of each nucleus type (Okabe-Ito, legible on H&E); the
# background stays transparent. Read once, when the module loads.
NUCLEI_PALETTE_FILE = Path(__file__).with_name("nuclei_palette.json")


def load_nuclei_palette(path: Path = NUCLEI_PALETTE_FILE) -> dict[str, str]:
    """{type: "#RRGGBB"} for exactly the five nucleus types; ValueError otherwise."""
    return load_palette(path, NUCLEI_CLASSES[1:])


NUCLEI_PALETTE = load_nuclei_palette()
# (6, 4) BGRA rows by class index; background fully transparent.
NUCLEI_OVERLAY_LUT = overlay_lut(NUCLEI_PALETTE, NUCLEI_CLASSES[1:])


class InvalidMagnification(Exception):
    """magnification missing or not one of 40, 100, 200, 400 (HTTP 422)."""


def _loaded(registry: ModelRegistry, model_id: str):
    entry = registry.models.get(model_id)
    if entry is None or not entry.loaded:
        raise ModelNotLoaded()
    return entry


def _to_rgb(image_bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)


# ---------------------------------------------------------------------------
# BreakHis classification
# ---------------------------------------------------------------------------


def parse_magnification(value) -> int:
    """40, 100, 200 or 400, from the form field (text) or an int."""
    text = str(value).strip() if value is not None else ""
    if not text.isdigit() or int(text) not in MAGNIFICATIONS:
        raise InvalidMagnification()
    return int(text)


def breakhis_input(rgb: np.ndarray) -> tf.Tensor:
    """(224, 224, 3) float32 in [0, 255], as load_image of the BreakHis notebook."""
    image = tf.cast(tf.convert_to_tensor(rgb), tf.float32)
    image = tf.image.resize(image, (BREAKHIS_INPUT_SIZE, BREAKHIS_INPUT_SIZE), method="bilinear", antialias=True)
    return tf.clip_by_value(image, 0.0, 255.0)


def tta_views(image: tf.Tensor) -> tf.Tensor:
    """(4, H, W, 3): the image, flipped left-right, up-down, and both (TTA_VIEWS order)."""
    flipped = tf.image.flip_left_right(image)
    return tf.stack([image, flipped, tf.image.flip_up_down(image), tf.image.flip_up_down(flipped)])


def tta_scores(model, views: tf.Tensor) -> tuple[np.ndarray, np.float32]:
    """Sigmoid output of each view, and their mean (float32, as predict_tta)."""
    outputs = np.asarray(model(views, training=False), dtype=np.float32).reshape(-1)
    if outputs.shape != (len(TTA_VIEWS),):
        raise RuntimeError(f"Unexpected classifier output shape {outputs.shape}.")
    p0, p1, p2, p3 = outputs
    return outputs, (p0 + p1 + p2 + p3) / np.float32(4.0)


def classify_breast_rgb(rgb: np.ndarray, magnification: int, entry) -> dict:
    """The classification of one RGB image (what the endpoint returns, without durationMs)."""
    threshold = entry.config["threshold"]
    views = tta_views(breakhis_input(rgb))
    with entry.lock:
        scores, score = tta_scores(entry.module, views)
    return {
        "modelId": BREAST_CLASSIFIER_ID,
        "weightsSha256": entry.weights_sha256,
        "malignancyScore": float(score),
        "threshold": threshold,
        "decision": "malignant" if score >= threshold else "benign",
        "views": [float(value) for value in scores],
        "magnification": magnification,
    }


def analyze_breast(data: bytes, magnification, registry: ModelRegistry, max_pixels: int) -> dict:
    started = time.perf_counter()
    magnification = parse_magnification(magnification)
    image = decode_image(data, max_pixels)
    entry = _loaded(registry, BREAST_CLASSIFIER_ID)

    result = classify_breast_rgb(_to_rgb(image), magnification, entry)
    result["durationMs"] = round((time.perf_counter() - started) * 1000)
    logger.info("Breast classification: magnification %sx, %s ms.", magnification, result["durationMs"])
    return result


# ---------------------------------------------------------------------------
# PanNuke nuclei segmentation
# ---------------------------------------------------------------------------


def nuclei_input(rgb: np.ndarray) -> np.ndarray:
    """float32 in [0, 1], as normalize_image of the PanNuke notebook."""
    return rgb.astype(np.float32) / np.float32(255.0)


def check_nuclei_size(height: int, width: int, max_side: int) -> None:
    """Under 256 px the segmenter has no tile to work on."""
    check_sides(height, width, NUCLEI_TILE, max_side)


def tile_grid(height: int, width: int) -> tuple[int, int]:
    """Rows and columns of tiles: each one contributes a NUCLEI_STRIDE square."""
    return math.ceil(height / NUCLEI_STRIDE), math.ceil(width / NUCLEI_STRIDE)


def _predict_labels(model, batch: np.ndarray) -> np.ndarray:
    """(n, 256, 256) class indices: argmax of the softmax output."""
    probabilities = np.asarray(model(batch, training=False))
    return np.argmax(probabilities, axis=-1).astype(np.uint8)


def segment_nuclei_rgb(rgb: np.ndarray, entry) -> tuple[np.ndarray, int]:
    """(label map at the image size, tiles run). The caller checks the size first."""
    height, width = rgb.shape[:2]
    if (height, width) == (NUCLEI_TILE, NUCLEI_TILE):
        with entry.lock:
            return _predict_labels(entry.module, nuclei_input(rgb)[np.newaxis])[0], 1

    rows, cols = tile_grid(height, width)
    # Mirrored borders: NUCLEI_MARGIN on the top and left, up to a whole
    # number of tiles on the bottom and right (always less than the side).
    padded = np.pad(
        rgb,
        (
            (NUCLEI_MARGIN, rows * NUCLEI_STRIDE + NUCLEI_MARGIN - height),
            (NUCLEI_MARGIN, cols * NUCLEI_STRIDE + NUCLEI_MARGIN - width),
            (0, 0),
        ),
        mode="reflect",
    )
    labels = np.zeros((rows * NUCLEI_STRIDE, cols * NUCLEI_STRIDE), dtype=np.uint8)
    origins = [(row * NUCLEI_STRIDE, col * NUCLEI_STRIDE) for row in range(rows) for col in range(cols)]
    centre = slice(NUCLEI_MARGIN, NUCLEI_MARGIN + NUCLEI_STRIDE)

    with entry.lock:
        for start in range(0, len(origins), NUCLEI_BATCH):
            group = origins[start : start + NUCLEI_BATCH]
            batch = np.stack([nuclei_input(padded[y : y + NUCLEI_TILE, x : x + NUCLEI_TILE]) for y, x in group])
            for (y, x), tile in zip(group, _predict_labels(entry.module, batch)):
                # Tile at (y, x) of the padded image: its centre is the image's
                # square at (y, x), NUCLEI_STRIDE wide.
                labels[y : y + NUCLEI_STRIDE, x : x + NUCLEI_STRIDE] = tile[centre, centre]
    return labels[:height, :width], len(origins)


def class_fractions(labels: np.ndarray) -> dict:
    """Share of background among all pixels; share of each nucleus type among the non-background ones."""
    counts = np.bincount(labels.ravel(), minlength=len(NUCLEI_CLASSES))
    total = int(labels.size)
    nuclei = total - int(counts[0])
    return {
        "background": int(counts[0]) / total,
        # The five types always; each None when no pixel is a nucleus (no share to give).
        "nucleusTypes": {
            name: None if nuclei == 0 else int(counts[index]) / nuclei
            for index, name in enumerate(NUCLEI_CLASSES)
            if index > 0
        },
    }


def overlay_rgba(labels: np.ndarray) -> np.ndarray:
    """(H, W, 4) BGRA image (OpenCV order): each nucleus pixel in its type's colour, alpha 255; background alpha 0."""
    return NUCLEI_OVERLAY_LUT[labels]


def analyze_nuclei(data: bytes, registry: ModelRegistry, max_pixels: int, max_side: int) -> dict:
    started = time.perf_counter()
    image = decode_image(data, max_pixels)
    height, width = image.shape[:2]
    check_nuclei_size(height, width, max_side)
    entry = _loaded(registry, NUCLEI_SEGMENTER_ID)

    labels, tiles = segment_nuclei_rgb(_to_rgb(image), entry)
    label_map = png_base64(labels, "label map")
    overlay = png_base64(overlay_rgba(labels), "overlay")
    duration = round((time.perf_counter() - started) * 1000)
    logger.info("Nuclei segmentation: %s tile(s), %s ms.", tiles, duration)
    return {
        "modelId": NUCLEI_SEGMENTER_ID,
        "weightsSha256": entry.weights_sha256,
        "labelMapPng": label_map,
        "overlayPng": overlay,
        "classFractions": class_fractions(labels),
        "tiled": tiles > 1,
        "tileCount": tiles,
        "imageWidth": width,
        "imageHeight": height,
        "durationMs": duration,
    }
