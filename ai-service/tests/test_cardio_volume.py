"""Cardiac volumetry from a cine stack: reading the ZIP (both usual DICOM
organisations, the refusals, the warnings), the pipeline on a synthetic phantom
of known volume, the batch against the one-by-one inference with the real
weights, and the endpoint.

The phantom is a stack of 8 slices x 10 phases of 256 x 256 pixels: a LV cavity
shaped as half an ellipsoid (a base disc that narrows toward the apex), a ring
of myocardium around it and a RV disc beside it, the LV radius following a
cosine over the cycle. A stand-in model (OracleSegmenter) answers with those
masks in the order the pipeline segments the images, so what is tested is the
reading, the areas, the volumes, ED and ES and the orientation, not the weights.
"""

from __future__ import annotations

import base64
import io
import math
import zipfile
from pathlib import Path

import cv2
import numpy as np
import pytest
import torch
from torch import nn

from app import cardio_volume_input
from app.cardio_seg_models import CARDIO_SEG_MODEL_ID, CARDIO_SEG_SPEC, load_cardio_seg_model, read_model_card
from app.cardio_seg_pipeline import predict_labels, predict_labels_batch
from app.cardio_volume_input import CardioVolumeInputError, read_cine_stack
from app.cardio_volume_pipeline import analyze_cardio_volume, base_first
from app.models import LoadedModel, ModelRegistry
from scripts.make_sample_cine_dicom import cine_files, write_dicom, zip_bytes

from .conftest import MODELS_DIR, TOKEN, make_client

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "cardio-seg"
CARD_FILE = FIXTURES_DIR / "model-card.json"
AUTH = {"X-Service-Token": TOKEN}
URL = "/analyze/cardio/volume-mri"
MAX_PIXELS = 50_000_000

SIZE = 256
PIXEL_MM = 1.5
GAP_MM = 8.0
SLICES = 8
PHASES = 10
ED_RADIUS_PX, ES_RADIUS_PX = 48.0, 30.0
WEIGHTS_PRESENT = (MODELS_DIR / CARDIO_SEG_SPEC.file_name).is_file() and (MODELS_DIR / CARDIO_SEG_SPEC.config_file).is_file()


# --- The phantom -----------------------------------------------------------------------


def base_radius(phase: int) -> float:
    """LV radius at the base, px: a cosine from ED (phase 0) to ES (the middle phase)."""
    mean, amplitude = (ED_RADIUS_PX + ES_RADIUS_PX) / 2, (ED_RADIUS_PX - ES_RADIUS_PX) / 2
    return mean + amplitude * math.cos(2 * math.pi * phase / PHASES)


def slice_masks(phase: int, index: int) -> np.ndarray:
    """Class map (1 LV, 2 RV, 3 MYO) of one slice: LV radius r(z) = R sqrt(1 - z²), z in (0, 1) from the base."""
    z = (index + 0.5) / SLICES
    radius = base_radius(phase) * math.sqrt(1 - z * z)
    rows, columns = np.mgrid[0:SIZE, 0:SIZE]
    centre = SIZE // 2
    distance = np.hypot(rows - centre, columns - centre)
    labels = np.zeros((SIZE, SIZE), dtype=np.uint8)
    labels[distance <= radius + 8] = 3
    labels[distance <= radius] = 1
    rv_radius = 0.6 * radius
    rv_centre = centre + radius + 8 + rv_radius + 4
    labels[np.hypot(rows - centre, columns - rv_centre) <= rv_radius] = 2
    return labels


def phantom_masks() -> list[list[np.ndarray]]:
    return [[slice_masks(phase, index) for index in range(SLICES)] for phase in range(PHASES)]


def mask_volume_ml(masks: list[list[np.ndarray]], phase: int, label: int) -> float:
    pixels = sum(int((slice_ == label).sum()) for slice_ in masks[phase])
    return pixels * PIXEL_MM * PIXEL_MM * GAP_MM / 1000


