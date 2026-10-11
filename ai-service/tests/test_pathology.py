from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.models import LoadedModel, ModelRegistry
from app.pathology_models import (
    BREAKHIS_CONFIG_FILE,
    BREAST_CLASSIFIER_ID,
    NUCLEI_CLASSES,
    NUCLEI_SEGMENTER_ID,
    PATHOLOGY_SPECS,
    load_pathology_model,
    load_pathology_models,
)
from app.pathology_pipeline import (
    NUCLEI_MARGIN,
    NUCLEI_STRIDE,
    NUCLEI_TILE,
    class_fractions,
    segment_nuclei_rgb,
    tile_grid,
)

from .conftest import MODELS_DIR, TOKEN, fake_registry, jpeg_bytes, make_client, png_bytes

AUTH = {"X-Service-Token": TOKEN}
BREAST_URL = "/analyze/pathology/breast-classification"
NUCLEI_URL = "/analyze/pathology/nuclei-segmentation"
CLASSIFIER_SPEC, SEGMENTER_SPEC = PATHOLOGY_SPECS

PATHOLOGY_WEIGHTS_PRESENT = all((MODELS_DIR / spec.file_name).is_file() for spec in PATHOLOGY_SPECS) and (
    MODELS_DIR / BREAKHIS_CONFIG_FILE
).is_file()
requires_pathology_weights = pytest.mark.skipif(
    not PATHOLOGY_WEIGHTS_PRESENT, reason=f"pathology weights not found in {MODELS_DIR}"
)


# --- Stand-in models ---------------------------------------------------------


class TopLeftRed:
    """Stands in for the BreakHis classifier: the red value of pixel (2, 2), / 255.

    Each view then scores the quadrant its flip brings to the top left, and
    the score reveals the input range (no /255 in the pipeline).
    """

    def __init__(self) -> None:
        self.inputs = []

    def __call__(self, batch, training=False):
        assert training is False
        batch = np.asarray(batch)
        self.inputs.append((batch.shape, batch.dtype))
        return batch[:, 2, 2, 0:1] / 255.0


class FixedScore:
    def __init__(self, score: float) -> None:
        self.score = score

    def __call__(self, batch, training=False):
        return np.full((np.asarray(batch).shape[0], 1), self.score, dtype=np.float32)


LABEL_STEP = 40  # red value of a pixel = its class index x 40


class RedEncodesClass:
    """Stands in for the PanNuke segmenter: the class written in the red channel.

    With corrupt_margin, the NUCLEI_MARGIN px along each tile's edges get
    another class: the tiled path must discard them.
    """

    def __init__(self, corrupt_margin: bool = False) -> None:
        self.corrupt_margin = corrupt_margin
        self.batches = []

    def __call__(self, batch, training=False):
        assert training is False
        batch = np.asarray(batch)
        self.batches.append(batch.shape)
        assert batch.dtype == np.float32 and batch.shape[1:] == (NUCLEI_TILE, NUCLEI_TILE, 3)
        assert 0.0 <= batch.min() and batch.max() <= 1.0
        labels = np.clip(np.rint(batch[..., 0] * 255.0 / LABEL_STEP), 0, len(NUCLEI_CLASSES) - 1).astype(int)
        if self.corrupt_margin:
            edge = np.ones((NUCLEI_TILE, NUCLEI_TILE), dtype=bool)
            edge[NUCLEI_MARGIN:-NUCLEI_MARGIN, NUCLEI_MARGIN:-NUCLEI_MARGIN] = False
            labels[:, edge] = (labels[:, edge] + 1) % len(NUCLEI_CLASSES)
        return np.eye(len(NUCLEI_CLASSES), dtype=np.float32)[labels]


