"""Cardiac MRI segmentation (cardio-seg-acdc-unet-effb4): fidelity to the
notebook, input formats (PNG/JPEG, single-frame DICOM), refusals, endpoint.

The fixtures (tests/fixtures/cardio-seg/) are 3 ACDC test slices and the
class maps the notebook's model gave them; tests that need the weights are
skipped without them.
"""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import cv2
import numpy as np
import pytest
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.filewriter import dcmwrite
from pydicom.uid import ExplicitVRLittleEndian, MRImageStorage, generate_uid

from app.cardio_seg_input import CardioSegInputError, channel_spread, read_slice
from app.cardio_seg_models import (
    CARDIO_SEG_MODEL_ID,
    CARDIO_SEG_SPEC,
    STRUCTURES,
    load_cardio_seg_model,
    read_model_card,
)
from app.cardio_seg_pipeline import (
    CARDIO_SEG_PALETTE,
    CARDIO_SEG_PALETTE_FILE,
    analyze_cardio_seg,
    load_cardio_seg_palette,
    structure_areas,
    to_uint8,
)
from app.label_maps import ImageDimensionsTooLarge, ImageTooSmall
from app.models import LoadedModel, ModelRegistry
from app.preprocess import InvalidImage

from .conftest import MODELS_DIR, TOKEN, make_client

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "cardio-seg"
FIXTURES = json.loads((FIXTURES_DIR / "acdc_fixtures.json").read_text(encoding="utf-8"))["fixtures"]
AUTH = {"X-Service-Token": TOKEN}
URL = "/analyze/cardio/segmentation-mri"
MAX_PIXELS = 50_000_000

WEIGHTS_PRESENT = (MODELS_DIR / CARDIO_SEG_SPEC.file_name).is_file() and (
    MODELS_DIR / CARDIO_SEG_SPEC.config_file
).is_file()


@pytest.fixture(scope="module")
def seg_registry() -> ModelRegistry:
    if not WEIGHTS_PRESENT:
        pytest.skip(f"cardiac MRI weights not found in {MODELS_DIR}")
    entry = load_cardio_seg_model(MODELS_DIR)
    assert entry.loaded, entry.error
    return ModelRegistry(models={CARDIO_SEG_MODEL_ID: entry})


def unloaded_registry() -> ModelRegistry:
    return ModelRegistry(models={CARDIO_SEG_MODEL_ID: LoadedModel(spec=CARDIO_SEG_SPEC, error="weights_missing")})


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


def fixture_pixels(name: str) -> np.ndarray:
    return cv2.imread(str(FIXTURES_DIR / name), cv2.IMREAD_UNCHANGED)


def decode_png(encoded: str) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(base64.b64decode(encoded), dtype=np.uint8), cv2.IMREAD_UNCHANGED)


def png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


def dicom_bytes(
    frames: list[np.ndarray],
    spacing: list[float] | None = None,
    photometric: str = "MONOCHROME2",
) -> bytes:
    """A DICOM MR file of 8-bit grey frames (one frame: a single-frame file)."""
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = MRImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    dataset = Dataset()
    dataset.file_meta = meta
    dataset.SOPClassUID = MRImageStorage
    dataset.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    dataset.Modality = "MR"
    dataset.Rows, dataset.Columns = frames[0].shape
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = photometric
    dataset.BitsAllocated = 8
    dataset.BitsStored = 8
    dataset.HighBit = 7
    dataset.PixelRepresentation = 0
    if len(frames) > 1:
        dataset.NumberOfFrames = len(frames)
    if spacing is not None:
        dataset.PixelSpacing = spacing
    dataset.PixelData = np.stack(frames).astype(np.uint8).tobytes()
    buffer = io.BytesIO()
    dcmwrite(buffer, dataset, enforce_file_format=True)
    return buffer.getvalue()


# --- Fidelity to the notebook -------------------------------------------------------