class OracleSegmenter(nn.Module):
    """Answers with the masks it was given, in the order it is asked: phase by
    phase, slice by slice (the order of analyze_cardio_volume)."""

    def __init__(self, masks: list[list[np.ndarray]]) -> None:
        super().__init__()
        self.queue = [slice_ for phase in masks for slice_ in phase]
        self.cursor = 0

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        count = x.shape[0]
        chosen = self.queue[self.cursor : self.cursor + count]
        self.cursor += count
        assert len(chosen) == count, "more images than masks"
        logits = torch.full((count, 4, SIZE, SIZE), -10.0)
        for index, labels in enumerate(chosen):
            for klass in range(4):
                logits[index, klass][torch.from_numpy(labels == klass)] = 10.0
        return logits


def oracle_registry(masks: list[list[np.ndarray]]) -> ModelRegistry:
    entry = LoadedModel(
        spec=CARDIO_SEG_SPEC,
        module=OracleSegmenter(masks),
        weights_sha256="a" * 64,
        config=read_model_card(CARD_FILE),
        config_file=CARDIO_SEG_SPEC.config_file,
        config_sha256="b" * 64,
    )
    return ModelRegistry(models={CARDIO_SEG_MODEL_ID: entry})


def volume_array(masks, **_) -> np.ndarray:
    """(X, Y, slices, phases) image volume of the phantom (the pixels are of no use to the stand-in model)."""
    return np.stack(
        [np.stack([(masks[phase][index] * 60 + 40).astype(np.float32).T for index in range(SLICES)], axis=-1) for phase in range(PHASES)],
        axis=-1,
    )


def phantom_zip(
    masks=None,
    *,
    organisation: str = "per-position",
    apex_first: bool = False,
    height_cm: float | None = None,
    weight_kg: float | None = None,
    heart_rate: float | None = None,
) -> bytes:
    masks = masks or phantom_masks()
    files = cine_files(
        volume_array(masks),
        (PIXEL_MM, PIXEL_MM, GAP_MM),
        height_cm=height_cm,
        weight_kg=weight_kg,
        organisation=organisation,
        heart_rate_bpm=heart_rate,
    )
    if not apex_first:
        return zip_bytes(files)
    # The same stack with the normal turned over: the base at the highest coordinate.
    return zip_bytes(
        {
            name: _reposition(content, lambda z: (SLICES - 1) * GAP_MM - z)
            for name, content in files.items()
        }
    )


def _reposition(content: bytes, z_of) -> bytes:
    import pydicom

    dataset = pydicom.dcmread(io.BytesIO(content))
    position = [float(value) for value in dataset.ImagePositionPatient]
    dataset.ImagePositionPatient = [position[0], position[1], z_of(position[2])]
    buffer = io.BytesIO()
    pydicom.dcmwrite(buffer, dataset, enforce_file_format=True)
    return buffer.getvalue()


def decode_png(encoded: str) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(base64.b64decode(encoded), dtype=np.uint8), cv2.IMREAD_UNCHANGED)


# --- A stack made image by image, to break it in one way at a time ---------------------------


def small_stack(
    *, positions=6, phases=3, size=64, gap=8.0, overrides=None, drop=(), duplicate=False, **common
) -> bytes:
    """A zip of tiny images: overrides(position, phase) -> kwargs of write_dicom."""
    from pydicom.uid import generate_uid

    study = generate_uid()
    files = {}
    rng = np.random.default_rng(1)
    for position in range(positions):
        series = generate_uid()
        for phase in range(phases):
            if (position, phase) in drop:
                continue
            fields = {
                "study_uid": study,
                "series_uid": series,
                "position": (0.0, 0.0, position * gap),
                "pixel_spacing": (1.5, 1.5),
                "slice_thickness": 6.0,
                "instance_number": phase + 1,
                "trigger_time_ms": phase * 100.0,
                **common,
            }
            if overrides:
                fields.update(overrides(position, phase))
            files[f"SE{position:02d}/IM{phase:03d}.dcm"] = write_dicom(
                rng.integers(50, 4000, (size, size)).astype(np.uint16), **fields
            )
    if duplicate:
        files["copy/first.dcm"] = files["SE00/IM000.dcm"]
    return zip_bytes(files)


def refusal(data: bytes) -> CardioVolumeInputError:
    with pytest.raises(CardioVolumeInputError) as error:
        read_cine_stack(data, MAX_PIXELS)
    return error.value


