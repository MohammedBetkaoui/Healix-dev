"""Service settings, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# <repo>/models, next to ai-service/: where the weights sit in development
# (the folder the tests read), whatever the working directory.
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


@dataclass(frozen=True)
class Settings:
    # Shared secret expected in the X-Service-Token header. Empty means every
    # protected request is refused: the service never runs open.
    service_token: str
    models_dir: Path
    host: str
    port: int
    # Upper bound of an uploaded image, in bytes (same 20 MB as patient documents).
    max_image_bytes: int
    # Upper bound of decoded pixels, against decompression bombs.
    max_image_pixels: int


def load_settings() -> Settings:
    return Settings(
        service_token=os.environ.get("AI_SERVICE_TOKEN", ""),
        models_dir=Path(os.environ.get("AI_MODELS_DIR") or DEFAULT_MODELS_DIR).resolve(),
        host=os.environ.get("AI_SERVICE_HOST", "127.0.0.1"),
        port=int(os.environ.get("AI_SERVICE_PORT", "8001")),
        max_image_bytes=int(os.environ.get("AI_MAX_IMAGE_BYTES", str(20 * 1024 * 1024))),
        max_image_pixels=int(os.environ.get("AI_MAX_IMAGE_PIXELS", str(50_000_000))),
    )