@pytest.mark.parametrize("fixture", FIXTURES, ids=[fixture["image"] for fixture in FIXTURES])
def test_class_map_is_the_notebooks_pixel_for_pixel(seg_registry, fixture):
    result = analyze_cardio_seg(fixture_bytes(fixture["image"]), seg_registry, MAX_PIXELS)

    labels = decode_png(result["labelMapPng"])
    expected = fixture_pixels(fixture["expected_mask"])
    assert labels.shape == expected.shape == tuple(fixture["shape"])
    assert np.array_equal(labels, expected)
    counts = np.bincount(labels.ravel(), minlength=4)
    assert {str(index): int(count) for index, count in enumerate(counts)} == fixture["expected_pixels"]
    assert {name: result["structures"][name]["pixels"] for name in STRUCTURES} == {
        "LV": fixture["expected_pixels"]["1"],
        "RV": fixture["expected_pixels"]["2"],
        "MYO": fixture["expected_pixels"]["3"],
    }
    # A PNG gives no pixel spacing: pixels only, never mm².
    assert result["pixelSpacingMm"] is None
    assert all(result["structures"][name]["areaMm2"] is None for name in STRUCTURES)
    assert result["noStructureFound"] is False


def test_result_holds_the_overlay_and_the_model_identity_but_no_diagnosis(seg_registry):
    fixture = FIXTURES[0]
    result = analyze_cardio_seg(fixture_bytes(fixture["image"]), seg_registry, MAX_PIXELS)

    assert result["modelId"] == CARDIO_SEG_MODEL_ID
    assert len(result["weightsSha256"]) == 64 and len(result["configSha256"]) == 64
    overlay = decode_png(result["overlayPng"])
    labels = decode_png(result["labelMapPng"])
    assert overlay.shape == (*labels.shape, 4)
    # Background transparent, each structure opaque in its palette colour (BGRA).
    assert (overlay[labels == 0][:, 3] == 0).all()
    for index, name in enumerate(STRUCTURES, start=1):
        colour = CARDIO_SEG_PALETTE[name]
        bgr = [int(colour[offset : offset + 2], 16) for offset in (5, 3, 1)]
        assert (overlay[labels == index] == [*bgr, 255]).all()
    text = json.dumps({key: value for key, value in result.items() if not key.endswith("Png")}).lower()
    for word in ("ejection", "fraction", "volume", "diagnos", "urgen"):
        assert word not in text


def test_a_dicom_gives_the_same_map_and_areas_in_mm2(seg_registry):
    fixture = FIXTURES[0]
    pixels = fixture_pixels(fixture["image"])
    from_png = analyze_cardio_seg(fixture_bytes(fixture["image"]), seg_registry, MAX_PIXELS)
    from_dicom = analyze_cardio_seg(dicom_bytes([pixels], spacing=[1.5, 1.5]), seg_registry, MAX_PIXELS)

    assert np.array_equal(decode_png(from_dicom["labelMapPng"]), decode_png(from_png["labelMapPng"]))
    assert from_dicom["pixelSpacingMm"] == [1.5, 1.5]
    for name in STRUCTURES:
        area = from_dicom["structures"][name]
        assert area["pixels"] == from_png["structures"][name]["pixels"]
        assert area["areaMm2"] == pytest.approx(area["pixels"] * 2.25)


def test_a_monochrome1_dicom_is_inverted_first(seg_registry):
    fixture = FIXTURES[1]
    pixels = fixture_pixels(fixture["image"])
    inverted = dicom_bytes([255 - pixels], photometric="MONOCHROME1")

    result = analyze_cardio_seg(inverted, seg_registry, MAX_PIXELS)

    assert np.array_equal(decode_png(result["labelMapPng"]), fixture_pixels(fixture["expected_mask"]))
    assert result["pixelSpacingMm"] is None