# --- Reading: both organisations ---------------------------------------------------------------


def test_one_series_per_position_and_a_single_series_give_the_same_stack():
    masks = phantom_masks()
    per_position = read_cine_stack(phantom_zip(masks, organisation="per-position"), MAX_PIXELS)
    single = read_cine_stack(phantom_zip(masks, organisation="single-series"), MAX_PIXELS)

    for stack in (per_position, single):
        assert stack.phases == PHASES and stack.slices == SLICES
        assert stack.pixel_spacing_mm == (PIXEL_MM, PIXEL_MM)
        assert stack.slice_gap_mm == pytest.approx(GAP_MM)
        assert stack.positions_mm == pytest.approx([index * GAP_MM for index in range(SLICES)])
        assert stack.phase_times_ms == pytest.approx([phase * 100.0 for phase in range(PHASES)])
        assert stack.warnings == []
    for phase in range(PHASES):
        for index in range(SLICES):
            assert np.array_equal(per_position.images[phase][index], single.images[phase][index])
    # The pixels are the ones that were written (the volume's minimum, 40, taken off), at the right phase and position.
    assert np.array_equal(per_position.images[3][5], (phantom_masks()[3][5] * 60).astype(np.float32))


def test_the_phase_comes_from_the_trigger_time_even_when_the_instance_numbers_say_otherwise():
    # Instance numbers in reverse, trigger times in order: the trigger time wins.
    reverse = small_stack(overrides=lambda position, phase: {"instance_number": 100 - phase})
    stack = read_cine_stack(reverse, MAX_PIXELS)

    assert stack.phase_times_ms == pytest.approx([0.0, 100.0, 200.0])
    first_instance = small_stack()
    assert all(np.array_equal(a, b) for a, b in zip(read_cine_stack(first_instance, MAX_PIXELS).images[0], stack.images[0], strict=True))


def test_without_trigger_times_the_instance_number_orders_the_phases():
    plain = small_stack(overrides=lambda position, phase: {"trigger_time_ms": None, "instance_number": 10 * (3 - phase)})

    stack = read_cine_stack(plain, MAX_PIXELS)

    assert stack.phase_times_ms is None
    # The phase with the highest instance number (3 - 0) * 10 = 30 is the first one read, i.e. the last image.
    expected = read_cine_stack(small_stack(), MAX_PIXELS)
    for position in range(6):
        assert np.array_equal(stack.images[0][position], expected.images[2][position])


def test_the_patient_size_weight_and_heart_rate_are_read_when_they_are_there():
    stack = read_cine_stack(small_stack(patient_size_m=1.75, patient_weight_kg=82.0, heart_rate_bpm=72), MAX_PIXELS)

    assert (stack.patient_size_m, stack.patient_weight_kg, stack.heart_rate_bpm) == (1.75, 82.0, 72.0)
    bare = read_cine_stack(small_stack(), MAX_PIXELS)
    assert (bare.patient_size_m, bare.patient_weight_kg, bare.heart_rate_bpm) == (None, None, None)


def test_the_heart_rate_comes_from_the_nominal_interval_when_there_is_no_heart_rate():
    stack = read_cine_stack(small_stack(nominal_interval_ms=800), MAX_PIXELS)

    assert stack.heart_rate_bpm == pytest.approx(75.0)


def test_implausible_size_weight_and_heart_rate_are_ignored():
    stack = read_cine_stack(small_stack(patient_size_m=175.0, patient_weight_kg=0.1, heart_rate_bpm=3), MAX_PIXELS)

    assert (stack.patient_size_m, stack.patient_weight_kg, stack.heart_rate_bpm) == (None, None, None)


# --- Reading: refusals ---------------------------------------------------------------------------


def test_not_a_zip_and_a_zip_without_dicom():
    assert refusal(b"this is not an archive").code == "cardio_volume_unsupported_format"
    assert refusal(b"PK\x03\x04 truncated").code == "cardio_volume_unsupported_format"
    notes = zip_bytes({"readme.txt": b"hello", "DICOMDIR": b"x" * 200})
    assert refusal(notes).code == "cardio_volume_no_dicom"