def label_pattern(height: int, width: int) -> np.ndarray:
    rows, cols = np.mgrid[0:height, 0:width]
    return ((rows // 37 + cols // 53) % len(NUCLEI_CLASSES)).astype(np.uint8)


def encoded_rgb(labels: np.ndarray) -> np.ndarray:
    """RGB image whose red channel carries the labels (green and blue vary)."""
    height, width = labels.shape
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[..., 0] = labels * LABEL_STEP
    rgb[..., 1] = (np.arange(width) % 256)[np.newaxis, :]
    rgb[..., 2] = 200
    return rgb


def png_of_rgb(rgb: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    assert ok
    return encoded.tobytes()


def pathology_entry(spec, module, **values) -> LoadedModel:
    entry = LoadedModel(spec=spec, module=module, weights_sha256=f"sha-{spec.model_id}", config_file=spec.config_file, **values)
    if spec is CLASSIFIER_SPEC and module is not None:
        entry.config = {"threshold": 0.13}
    return entry


def pathology_registry(classifier=None, segmenter=None) -> ModelRegistry:
    """Brain stand-ins plus the two pathology models (None: not loaded)."""
    registry = fake_registry("glioma")
    for spec, module in ((CLASSIFIER_SPEC, classifier), (SEGMENTER_SPEC, segmenter)):
        entry = pathology_entry(spec, module)
        if module is None:
            entry.weights_sha256, entry.error = None, "weights_missing"
        registry.models[spec.model_id] = entry
    return registry


def classify(client, data: bytes, magnification="200", headers=AUTH):
    fields = {} if magnification is None else {"magnification": magnification}
    return client.post(BREAST_URL, files={"image": ("slide.png", data, "image/png")}, data=fields, headers=headers)


def segment(client, data: bytes, headers=AUTH):
    return client.post(NUCLEI_URL, files={"image": ("tile.png", data, "image/png")}, headers=headers)


def decode_label_map(body: dict) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(base64.b64decode(body["labelMapPng"]), np.uint8), cv2.IMREAD_UNCHANGED)


# --- Security and errors (same as /analyze/brain) ---------------------------


@pytest.mark.parametrize("headers", [{}, {"X-Service-Token": "wrong"}])
def test_both_endpoints_refuse_a_missing_or_wrong_token(headers):
    with make_client(pathology_registry(FixedScore(0.5), RedEncodesClass())) as client:
        assert classify(client, png_bytes(), headers=headers).status_code == 401
        assert segment(client, png_bytes(300, 300), headers=headers).status_code == 401


def test_both_endpoints_refuse_an_oversized_upload_with_413():
    with make_client(pathology_registry(FixedScore(0.5), RedEncodesClass()), max_image_bytes=100) as client:
        assert classify(client, png_bytes()).status_code == 413
        assert segment(client, png_bytes(300, 300)).status_code == 413


@pytest.mark.parametrize("data", [b"not an image", b"GIF89a" + b"\x00" * 64])
def test_both_endpoints_refuse_anything_but_png_or_jpeg_with_422(data):
    with make_client(pathology_registry(FixedScore(0.5), RedEncodesClass())) as client:
        for response in (classify(client, data), segment(client, data)):
            assert response.status_code == 422
            assert response.json()["detail"]["code"] == "invalid_image"


def test_both_endpoints_answer_503_when_their_model_is_not_loaded():
    with make_client(pathology_registry(None, None)) as client:
        for response in (classify(client, png_bytes()), segment(client, png_bytes(300, 300))):
            assert response.status_code == 503
            assert response.json()["detail"]["code"] == "model_not_loaded"


def test_a_registry_without_pathology_models_answers_503():
    with make_client(fake_registry("glioma")) as client:
        assert classify(client, png_bytes()).status_code == 503
        assert segment(client, png_bytes(300, 300)).status_code == 503


# --- Breast classification ----------------------------------------------------


@pytest.mark.parametrize("magnification", [None, "", "50", "40X", "x", "-40", "100.0", "4000"])
def test_rejects_a_missing_or_invalid_magnification_with_422(magnification):
    model = TopLeftRed()
    with make_client(pathology_registry(model, None)) as client:
        response = classify(client, png_bytes(), magnification=magnification)
    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "invalid_magnification"}
    assert model.inputs == []


@pytest.mark.parametrize("magnification", ["40", "100", "200", "400"])
def test_returns_the_magnification_without_feeding_it_to_the_model(magnification):
    with make_client(pathology_registry(FixedScore(0.4), None)) as client:
        body = classify(client, png_bytes(), magnification=magnification).json()
    assert body["magnification"] == int(magnification)
    assert body["malignancyScore"] == pytest.approx(0.4)


def test_four_view_tta_in_the_order_original_left_right_up_down_both():
    # Four uniform quadrants: each flip brings another one to the top left.
    red = {"top_left": 40, "top_right": 80, "bottom_left": 120, "bottom_right": 200}
    rgb = np.full((448, 448, 3), 30, dtype=np.uint8)
    rgb[:224, :224, 0] = red["top_left"]
    rgb[:224, 224:, 0] = red["top_right"]
    rgb[224:, :224, 0] = red["bottom_left"]
    rgb[224:, 224:, 0] = red["bottom_right"]
    model = TopLeftRed()

    with make_client(pathology_registry(model, None)) as client:
        body = classify(client, png_of_rgb(rgb)).json()

    # One batch of 4 views, 224 x 224, float32.
    assert model.inputs == [((4, 224, 224, 3), np.float32)]
    # Pixels kept in [0, 255]: not divided by 255 before the model.
    expected = [red[key] / 255 for key in ("top_left", "top_right", "bottom_left", "bottom_right")]
    assert body["views"] == pytest.approx(expected, abs=1e-6)
    assert body["malignancyScore"] == pytest.approx(sum(expected) / 4, abs=1e-6)


@pytest.mark.parametrize(
    ("score", "decision"),
    [(0.0, "benign"), (0.1299, "benign"), (0.13, "malignant"), (0.2, "malignant"), (1.0, "malignant")],
)
def test_the_calibrated_threshold_decides(score, decision):
    with make_client(pathology_registry(FixedScore(score), None)) as client:
        body = classify(client, png_bytes()).json()
    assert body["threshold"] == 0.13
    assert body["decision"] == decision


def test_breast_output_shape_says_score_never_probability():
    with make_client(pathology_registry(FixedScore(0.7), None)) as client:
        body = classify(client, jpeg_bytes()).json()
    assert set(body) == {
        "modelId", "weightsSha256", "malignancyScore", "threshold", "decision", "views", "magnification", "durationMs"
    }
    assert body["modelId"] == BREAST_CLASSIFIER_ID
    assert body["weightsSha256"] == f"sha-{BREAST_CLASSIFIER_ID}"
    assert len(body["views"]) == 4
    assert "probabilit" not in json.dumps(body).lower()


# --- Nuclei segmentation -------------------------------------------------------


@pytest.mark.parametrize("size", [(255, 400), (400, 255), (100, 100)])
def test_rejects_an_image_under_256_px_with_422(size):
    height, width = size
    with make_client(pathology_registry(None, RedEncodesClass())) as client:
        response = segment(client, png_bytes(width, height))
    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "image_too_small", "minSide": 256}


