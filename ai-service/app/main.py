"""FastAPI entry point: uvicorn app.main:app (or python -m app.main)."""

from __future__ import annotations

import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile

from .config import Settings, load_settings

_settings = load_settings()
# Read by OpenCV when decoding: refuses decompression bombs before allocation.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(_settings.max_image_pixels))

from .models import ModelRegistry, load_registry  # noqa: E402
from .pipeline import ModelNotLoaded, analyze_brain  # noqa: E402
from .preprocess import InvalidImage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None, registry: ModelRegistry | None = None) -> FastAPI:
    settings = settings or _settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.registry = registry if registry is not None else load_registry(settings.models_dir)
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

    # Sync endpoint: FastAPI runs it in its thread pool, off the event loop.
    # Only the image bytes are received, never a patient identity.
    @app.post("/analyze/brain", dependencies=[Depends(require_token)])
    def analyze(image: UploadFile = File(...)) -> dict:
        data = image.file.read(settings.max_image_bytes + 1)
        if len(data) > settings.max_image_bytes:
            raise HTTPException(status_code=413, detail={"code": "image_too_large"})

        try:
            return analyze_brain(data, app.state.registry, settings.max_image_pixels)
        except InvalidImage as error:
            raise HTTPException(status_code=422, detail={"code": "invalid_image", "reason": error.reason}) from error
        except ModelNotLoaded as error:
            raise HTTPException(status_code=503, detail={"code": "model_not_loaded"}) from error

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=_settings.host, port=_settings.port)