def test_the_archive_limits(monkeypatch):
    many = zip_bytes({f"f{index}.dcm": b"x" for index in range(601)})
    error = refusal(many)
    assert (error.code, error.details) == ("cardio_volume_unsafe_archive", {"reason": "too_many_files", "max": 600})

    for name in ("../evil.dcm", "/etc/passwd", "C:\\evil.dcm", "a/../../b.dcm"):
        assert refusal(zip_bytes({name: b"x"})).details == {"reason": "unsafe_path"}

    monkeypatch.setattr(cardio_volume_input, "MAX_UNCOMPRESSED_BYTES", 1000)
    big = refusal(zip_bytes({"a.dcm": b"x" * 1500}))
    assert big.code == "cardio_volume_unsafe_archive" and big.details["reason"] == "too_large"


def test_a_ct_image_a_multiframe_file_and_a_colour_image_are_refused():
    assert refusal(small_stack(modality="CT")).code == "cardio_volume_not_mr"
    from tests.test_cardio_seg import dicom_bytes

    frame = np.full((64, 64), 100, dtype=np.uint8)
    multiframe = zip_bytes({"a.dcm": dicom_bytes([frame, frame])})
    # It has no geometry either, but the frames are what is refused first.
    assert refusal(multiframe).code == "cardio_volume_multiframe"


def test_an_image_without_position_orientation_or_pixel_spacing_is_refused():
    from pydicom.dataset import Dataset  # noqa: F401  (the file is edited below)
    import pydicom

    def without(tag: str) -> bytes:
        data = small_stack()
        out = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(out, "w") as target:
            for index, name in enumerate(source.namelist()):
                content = source.read(name)
                if index == 0:
                    dataset = pydicom.dcmread(io.BytesIO(content))
                    delattr(dataset, tag)
                    buffer = io.BytesIO()
                    pydicom.dcmwrite(buffer, dataset, enforce_file_format=True)
                    content = buffer.getvalue()
                target.writestr(name, content)
        return out.getvalue()

    for tag in ("ImagePositionPatient", "ImageOrientationPatient", "PixelSpacing"):
        error = refusal(without(tag))
        assert error.code == "cardio_volume_missing_geometry" and error.details["missing"] == [tag]


def test_mixed_orientations_are_refused_beyond_five_degrees():
    def tilted(degrees: float):
        angle = math.radians(degrees)
        # The row direction stays, the column direction leans toward the normal.
        return lambda position, phase: (
            {"orientation": (1.0, 0.0, 0.0, 0.0, math.cos(angle), math.sin(angle))} if (position, phase) == (2, 1) else {}
        )

    error = refusal(small_stack(overrides=tilted(8)))
    assert error.code == "cardio_volume_mixed_orientation"
    assert error.details["maxAngleDeg"] == pytest.approx(8.0, abs=0.1) and error.details["toleranceDeg"] == 5.0
    # 3 degrees: accepted.
    assert read_cine_stack(small_stack(overrides=tilted(3)), MAX_PIXELS).slices == 6


def test_another_pixel_spacing_or_image_size_is_refused():
    spacing = refusal(small_stack(overrides=lambda p, f: {"pixel_spacing": (1.6, 1.6)} if (p, f) == (1, 0) else {}))
    assert (spacing.code, spacing.details) == ("cardio_volume_mixed_geometry", {"reason": "pixel_spacing"})

    from pydicom.uid import generate_uid

    mixed = {}
    study, series = generate_uid(), generate_uid()
    for index in range(7):
        side = 64 if index else 72
        mixed[f"IM{index}.dcm"] = write_dicom(
            np.full((side, side), 500 + index, dtype=np.uint16),
            study_uid=study, series_uid=series, position=(0.0, 0.0, index * 8.0), pixel_spacing=(1.5, 1.5),
            slice_thickness=6.0, instance_number=index + 1,
        )
    assert refusal(zip_bytes(mixed)).details["reason"] == "image_size"


def test_the_same_number_of_phases_is_needed_at_every_position():
    error = refusal(small_stack(drop={(3, 2)}))

    assert error.code == "cardio_volume_unequal_phases"
    assert error.details["phasesPerPosition"] == [3, 3, 3, 2, 3, 3]