def test_rejects_an_image_over_the_configured_maximum_with_422():
    with make_client(pathology_registry(None, RedEncodesClass()), nuclei_max_side=512) as client:
        assert segment(client, png_bytes(512, 300)).status_code == 200
        response = segment(client, png_bytes(513, 300))
    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "image_dimensions_too_large", "maxSide": 512}


def test_a_256_image_takes_one_pass():
    labels = label_pattern(256, 256)
    model = RedEncodesClass()
    with make_client(pathology_registry(None, model)) as client:
        body = segment(client, png_of_rgb(encoded_rgb(labels))).json()
    assert model.batches == [(1, 256, 256, 3)]
    assert body["tiled"] is False
    assert body["tileCount"] == 1
    assert np.array_equal(decode_label_map(body), labels)


@pytest.mark.parametrize("size", [(256, 300), (300, 256), (448, 448), (500, 600), (700, 257)])
def test_a_larger_image_is_tiled_and_rebuilt_at_its_size(size):
    height, width = size
    labels = label_pattern(height, width)
    # The stand-in garbles each tile's margin: only the tile centres may reach the result.
    model = RedEncodesClass(corrupt_margin=True)

    with make_client(pathology_registry(None, model)) as client:
        body = segment(client, png_of_rgb(encoded_rgb(labels))).json()

    rows, cols = tile_grid(height, width)
    assert body["tiled"] is True
    assert body["tileCount"] == rows * cols == sum(shape[0] for shape in model.batches)
    label_map = decode_label_map(body)
    assert label_map.dtype == np.uint8 and label_map.shape == (height, width)
    assert np.array_equal(label_map, labels)


def test_tiles_overlap_by_32_px_and_keep_their_centre():
    assert (NUCLEI_TILE, NUCLEI_STRIDE, NUCLEI_MARGIN) == (256, 224, 16)
    # 600 px: 3 tiles of 224 px of centre, padded by mirroring to 3 x 224 + 32.
    assert tile_grid(600, 448) == (3, 2)


def test_mirrored_borders_feed_the_tiles():
    # A tile's first row comes from row 16 of the image, mirrored above it.
    seen = []

    class Recorder(RedEncodesClass):
        def __call__(self, batch, training=False):
            seen.append(np.asarray(batch)[0].copy())
            return super().__call__(batch, training)

    rgb = encoded_rgb(label_pattern(300, 300))
    rgb[..., 2] = np.arange(300, dtype=np.uint8)[:, np.newaxis] % 251  # blue: the row index
    entry = pathology_entry(SEGMENTER_SPEC, Recorder())
    segment_nuclei_rgb(rgb, entry)
    first_tile_rows = np.rint(seen[0][:, 0, 2] * 255).astype(int)
    assert first_tile_rows[:17].tolist() == list(range(16, 0, -1)) + [0]
    assert first_tile_rows[16:20].tolist() == [0, 1, 2, 3]