def test_an_empty_slice_finds_no_structure_without_error(seg_registry):
    result = analyze_cardio_seg(png(np.zeros((200, 180), dtype=np.uint8)), seg_registry, MAX_PIXELS)

    assert result["noStructureFound"] is True
    assert all(area["pixels"] == 0 for area in result["structures"].values())


# --- Preprocessing --------------------------------------------------------------------


def test_to_uint8_zscores_the_pixels_above_zero_only():
    image = np.zeros((4, 4), dtype=np.float32)
    image[1:3, 1:3] = [[10, 20], [30, 40]]
    out = to_uint8(image)

    # The background stays at 0 before the rescale: (0 + 3) / 6 * 255 -> 127.
    assert (out[image == 0] == 127).all()
    values = image[image > 0]
    expected = ((np.clip((values - values.mean()) / (values.std() + 1e-8), -3, 3) + 3) / 6 * 255).astype(np.uint8)
    assert np.array_equal(out[image > 0], expected)
    # No pixel above 0: nothing is z-scored.
    assert (to_uint8(np.zeros((3, 3), dtype=np.float32)) == 127).all()


def test_areas_are_in_mm2_only_with_a_spacing():
    labels = np.array([[0, 1, 1], [2, 3, 3]], dtype=np.uint8)
    assert structure_areas(labels, None) == {
        "LV": {"areaMm2": None, "pixels": 2},
        "RV": {"areaMm2": None, "pixels": 1},
        "MYO": {"areaMm2": None, "pixels": 2},
    }
    assert structure_areas(labels, (0.5, 2.0))["MYO"] == {"areaMm2": 2.0, "pixels": 2}


def test_the_palette_is_okabe_ito_and_validated(tmp_path):
    assert CARDIO_SEG_PALETTE == {"LV": "#D55E00", "MYO": "#009E73", "RV": "#0072B2"}
    assert CARDIO_SEG_PALETTE == json.loads(CARDIO_SEG_PALETTE_FILE.read_text(encoding="utf-8"))
    for palette in ({"LV": "#D55E00", "RV": "#0072B2"}, {"LV": "red", "RV": "#0072B2", "MYO": "#009E73"}):
        path = tmp_path / "palette.json"
        path.write_text(json.dumps(palette), encoding="utf-8")
        with pytest.raises(ValueError):
            load_cardio_seg_palette(path)


# --- Input refusals (no weights needed) ------------------------------------------------


def test_a_coloured_image_is_not_an_mri_slice():
    image = np.zeros((128, 128, 3), dtype=np.uint8)
    image[..., 2] = 200  # red (BGR)
    with pytest.raises(CardioSegInputError) as error:
        read_slice(png(image), MAX_PIXELS)
    assert error.value.code == "cardio_seg_not_grayscale"
    # A grey image saved in colour is read as grey.
    grey = np.dstack([fixture_pixels(FIXTURES[0]["image"])] * 3)
    assert channel_spread(grey) == 0
    assert np.array_equal(read_slice(png(grey), MAX_PIXELS).pixels, fixture_pixels(FIXTURES[0]["image"]))


def test_a_multiframe_dicom_is_refused():
    frame = fixture_pixels(FIXTURES[0]["image"])
    with pytest.raises(CardioSegInputError) as error:
        read_slice(dicom_bytes([frame, frame]), MAX_PIXELS)
    assert error.value.code == "cardio_seg_multiframe"


def test_sides_must_be_64_to_1024_pixels():
    with pytest.raises(ImageTooSmall) as small:
        read_slice(png(np.full((40, 40), 80, dtype=np.uint8)), MAX_PIXELS)
    assert small.value.min_side == 64
    with pytest.raises(ImageDimensionsTooLarge) as large:
        read_slice(png(np.full((2000, 2000), 80, dtype=np.uint8)), MAX_PIXELS)
    assert large.value.max_side == 1024


