"""Brain pipeline: classification, then segmentation for two classes only.

Routing is fixed: the classifier always runs; a meningioma prediction routes
to the meningioma segmenter, a pituitary prediction to the pituitary one;
glioma and notumor get no segmentation. The segmenters are never run on their
own: they were only evaluated on images that contain their tumour type.
"""

from __future__ import annotations

import base64
import threading
import time

import cv2
import numpy as np
import torch

from .models import (
    CLASS_LABELS,
    CLASSIFIER_ID,
    MENINGIOMA_SEGMENTER_ID,
    PITUITARY_SEGMENTER_ID,
    ModelRegistry,
)
from .preprocess import decode_image, to_input_tensor

SEGMENTER_BY_CLASS = {
    "meningioma": MENINGIOMA_SEGMENTER_ID,
    "pituitary": PITUITARY_SEGMENTER_ID,
}
MASK_THRESHOLD = 0.5

# One inference at a time: CPU-bound, and keeps memory use predictable.
_inference_lock = threading.Lock()


class ModelNotLoaded(Exception):
    """The classifier is not loaded: the pipeline cannot run (HTTP 503)."""


def _segment(module: torch.nn.Module, image_bgr: np.ndarray, size: int) -> np.ndarray:
    """Binary mask (0/255, uint8) at the original image size."""
    height, width = image_bgr.shape[:2]
    with torch.inference_mode():
        logits = module(to_input_tensor(image_bgr, size))
    probabilities = torch.sigmoid(logits)[0, 0].numpy()
    mask = (probabilities > MASK_THRESHOLD).astype(np.uint8) * 255
    return cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)


def analyze_brain(data: bytes, registry: ModelRegistry, max_pixels: int) -> dict:
    started = time.perf_counter()
    image = decode_image(data, max_pixels)
    height, width = image.shape[:2]

    classifier = registry.get(CLASSIFIER_ID)
    if not classifier.loaded:
        raise ModelNotLoaded()

    with _inference_lock:
        with torch.inference_mode():
            logits = classifier.module(to_input_tensor(image, classifier.spec.input_size))
        probabilities = torch.softmax(logits, dim=1)[0].tolist()

        predictions = sorted(
            (
                {"label": label, "probability": float(probability)}
                for label, probability in zip(CLASS_LABELS, probabilities)
            ),
            key=lambda prediction: prediction["probability"],
            reverse=True,
        )

        segmentation = None
        skipped_reason = None
        segmenter_id = SEGMENTER_BY_CLASS.get(predictions[0]["label"])

        if segmenter_id is None:
            skipped_reason = "not_applicable_for_class"
        else:
            segmenter = registry.get(segmenter_id)
            if not segmenter.loaded:
                skipped_reason = "model_not_loaded"
            else:
                mask = _segment(segmenter.module, image, segmenter.spec.input_size)
                encoded, png = cv2.imencode(".png", mask)
                if not encoded:
                    raise RuntimeError("PNG encoding of the mask failed.")
                area_px = int(np.count_nonzero(mask))
                segmentation = {
                    "modelId": segmenter_id,
                    "weightsSha256": segmenter.weights_sha256,
                    "maskPng": base64.b64encode(png.tobytes()).decode("ascii"),
                    "areaPx": area_px,
                    "areaRatio": area_px / float(width * height),
                }

    return {
        "classification": {
            "modelId": CLASSIFIER_ID,
            "weightsSha256": classifier.weights_sha256,
            "predictions": predictions,
        },
        "segmentation": segmentation,
        "segmentationSkippedReason": skipped_reason,
        "imageWidth": width,
        "imageHeight": height,
        "durationMs": round((time.perf_counter() - started) * 1000),
    }