def test_class_fractions_background_of_all_pixels_and_types_of_nuclei_pixels():
    labels = np.zeros((10, 10), dtype=np.uint8)
    labels[0, :6] = 1  # 6 neoplastic
    labels[1, :3] = 2  # 3 inflammatory
    labels[2, :1] = 5  # 1 epithelial
    fractions = class_fractions(labels)
    assert fractions["background"] == pytest.approx(0.9)
    assert fractions["nucleusTypes"] == pytest.approx(
        {"neoplastic": 0.6, "inflammatory": 0.3, "connective": 0.0, "dead": 0.0, "epithelial": 0.1}
    )
    assert class_fractions(np.zeros((4, 4), dtype=np.uint8)) == {"background": 1.0, "nucleusTypes": None}


def test_nuclei_output_shape_has_no_nucleus_count():
    with make_client(pathology_registry(None, RedEncodesClass())) as client:
        body = segment(client, png_of_rgb(encoded_rgb(label_pattern(256, 256)))).json()
    assert set(body) == {"modelId", "weightsSha256", "labelMapPng", "classFractions", "tiled", "tileCount", "durationMs"}
    assert body["modelId"] == NUCLEI_SEGMENTER_ID
    assert set(np.unique(decode_label_map(body))) <= set(range(6))


def test_models_lists_the_pathology_models_after_the_brain_ones():
    with make_client(pathology_registry(FixedScore(0.5), None)) as client:
        models = client.get("/models", headers=AUTH).json()["models"]
    assert [model["modelId"] for model in models][-2:] == [BREAST_CLASSIFIER_ID, NUCLEI_SEGMENTER_ID]
    breast, nuclei = models[-2:]
    assert breast["loaded"] is True and breast["config"]["file"] == BREAKHIS_CONFIG_FILE
    assert nuclei["loaded"] is False and nuclei["error"] == "weights_missing"


# --- Weight loading (tiny Keras models) ---------------------------------------


def save_classifier(folder: Path, outputs: int = 1, lambda_layer: bool = False) -> None:
    import keras

    inputs = keras.Input((224, 224, 3))
    x = keras.layers.GlobalAveragePooling2D()(inputs)
    if lambda_layer:
        x = keras.layers.Lambda(lambda value: value * 1.0)(x)
    keras.Model(inputs, keras.layers.Dense(outputs, activation="sigmoid")(x)).save(folder / CLASSIFIER_SPEC.file_name)


def write_config(folder: Path, **overrides) -> None:
    config = {"decision_threshold": 0.13, "positive_class": "malignant", "class_names": ["benign", "malignant"]}
    config.update(overrides)
    (folder / BREAKHIS_CONFIG_FILE).write_text(json.dumps(config), encoding="utf-8")


def test_a_valid_model_and_config_load_with_both_sha256(tmp_path):
    save_classifier(tmp_path)
    write_config(tmp_path)
    entry = load_pathology_model(CLASSIFIER_SPEC, tmp_path)
    assert entry.loaded and entry.error is None
    assert entry.config == {"threshold": 0.13}
    assert len(entry.weights_sha256) == 64 and len(entry.config_sha256) == 64
    assert entry.status()["config"] == {"file": BREAKHIS_CONFIG_FILE, "sha256": entry.config_sha256}


@pytest.mark.parametrize(
    "overrides",
    [{"decision_threshold": 0.5}, {"decision_threshold": "0.13"}, {"decision_threshold": None}, {"positive_class": "benign"}],
)
def test_another_threshold_or_positive_class_refuses_to_load(tmp_path, overrides):
    save_classifier(tmp_path)
    write_config(tmp_path, **overrides)
    entry = load_pathology_model(CLASSIFIER_SPEC, tmp_path)
    assert not entry.loaded
    assert entry.error == "config_invalid"


def test_a_missing_config_refuses_to_load(tmp_path):
    save_classifier(tmp_path)
    entry = load_pathology_model(CLASSIFIER_SPEC, tmp_path)
    assert (entry.loaded, entry.error) == (False, "config_missing")


def test_missing_unreadable_or_mismatched_weights_stay_unloaded(tmp_path):
    write_config(tmp_path)
    assert load_pathology_model(CLASSIFIER_SPEC, tmp_path).error == "weights_missing"

    (tmp_path / CLASSIFIER_SPEC.file_name).write_bytes(b"not a keras archive")
    entry = load_pathology_model(CLASSIFIER_SPEC, tmp_path)
    assert (entry.loaded, entry.error) == (False, "load_failed")
    assert entry.weights_sha256 is not None

    save_classifier(tmp_path, outputs=2)  # another output shape
    assert load_pathology_model(CLASSIFIER_SPEC, tmp_path).error == "load_failed"


