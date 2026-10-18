"""What the segmentation pipelines share: their size limits, their palette
(one #RRGGBB colour per class, read at start-up) and how a class map is sent
back (a one-channel PNG of class indices, and an RGBA colour overlay whose
background is transparent).
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import cv2
import numpy as np


class ImageTooSmall(Exception):
    """A side under the model's minimum (HTTP 422 image_too_small)."""

    def __init__(self, min_side: int) -> None:
        super().__init__(min_side)
        self.min_side = min_side


class ImageDimensionsTooLarge(Exception):
    """A side over the model's maximum (HTTP 422 image_dimensions_too_large)."""

    def __init__(self, max_side: int) -> None:
        super().__init__(max_side)
        self.max_side = max_side


def check_sides(height: int, width: int, min_side: int, max_side: int) -> None:
    if min(height, width) < min_side:
        raise ImageTooSmall(min_side)
    if max(height, width) > max_side:
        raise ImageDimensionsTooLarge(max_side)


def load_palette(path: Path, names: tuple[str, ...]) -> dict[str, str]:
    """{class: "#RRGGBB"} for exactly `names` (background excluded); ValueError otherwise."""
    palette = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(palette, dict) or set(palette) != set(names):
        raise ValueError(f"{path.name}: expected one colour for each of {', '.join(names)}.")
    for name, colour in palette.items():
        if not isinstance(colour, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", colour):
            raise ValueError(f"{path.name}: {name} is not a #RRGGBB colour.")
    return palette


def overlay_lut(palette: dict[str, str], names: tuple[str, ...]) -> np.ndarray:
    """(1 + len(names), 4) BGRA rows by class index, as OpenCV encodes them; background (0) fully transparent."""
    lut = np.zeros((len(names) + 1, 4), dtype=np.uint8)
    for index, name in enumerate(names, start=1):
        red, green, blue = (int(palette[name][offset : offset + 2], 16) for offset in (1, 3, 5))
        lut[index] = (blue, green, red, 255)
    return lut


def png_base64(image: np.ndarray, what: str) -> str:
    encoded, png = cv2.imencode(".png", image)
    if not encoded:
        raise RuntimeError(f"PNG encoding of the {what} failed.")
    return base64.b64encode(png.tobytes()).decode("ascii")