def test_fewer_than_six_slices_and_fewer_than_two_or_more_than_thirty_phases_are_refused():
    few = refusal(small_stack(positions=5))
    assert (few.code, few.details) == ("cardio_volume_too_few_slices", {"min": 6, "found": 5})
    single = refusal(small_stack(phases=1))
    assert (single.code, single.details) == ("cardio_volume_too_few_phases", {"min": 2, "found": 1})
    many = refusal(small_stack(positions=6, phases=31, size=64))
    assert (many.code, many.details) == ("cardio_volume_too_many_phases", {"max": 30, "found": 31})
    assert read_cine_stack(small_stack(phases=30), MAX_PIXELS).phases == 30
    assert read_cine_stack(small_stack(positions=6), MAX_PIXELS).slices == 6


def test_a_sixth_position_is_enough_and_a_missing_one_is_not():
    assert read_cine_stack(small_stack(positions=6), MAX_PIXELS).slices == 6
    assert refusal(small_stack(positions=5)).code == "cardio_volume_too_few_slices"


def test_an_uneven_step_between_slices_is_a_warning_not_a_refusal():
    def shifted(position: int, phase: int):
        # The gaps become 8, 8, 12, 8, 8: 50 % over the median, beyond 20 %.
        return {"position": (0.0, 0.0, position * 8.0 + (4.0 if position >= 3 else 0.0))}

    stack = read_cine_stack(small_stack(overrides=shifted), MAX_PIXELS)

    assert stack.slices == 6
    warning = next(item for item in stack.warnings if item["code"] == "irregular_slice_spacing")
    assert warning["minMm"] == 8.0 and warning["maxMm"] == 12.0 and warning["medianMm"] == 8.0
    # A step within 20 % of the median gives no warning.
    nearly = read_cine_stack(small_stack(overrides=lambda p, f: {"position": (0.0, 0.0, p * 8.0 + (1.0 if p == 3 else 0.0))}), MAX_PIXELS)
    assert not any(item["code"] == "irregular_slice_spacing" for item in nearly.warnings)


def test_the_same_series_packed_twice_counts_once():
    stack = read_cine_stack(small_stack(duplicate=True), MAX_PIXELS)

    assert stack.phases == 3 and stack.slices == 6
    assert {"code": "duplicate_images_ignored", "count": 1} in stack.warnings


def test_positions_closer_than_half_a_millimetre_are_the_same_position():
    # The patient breathes a little between the phases: 0, 0.2 and 0.4 mm.
    jitter = read_cine_stack(small_stack(overrides=lambda p, f: {"position": (0.0, 0.0, p * 8.0 + 0.2 * f)}), MAX_PIXELS)

    assert jitter.slices == 6 and jitter.phases == 3
    # 0.6 mm apart is another position, and the phases no longer match.
    assert refusal(small_stack(overrides=lambda p, f: {"position": (0.0, 0.0, p * 8.0 + 0.3 * f)})).code == "cardio_volume_unequal_phases"


# --- The pipeline on the phantom -----------------------------------------------------------------


@pytest.fixture(scope="module")
def phantom_result() -> dict:
    return analyze_cardio_volume(phantom_zip(height_cm=175.0, weight_kg=75.0, heart_rate=70), oracle_registry(phantom_masks()), MAX_PIXELS)