def test_safe_mode_refuses_python_code_in_the_archive(tmp_path):
    save_classifier(tmp_path, lambda_layer=True)
    write_config(tmp_path)
    entry = load_pathology_model(CLASSIFIER_SPEC, tmp_path)
    assert (entry.loaded, entry.error) == (False, "load_failed")


# --- Real weights (skipped when absent) ---------------------------------------


@pytest.fixture(scope="module")
def real_pathology_registry() -> ModelRegistry:
    if not PATHOLOGY_WEIGHTS_PRESENT:
        pytest.skip(f"pathology weights not found in {MODELS_DIR}")
    registry = fake_registry("glioma")
    registry.models.update(load_pathology_models(MODELS_DIR))
    return registry


@requires_pathology_weights
def test_real_pathology_models_load_with_their_sha256(real_pathology_registry):
    with make_client(real_pathology_registry) as client:
        models = {model["modelId"]: model for model in client.get("/models", headers=AUTH).json()["models"]}
    for model_id in (BREAST_CLASSIFIER_ID, NUCLEI_SEGMENTER_ID):
        assert models[model_id]["loaded"] is True and models[model_id]["error"] is None
        assert len(models[model_id]["weightsSha256"]) == 64
    assert len(models[BREAST_CLASSIFIER_ID]["config"]["sha256"]) == 64


@requires_pathology_weights
@pytest.mark.parametrize("make_image", [png_bytes, jpeg_bytes])
def test_real_breast_classification_output(real_pathology_registry, make_image):
    with make_client(real_pathology_registry) as client:
        first = classify(client, make_image(), magnification="400").json()
        second = classify(client, make_image(), magnification="400").json()
    assert first["threshold"] == 0.13
    assert len(first["views"]) == 4 and all(0.0 <= value <= 1.0 for value in first["views"])
    assert first["malignancyScore"] == pytest.approx(np.mean(first["views"]), abs=1e-6)
    assert first["decision"] == ("malignant" if first["malignancyScore"] >= 0.13 else "benign")
    assert {key: first[key] for key in first if key != "durationMs"} == {
        key: second[key] for key in second if key != "durationMs"
    }


@requires_pathology_weights
def test_real_tta_matches_four_separate_passes(real_pathology_registry):
    import tensorflow as tf

    from app.pathology_pipeline import breakhis_input, tta_scores, tta_views

    model = real_pathology_registry.get(BREAST_CLASSIFIER_ID).module
    rng = np.random.default_rng(7)
    image = breakhis_input((rng.random((460, 700, 3)) * 255).astype(np.uint8))
    separate = [
        float(model(tf.expand_dims(view, 0), training=False)[0, 0])
        for view in (image, tf.image.flip_left_right(image), tf.image.flip_up_down(image),
                     tf.image.flip_up_down(tf.image.flip_left_right(image)))
    ]
    scores, mean = tta_scores(model, tta_views(image))
    assert scores.tolist() == pytest.approx(separate, abs=1e-5)
    assert float(mean) == pytest.approx(sum(separate) / 4, abs=1e-5)


@requires_pathology_weights
@pytest.mark.parametrize("size", [(256, 256), (300, 520)])
def test_real_nuclei_segmentation_output(real_pathology_registry, size):
    height, width = size
    rng = np.random.default_rng(3)
    rgb = (rng.random((height, width, 3)) * 255).astype(np.uint8)
    with make_client(real_pathology_registry) as client:
        body = segment(client, png_of_rgb(rgb)).json()
    label_map = decode_label_map(body)
    assert label_map.shape == (height, width)
    assert set(np.unique(label_map)) <= set(range(6))
    assert body["tiled"] is (size != (256, 256))
    fractions = body["classFractions"]
    assert 0.0 <= fractions["background"] <= 1.0
    if fractions["nucleusTypes"] is not None:
        assert math.isclose(sum(fractions["nucleusTypes"].values()), 1.0, abs_tol=1e-9)


def test_the_default_pathology_files_are_the_named_ones():
    assert [spec.file_name for spec in PATHOLOGY_SPECS] == [
        "EfficientNetB0_BreakHis_phase2.keras",
        "pannuke_unet_efficientnetb0_phase2_best.keras",
    ]
    assert os.path.basename(BREAKHIS_CONFIG_FILE) == "breakhis_inference_config.json"
