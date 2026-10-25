"""Service settings, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# <repo>/models, next to ai-service/: where the weights sit in development
# (the folder the tests read), whatever the working directory.
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


def default_tf_intra_op_threads() -> int:
    """Half the CPUs for TensorFlow's operations: the other half stays for PyTorch."""
    return max(1, (os.cpu_count() or 2) // 2)


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
    # Nuclei segmentation: longest accepted side, in pixels (larger: 422).
    nuclei_max_side: int = 4096
    # TensorFlow thread pools (pathology models), capped so that a pathology
    # analysis does not starve the PyTorch brain models of CPU.
    tf_intra_op_threads: int = 1
    tf_inter_op_threads: int = 2
    # Upper bound of a cine stack (a .zip of DICOM files), in bytes: what
    # cardio_volume_input accepts once unpacked (the archive is no larger).
    max_stack_bytes: int = 300 * 1024 * 1024


def load_settings() -> Settings:
    return Settings(
        service_token=os.environ.get("AI_SERVICE_TOKEN", ""),
        models_dir=Path(os.environ.get("AI_MODELS_DIR") or DEFAULT_MODELS_DIR).resolve(),
        host=os.environ.get("AI_SERVICE_HOST", "127.0.0.1"),
        port=int(os.environ.get("AI_SERVICE_PORT", "8001")),
        max_image_bytes=int(os.environ.get("AI_MAX_IMAGE_BYTES", str(20 * 1024 * 1024))),
        max_image_pixels=int(os.environ.get("AI_MAX_IMAGE_PIXELS", str(50_000_000))),
        nuclei_max_side=int(os.environ.get("AI_NUCLEI_MAX_SIDE", "4096")),
        tf_intra_op_threads=int(os.environ.get("AI_TF_INTRA_OP_THREADS") or default_tf_intra_op_threads()),
        tf_inter_op_threads=int(os.environ.get("AI_TF_INTER_OP_THREADS", "2")),
        max_stack_bytes=int(os.environ.get("AI_MAX_STACK_BYTES", str(300 * 1024 * 1024))),
    )
