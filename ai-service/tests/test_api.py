from __future__ import annotations

import base64
import math

import cv2
import numpy as np
import pytest

from app.models import (
    CLASS_LABELS,
    CLASSIFIER_ID,
    MENINGIOMA_SEGMENTER_ID,
    PITUITARY_SEGMENTER_ID,
)

from .conftest import TOKEN, fake_registry, jpeg_bytes, make_client, png_bytes, requires_weights

AUTH = {"X-Service-Token": TOKEN}


def analyze(client, data: bytes, headers=AUTH, name="image.png", content_type="image/png"):
    return client.post("/analyze/brain", files={"image": (name, data, content_type)}, headers=headers)


# --- Security ---------------------------------------------------------------


def test_health_needs_no_token():
    with make_client(fake_registry("glioma")) as client:
        assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("headers", [{}, {"X-Service-Token": "wrong"}, {"X-Service-Token": ""}])
def test_analyze_and_models_refuse_a_missing_or_wrong_token(headers):
    with make_client(fake_registry("glioma")) as client:
        assert analyze(client, png_bytes(), headers=headers).status_code == 401
        assert client.get("/models", headers=headers).status_code == 401


def test_an_unset_service_token_refuses_everything():
    with make_client(fake_registry("glioma"), service_token="") as client:
        assert analyze(client, png_bytes(), headers={"X-Service-Token": ""}).status_code == 401


# --- Input validation -------------------------------------------------------


@pytest.mark.parametrize(
    "data",
    [
        b"not an image at all",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,  # PNG signature, garbage body
        b"GIF89a" + b"\x00" * 64,  # decodable by some libraries, not accepted
        cv2.imencode(".bmp", np.zeros((50, 50, 3), np.uint8))[1].tobytes(),
    ],
)
def test_rejects_anything_but_a_decodable_png_or_jpeg_with_422(data):
    with make_client(fake_registry("glioma")) as client:
        response = analyze(client, data)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_image"


def test_rejects_an_oversized_upload_with_413():
    with make_client(fake_registry("glioma"), max_image_bytes=100) as client:
        assert analyze(client, png_bytes()).status_code == 413


def test_answers_503_when_the_classifier_is_not_loaded():
    with make_client(fake_registry(None)) as client:
        response = analyze(client, png_bytes())
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "model_not_loaded"


# --- Routing (stand-in modules, deterministic) ------------------------------


@pytest.mark.parametrize("label", ["glioma", "notumor"])
def test_glioma_and_notumor_get_no_segmentation(label):
    with make_client(fake_registry(label)) as client:
        body = analyze(client, png_bytes()).json()
    assert body["classification"]["predictions"][0]["label"] == label
    assert body["segmentation"] is None
    assert body["segmentationSkippedReason"] == "not_applicable_for_class"


@pytest.mark.parametrize(
    ("label", "segmenter_id"),
    [("meningioma", MENINGIOMA_SEGMENTER_ID), ("pituitary", PITUITARY_SEGMENTER_ID)],
)
def test_meningioma_and_pituitary_route_to_their_own_segmenter(label, segmenter_id):
    with make_client(fake_registry(label)) as client:
        body = analyze(client, png_bytes(320, 240)).json()
    segmentation = body["segmentation"]
    assert body["segmentationSkippedReason"] is None
    assert segmentation["modelId"] == segmenter_id
    assert segmentation["weightsSha256"] == f"sha-{segmenter_id}"

    # Mask: one-channel PNG at the original size; its area matches areaPx.
    mask = cv2.imdecode(np.frombuffer(base64.b64decode(segmentation["maskPng"]), np.uint8), cv2.IMREAD_UNCHANGED)
    assert mask.shape == (240, 320)
    assert set(np.unique(mask)) <= {0, 255}
    assert segmentation["areaPx"] == int(np.count_nonzero(mask))
    assert math.isclose(segmentation["areaRatio"], segmentation["areaPx"] / (320 * 240))
    # The stand-in marks the central quarter: half the width and the height.
    assert math.isclose(segmentation["areaRatio"], 0.25, abs_tol=0.01)


def test_a_missing_segmenter_is_reported_not_silently_skipped():
    with make_client(fake_registry("meningioma", segmenters_loaded=False)) as client:
        body = analyze(client, png_bytes()).json()
    assert body["segmentation"] is None
    assert body["segmentationSkippedReason"] == "model_not_loaded"


# --- Real weights (skipped when absent) -------------------------------------


@requires_weights
def test_models_reports_the_three_loaded_models_with_their_sha256(real_registry):
    with make_client(real_registry) as client:
        models = client.get("/models", headers=AUTH).json()["models"]
    assert [model["modelId"] for model in models] == [
        CLASSIFIER_ID,
        MENINGIOMA_SEGMENTER_ID,
        PITUITARY_SEGMENTER_ID,
    ]
    for model in models:
        assert model["loaded"] is True
        assert model["error"] is None
        assert len(model["weightsSha256"]) == 64


@requires_weights
@pytest.mark.parametrize("make_image", [png_bytes, jpeg_bytes])
def test_output_shape_with_the_real_weights(real_registry, make_image):
    data = make_image()
    with make_client(real_registry) as client:
        body = analyze(client, data).json()

    predictions = body["classification"]["predictions"]
    assert body["classification"]["modelId"] == CLASSIFIER_ID
    assert len(predictions) == 4
    assert sorted(prediction["label"] for prediction in predictions) == sorted(CLASS_LABELS)
    assert math.isclose(sum(prediction["probability"] for prediction in predictions), 1.0, abs_tol=1e-4)
    assert [p["probability"] for p in predictions] == sorted((p["probability"] for p in predictions), reverse=True)

    decoded = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    assert (body["imageHeight"], body["imageWidth"]) == decoded.shape[:2]

    top = predictions[0]["label"]
    if top in ("glioma", "notumor"):
        assert body["segmentation"] is None
        assert body["segmentationSkippedReason"] == "not_applicable_for_class"
    else:
        expected = MENINGIOMA_SEGMENTER_ID if top == "meningioma" else PITUITARY_SEGMENTER_ID
        assert body["segmentation"]["modelId"] == expected


@requires_weights
def test_one_deterministic_pass(real_registry):
    with make_client(real_registry) as client:
        first = analyze(client, png_bytes()).json()
        second = analyze(client, png_bytes()).json()
    assert first["classification"] == second["classification"]
    assert first["segmentation"] == second["segmentation"]
