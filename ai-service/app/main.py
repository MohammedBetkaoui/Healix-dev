"""FastAPI entry point: uvicorn app.main:app (or python -m app.main)."""

from __future__ import annotations

import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile

from .config import Settings, load_settings

_settings = load_settings()
# Read by OpenCV when decoding: refuses decompression bombs before allocation.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(_settings.max_image_pixels))
# TensorFlow's C++ start-up notices (oneDNN, CPU features) left out of the logs.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "1")

from .models import ModelRegistry, load_service_registry  # noqa: E402
from .pathology_pipeline import (  # noqa: E402
    NUCLEI_TILE,
    ImageDimensionsTooLarge,
    ImageTooSmall,
    InvalidMagnification,
    analyze_breast,
    analyze_nuclei,
)
from .pipeline import ModelNotLoaded, analyze_brain  # noqa: E402
from .preprocess import InvalidImage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None, registry: ModelRegistry | None = None) -> FastAPI:
    settings = settings or _settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.registry = (
            registry
            if registry is not None
            else load_service_registry(settings.models_dir, settings.tf_intra_op_threads, settings.tf_inter_op_threads)
        )
        yield

    app = FastAPI(title="HealixDZ AI service", lifespan=lifespan, docs_url=None, redoc_url=None)

    def require_token(x_service_token: str | None = Header(default=None)) -> None:
        expected = settings.service_token.encode()
        received = (x_service_token or "").encode()
        # Constant-time comparison; an unset token refuses everything.
        if not expected or not hmac.compare_digest(received, expected):
            raise HTTPException(status_code=401, detail={"code": "invalid_service_token"})

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/models", dependencies=[Depends(require_token)])
    def models() -> dict:
        return {"models": app.state.registry.status()}

    def read_image(image: UploadFile) -> bytes:
        data = image.file.read(settings.max_image_bytes + 1)
        if len(data) > settings.max_image_bytes:
            raise HTTPException(status_code=413, detail={"code": "image_too_large"})
        return data

    def run(analysis):
        """The analysis' result, or the HTTP error shared by every endpoint."""
        try:
            return analysis()
        except InvalidImage as error:
            raise HTTPException(status_code=422, detail={"code": "invalid_image", "reason": error.reason}) from error
        except InvalidMagnification as error:
            raise HTTPException(status_code=422, detail={"code": "invalid_magnification"}) from error
        except ImageTooSmall as error:
            raise HTTPException(status_code=422, detail={"code": "image_too_small", "minSide": NUCLEI_TILE}) from error
        except ImageDimensionsTooLarge as error:
            raise HTTPException(
                status_code=422, detail={"code": "image_dimensions_too_large", "maxSide": settings.nuclei_max_side}
            ) from error
        except ModelNotLoaded as error:
            raise HTTPException(status_code=503, detail={"code": "model_not_loaded"}) from error

    # Sync endpoints: FastAPI runs them in its thread pool, off the event loop.
    # Only the image bytes are received, never a patient identity.
    @app.post("/analyze/brain", dependencies=[Depends(require_token)])
    def analyze(image: UploadFile = File(...)) -> dict:
        data = read_image(image)
        return run(lambda: analyze_brain(data, app.state.registry, settings.max_image_pixels))

    @app.post("/analyze/pathology/breast-classification", dependencies=[Depends(require_token)])
    def breast_classification(image: UploadFile = File(...), magnification: str | None = Form(default=None)) -> dict:
        data = read_image(image)
        return run(lambda: analyze_breast(data, magnification, app.state.registry, settings.max_image_pixels))

    @app.post("/analyze/pathology/nuclei-segmentation", dependencies=[Depends(require_token)])
    def nuclei_segmentation(image: UploadFile = File(...)) -> dict:
        data = read_image(image)
        return run(
            lambda: analyze_nuclei(data, app.state.registry, settings.max_image_pixels, settings.nuclei_max_side)
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=_settings.host, port=_settings.port)