def test_the_lv_volume_is_the_known_volume_within_two_percent(phantom_result):
    # Half an ellipsoid of base radius R and length L: 2/3 pi R² L.
    length = SLICES * GAP_MM
    for phase, radius_px in ((0, ED_RADIUS_PX), (PHASES // 2, ES_RADIUS_PX)):
        analytic = 2 / 3 * math.pi * (radius_px * PIXEL_MM) ** 2 * length / 1000
        assert phantom_result["lvVolumeCurveMl"][phase] == pytest.approx(analytic, rel=0.02)
        # And the volume of the masks themselves, exactly.
        assert phantom_result["lvVolumeCurveMl"][phase] == pytest.approx(mask_volume_ml(phantom_masks(), phase, 1), rel=1e-9)


def test_the_ejection_fraction_is_the_masks_exactly_and_the_ellipsoids_closely(phantom_result):
    masks = phantom_masks()
    lv = phantom_result["measures"]["lv"]
    edv, esv = mask_volume_ml(masks, 0, 1), mask_volume_ml(masks, 5, 1)

    assert lv["edvMl"] == pytest.approx(edv, rel=1e-9) and lv["esvMl"] == pytest.approx(esv, rel=1e-9)
    assert lv["efPercent"] == pytest.approx((edv - esv) / edv * 100, abs=1e-9)
    assert lv["efPercent"] == pytest.approx((1 - (ES_RADIUS_PX / ED_RADIUS_PX) ** 2) * 100, abs=1.0)
    rv = phantom_result["measures"]["rv"]
    assert rv["efPercent"] == pytest.approx((mask_volume_ml(masks, 0, 2) - mask_volume_ml(masks, 5, 2)) / mask_volume_ml(masks, 0, 2) * 100, abs=1e-9)


def test_the_mass_is_the_myocardium_volume_at_ed_times_1_05(phantom_result):
    assert phantom_result["measures"]["lvMassG"] == pytest.approx(mask_volume_ml(phantom_masks(), 0, 3) * 1.05, rel=1e-9)


def test_ed_and_es_are_found_from_the_curve(phantom_result):
    curve = phantom_result["lvVolumeCurveMl"]

    assert (phantom_result["edPhase"], phantom_result["esPhase"]) == (0, PHASES // 2)
    assert curve.index(max(curve)) == 0 and curve.index(min(curve)) == PHASES // 2
    assert len(curve) == PHASES


def test_the_answer_describes_the_stack_the_physician_will_correct(phantom_result):
    assert phantom_result["phases"] == PHASES
    assert len(phantom_result["slices"]) == SLICES
    assert [item["positionMm"] for item in phantom_result["slices"]] == pytest.approx([index * GAP_MM for index in range(SLICES)])
    assert phantom_result["slices"][0]["stepMm"] == pytest.approx(GAP_MM) and phantom_result["slices"][-1]["stepMm"] is None
    assert phantom_result["sliceGapMm"] == pytest.approx(GAP_MM)
    assert phantom_result["pixelSpacingMm"] == [PIXEL_MM, PIXEL_MM]
    assert (phantom_result["imageWidth"], phantom_result["imageHeight"]) == (SIZE, SIZE)
    assert phantom_result["modelId"] == CARDIO_SEG_MODEL_ID and phantom_result["weightsSha256"] == "a" * 64
    assert phantom_result["phaseTimesMs"] == pytest.approx([phase * 100.0 for phase in range(PHASES)])
    areas = phantom_result["areasMm2"]
    assert len(areas) == PHASES and all(len(phase) == SLICES for phase in areas)
    assert areas[0][0]["LV"] == pytest.approx(int((phantom_masks()[0][0] == 1).sum()) * PIXEL_MM**2)
    assert phantom_result["durationMs"] >= 0 and phantom_result["warnings"] == []


def test_the_body_surface_and_the_output_come_from_the_dicom_when_it_has_them(phantom_result):
    assert phantom_result["bsaM2"] == pytest.approx(math.sqrt(175 * 75 / 3600))
    assert phantom_result["heartRateBpm"] == 70
    measures = phantom_result["measures"]
    assert measures["cardiacOutputLMin"] == pytest.approx(measures["lv"]["svMl"] * 70 / 1000)
    assert measures["indexed"]["lvEdvMlM2"] == pytest.approx(measures["lv"]["edvMl"] / phantom_result["bsaM2"])
    # The answer carries the surface, never the height and the weight themselves.
    assert not {"patientSizeM", "patientWeightKg", "heightCm", "weightKg", "patient"} & set(phantom_result)


def test_without_height_weight_and_rate_nothing_is_indexed_and_no_output_is_computed():
    result = analyze_cardio_volume(phantom_zip(), oracle_registry(phantom_masks()), MAX_PIXELS)

    assert result["bsaM2"] is None and result["heartRateBpm"] is None
    assert result["measures"]["indexed"] is None and result["measures"]["cardiacOutputLMin"] is None


def test_only_the_ed_and_es_phases_come_with_images(phantom_result):
    for key in ("labelMapsPng", "slicesPng"):
        assert set(phantom_result[key]) == {"ed", "es"}
        assert all(len(phantom_result[key][phase]) == SLICES for phase in ("ed", "es"))
    masks = phantom_masks()
    for slice_index in (0, 3, 7):
        assert np.array_equal(decode_png(phantom_result["labelMapsPng"]["ed"][slice_index]), masks[0][slice_index])
        assert np.array_equal(decode_png(phantom_result["labelMapsPng"]["es"][slice_index]), masks[5][slice_index])
    shown = decode_png(phantom_result["slicesPng"]["ed"][2])
    assert shown.shape == (SIZE, SIZE) and shown.dtype == np.uint8
    assert "ejection" not in str(phantom_result["warnings"])


def test_a_stack_given_apex_first_comes_out_base_first():
    base_first_result = analyze_cardio_volume(phantom_zip(), oracle_registry(phantom_masks()), MAX_PIXELS)
    # The same slices at descending coordinates: sorted along the normal the apex comes first, so the
    # stand-in model is asked for the masks in that order.
    reversed_masks = [phase[::-1] for phase in phantom_masks()]
    turned = analyze_cardio_volume(
        phantom_zip(apex_first=True), oracle_registry(reversed_masks), MAX_PIXELS
    )

    assert turned["areasMm2"] == base_first_result["areasMm2"]
    assert [item["positionMm"] for item in turned["slices"]] == pytest.approx([item["positionMm"] for item in base_first_result["slices"]])
    assert turned["measures"]["lv"] == pytest.approx(base_first_result["measures"]["lv"])
    assert turned["sliceOrderInferred"] is True
    assert not any(item["code"] == "slice_order_uncertain" for item in turned["warnings"])


def test_two_ends_that_look_alike_leave_the_order_uncertain():
    assert base_first([5.0, 9.0, 12.0, 12.0, 9.0, 5.0]) == (True, False)
    assert base_first([30.0, 20.0, 12.0, 8.0, 4.0, 1.0]) == (True, True)
    assert base_first([1.0, 4.0, 8.0, 12.0, 20.0, 30.0]) == (False, True)
    assert base_first([0.0] * 6) == (True, False)


def test_a_model_that_is_not_loaded_is_a_503_matter():
    from app.pipeline import ModelNotLoaded

    registry = ModelRegistry(models={CARDIO_SEG_MODEL_ID: LoadedModel(spec=CARDIO_SEG_SPEC, error="weights_missing")})
    with pytest.raises(ModelNotLoaded):
        analyze_cardio_volume(phantom_zip(), registry, MAX_PIXELS)


# --- The batch against the images one by one, with the real weights ----------------------------------


@pytest.fixture(scope="module")
def real_entry():
    if not WEIGHTS_PRESENT:
        pytest.skip(f"cardiac MRI weights not found in {MODELS_DIR}")
    entry = load_cardio_seg_model(MODELS_DIR)
    assert entry.loaded, entry.error
    return entry


def fixture_slices() -> list[np.ndarray]:
    return [
        cv2.imread(str(FIXTURES_DIR / name), cv2.IMREAD_UNCHANGED).astype(np.float32)
        for name in ("acdc_p001_f01.png", "acdc_p001_f12.png", "acdc_p019_f01.png")
    ]


@pytest.mark.parametrize("batch_size", [1, 2, 3, 8])
def test_the_batch_gives_the_same_masks_as_the_images_one_by_one(real_entry, batch_size):
    images = fixture_slices()

    one_by_one = [predict_labels(image, real_entry) for image in images]
    batched = predict_labels_batch(images, real_entry, batch_size)

    assert len(batched) == len(one_by_one) == 3
    for single, grouped in zip(one_by_one, batched, strict=True):
        assert np.array_equal(single, grouped)


def test_a_batch_of_nothing_is_nothing_and_a_batch_size_below_one_is_refused(real_entry):
    assert predict_labels_batch([], real_entry) == []
    with pytest.raises(ValueError):
        predict_labels_batch(fixture_slices(), real_entry, 0)


def test_a_stack_goes_through_the_real_model(real_entry):
    # Not a heart's cine: the three ACDC test slices laid out as 6 positions x 2 phases, to see the whole
    # path run on the real weights (shapes, sizes of the answer, the time it takes).
    slices = [cv2.resize(image, (216, 256)) for image in fixture_slices()]
    files = {}
    from pydicom.uid import generate_uid

    study, series = generate_uid(), generate_uid()
    for position in range(6):
        for phase in range(2):
            pixels = np.clip(slices[(position + phase) % 3], 0, 65535).astype(np.uint16)
            files[f"P{position}/F{phase}.dcm"] = write_dicom(
                pixels, study_uid=study, series_uid=series, position=(0.0, 0.0, position * 10.0), pixel_spacing=(1.4, 1.4),
                slice_thickness=8.0, instance_number=position * 2 + phase + 1, trigger_time_ms=phase * 400.0,
            )
    registry = ModelRegistry(models={CARDIO_SEG_MODEL_ID: real_entry})

    result = analyze_cardio_volume(zip_bytes(files), registry, MAX_PIXELS)

    assert result["phases"] == 2 and len(result["slices"]) == 6 and result["sliceGapMm"] == pytest.approx(10.0)
    assert result["weightsSha256"] == real_entry.weights_sha256
    assert len(result["areasMm2"]) == 2 and len(result["areasMm2"][0]) == 6
    assert result["measures"]["lv"]["edvMl"] > 0
    assert len(result["labelMapsPng"]["ed"]) == 6


# --- Endpoint -------------------------------------------------------------------------------------------


def unloaded_registry() -> ModelRegistry:
    return ModelRegistry(models={CARDIO_SEG_MODEL_ID: LoadedModel(spec=CARDIO_SEG_SPEC, error="weights_missing")})


def test_the_endpoint_needs_the_token():
    with make_client(unloaded_registry()) as client:
        response = client.post(URL, files={"stack": ("cine.zip", phantom_zip(), "application/zip")})
    assert response.status_code == 401


def test_the_endpoint_answers_503_without_the_model_and_422_for_refused_stacks():
    with make_client(unloaded_registry()) as client:
        missing = client.post(URL, headers=AUTH, files={"stack": ("cine.zip", phantom_zip(), "application/zip")})
        refused = client.post(URL, headers=AUTH, files={"stack": ("cine.zip", small_stack(positions=4), "application/zip")})
        not_zip = client.post(URL, headers=AUTH, files={"stack": ("cine.zip", b"hello", "application/zip")})
        unequal = client.post(URL, headers=AUTH, files={"stack": ("cine.zip", small_stack(drop={(1, 0)}), "application/zip")})
    assert missing.status_code == 503 and missing.json()["detail"]["code"] == "model_not_loaded"
    assert refused.status_code == 422 and refused.json()["detail"] == {"code": "cardio_volume_too_few_slices", "min": 6, "found": 4}
    assert not_zip.json()["detail"] == {"code": "cardio_volume_unsupported_format"}
    assert unequal.json()["detail"]["code"] == "cardio_volume_unequal_phases"


def test_the_endpoint_answers_with_the_measures():
    with make_client(oracle_registry(phantom_masks())) as client:
        response = client.post(URL, headers=AUTH, files={"stack": ("cine.zip", phantom_zip(heart_rate=60), "application/zip")})

    assert response.status_code == 200
    body = response.json()
    assert body["measures"]["lv"]["efPercent"] == pytest.approx(60.9, abs=1.0)
    assert body["measures"]["cardiacOutputLMin"] == pytest.approx(body["measures"]["lv"]["svMl"] * 60 / 1000)
    assert (body["edPhase"], body["esPhase"]) == (0, 5)


def test_the_endpoint_refuses_a_stack_over_the_limit_with_413():
    with make_client(oracle_registry(phantom_masks()), max_stack_bytes=1000) as client:
        response = client.post(URL, headers=AUTH, files={"stack": ("cine.zip", phantom_zip(), "application/zip")})

    assert response.status_code == 413 and response.json()["detail"] == {"code": "stack_too_large"}