def test_random_bytes_and_a_corrupt_dicom_are_invalid_images():
    rng = np.random.default_rng(0)
    with pytest.raises(InvalidImage):
        read_slice(rng.integers(0, 256, 4096, dtype=np.uint8).tobytes(), MAX_PIXELS)
    corrupt = bytearray(dicom_bytes([fixture_pixels(FIXTURES[0]["image"])]))
    with pytest.raises(InvalidImage):
        read_slice(bytes(corrupt[: len(corrupt) // 2]), MAX_PIXELS)


# --- Model card and loading ---------------------------------------------------------------


def test_the_committed_model_card_is_the_deployed_one():
    committed = FIXTURES_DIR / "model-card.json"
    assert read_model_card(committed)["input_size"] == 256
    deployed = MODELS_DIR / CARDIO_SEG_SPEC.config_file
    if not deployed.is_file():
        pytest.skip(f"model card not found in {MODELS_DIR}")
    assert committed.read_bytes() == deployed.read_bytes()


def test_the_card_drives_the_architecture():
    config = read_model_card(FIXTURES_DIR / "model-card.json")
    assert config["build"] == {
        "classes": 4,
        "decoder_channels": (256, 128, 64, 32, 16),
        "encoder_name": "efficientnet-b4",
        "in_channels": 3,
    }
    assert config["labels"][0] == "fond" and len(config["labels"]) == 4


def test_weights_that_are_not_the_cards_stay_unloaded(tmp_path):
    (tmp_path / CARDIO_SEG_SPEC.file_name).write_bytes(b"not the weights")
    (tmp_path / CARDIO_SEG_SPEC.config_file).write_bytes((FIXTURES_DIR / "model-card.json").read_bytes())

    entry = load_cardio_seg_model(tmp_path)

    assert not entry.loaded
    assert entry.error == "weights_sha256_mismatch"
    assert entry.status()["config"]["file"] == CARDIO_SEG_SPEC.config_file


# --- Endpoint -------------------------------------------------------------------------------


def test_the_endpoint_refuses_a_request_without_token():
    with make_client(unloaded_registry()) as client:
        response = client.post(URL, files={"image": ("slice.png", fixture_bytes(FIXTURES[0]["image"]), "image/png")})
    assert response.status_code == 401


def test_the_endpoint_answers_503_without_the_model_and_422_for_refused_inputs():
    with make_client(unloaded_registry()) as client:
        missing = client.post(URL, headers=AUTH, files={"image": ("s.png", fixture_bytes(FIXTURES[0]["image"]), "image/png")})
        multiframe = client.post(
            URL,
            headers=AUTH,
            files={"image": ("s.dcm", dicom_bytes([fixture_pixels(FIXTURES[0]["image"])] * 2), "application/dicom")},
        )
        small = client.post(URL, headers=AUTH, files={"image": ("s.png", png(np.zeros((40, 40), np.uint8)), "image/png")})
    assert missing.status_code == 503 and missing.json()["detail"]["code"] == "model_not_loaded"
    assert multiframe.status_code == 422 and multiframe.json()["detail"]["code"] == "cardio_seg_multiframe"
    assert small.json()["detail"] == {"code": "image_too_small", "minSide": 64}


def test_models_lists_the_model_with_both_sha256_and_the_endpoint_answers(seg_registry):
    with make_client(seg_registry) as client:
        status = client.get("/models", headers=AUTH).json()["models"]
        response = client.post(URL, headers=AUTH, files={"image": ("s.png", fixture_bytes(FIXTURES[2]["image"]), "image/png")})

    model = next(entry for entry in status if entry["modelId"] == CARDIO_SEG_MODEL_ID)
    assert model["loaded"] is True
    assert model["weightsSha256"] == read_model_card(MODELS_DIR / CARDIO_SEG_SPEC.config_file)["sha256"]
    assert model["config"]["file"] == CARDIO_SEG_SPEC.config_file and len(model["config"]["sha256"]) == 64
    assert response.status_code == 200
    assert response.json()["structures"]["LV"]["pixels"] == FIXTURES[2]["expected_pixels"]["1"]
