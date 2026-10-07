"""Image decoding and preprocessing, as at training time.

Colour decode (3 channels, OpenCV BGR) -> BGR to RGB -> resize with linear
interpolation -> /255 -> ImageNet mean/std. One deterministic pass: no
test-time augmentation.
"""

from __future__ import annotations

import cv2
import numpy as np
import torch

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class InvalidImage(Exception):
    """The upload is not a decodable PNG or JPEG image (HTTP 422)."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def decode_image(data: bytes, max_pixels: int) -> np.ndarray:
    """Decodes a PNG or JPEG upload into a BGR uint8 array (H, W, 3)."""
    # Checked on the bytes, not on a client-declared type; OpenCV would
    # otherwise also accept BMP, TIFF, WebP... DICOM is not supported.
    if not (data.startswith(PNG_SIGNATURE) or data.startswith(JPEG_SIGNATURE)):
        raise InvalidImage("unsupported_format")

    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)

    if image is None or image.ndim != 3 or image.shape[2] != 3:
        raise InvalidImage("undecodable")

    height, width = image.shape[:2]
    if height * width > max_pixels:
        raise InvalidImage("too_many_pixels")

    return image


def to_input_tensor(image_bgr: np.ndarray, size: int) -> torch.Tensor:
    """(1, 3, size, size) float tensor, normalized like the training inputs."""
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_LINEAR)
    normalized = (resized.astype(np.float32) / 255.0 - MEAN) / STD
    return torch.from_numpy(normalized.transpose(2, 0, 1).copy()).unsqueeze(0)
