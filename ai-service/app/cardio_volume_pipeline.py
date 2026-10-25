"""Cardiac volumetry from a short-axis cine stack: every slice of every phase is
segmented by the cardiac MRI model (cardio_seg_pipeline: the same preprocessing,
only the forward pass is shared by a batch), the areas of LV, RV and MYO in mm²
are counted slice by slice and phase by phase, and cardio_volume_measures turns
them into volumes, ejection fractions and the mass of the myocardium.

What comes back is a measurement aid for the physician to check, never a
diagnosis: the areas of every slice and phase (so that the measures can be
recalculated, with another ED or ES or without a slice, with no new inference),
the LV volume curve, the ED and ES phases the curve suggests, the measures, and
the label maps of the ED and ES phases (one per slice) with the slice as
analysed under them. Nothing is drawn for the other phases: their areas are enough.

Which end of the stack is the base is not in the DICOM geometry. The base is
taken to be the end where the LV cavity is larger (the apical slices hold little
of it), and the answer says the order was inferred; a warning is added when the
two ends are too alike to tell.
"""

from __future__ import annotations

import time

import numpy as np

from .cardio_seg_models import CARDIO_SEG_MODEL_ID, STRUCTURES
from .cardio_seg_pipeline import DEFAULT_BATCH_SIZE, display_uint8, segment_batch
from .cardio_volume_input import CineStack, read_cine_stack
from .cardio_volume_measures import automatic_phases, compute_measures, lv_volume_curve_ml, mosteller_bsa
from .label_maps import png_base64
from .models import ModelRegistry
from .pipeline import ModelNotLoaded

# The first half of the stack must hold this much more LV cavity (summed over the
# phases) than the second half, or the ends are called alike.
BASE_APEX_RATIO = 0.85


def slice_areas(labels: np.ndarray, pixel_area_mm2: float) -> dict[str, float]:
    """{"LV": mm², "RV": mm², "MYO": mm²} of one class map."""
    counts = np.bincount(labels.ravel(), minlength=len(STRUCTURES) + 1)
    return {name: float(counts[index]) * pixel_area_mm2 for index, name in enumerate(STRUCTURES, start=1)}


def base_first(lv_area_by_slice: list[float]) -> tuple[bool, bool]:
    """(the stack is already base first, the order is certain): the base is the
    end with the larger LV cavity, the two halves compared."""
    half = len(lv_area_by_slice) // 2
    first, last = sum(lv_area_by_slice[:half]), sum(lv_area_by_slice[-half:])
    larger, smaller = max(first, last), min(first, last)
    certain = larger > 0 and smaller < BASE_APEX_RATIO * larger
    return first >= last, certain


def _png_list(images: list[np.ndarray], what: str) -> list[str]:
    return [png_base64(image, what) for image in images]


def stack_bsa(stack: CineStack) -> float | None:
    """The body surface area from the DICOM height and weight, when both are there."""
    if stack.patient_size_m is None or stack.patient_weight_kg is None:
        return None
    return mosteller_bsa(stack.patient_size_m * 100.0, stack.patient_weight_kg)


def build_result(stack: CineStack, labels: list[list[np.ndarray]], *, model: dict) -> dict:
    """The answer, from the segmented stack: labels[phase][slice] in the stack's order."""
    pixel_area = stack.pixel_spacing_mm[0] * stack.pixel_spacing_mm[1]
    areas = [[slice_areas(labels[phase][index], pixel_area) for index in range(stack.slices)] for phase in range(stack.phases)]

    warnings = list(stack.warnings)
    lv_by_slice = [sum(areas[phase][index]["LV"] for phase in range(stack.phases)) for index in range(stack.slices)]
    already_base_first, certain = base_first(lv_by_slice)
    positions = list(stack.positions_mm)
    images = stack.images
    if not already_base_first:
        # Turned over: slice 0 is the base.
        areas = [phase[::-1] for phase in areas]
        labels = [phase[::-1] for phase in labels]
        images = [phase[::-1] for phase in images]
        total = positions[-1]
        positions = [round(total - position, 4) for position in reversed(positions)]
    if not certain:
        warnings.append({"code": "slice_order_uncertain"})

    gap = stack.slice_gap_mm
    curve = lv_volume_curve_ml(areas, gap)
    ed, es = automatic_phases(curve)
    bsa = stack_bsa(stack)
    measures = compute_measures(areas, gap, ed, es, (), bsa, stack.heart_rate_bpm)

    height, width = labels[0][0].shape
    return {
        **model,
        "phases": stack.phases,
        "slices": [
            {"positionMm": positions[index], "stepMm": round(abs(positions[index + 1] - positions[index]), 4) if index + 1 < len(positions) else None}
            for index in range(len(positions))
        ],
        "sliceGapMm": gap,
        "sliceOrderInferred": True,
        "phaseTimesMs": stack.phase_times_ms,
        "pixelSpacingMm": list(stack.pixel_spacing_mm),
        "imageWidth": width,
        "imageHeight": height,
        "areasMm2": areas,
        "lvVolumeCurveMl": curve,
        "edPhase": ed,
        "esPhase": es,
        "bsaM2": bsa,
        "heartRateBpm": stack.heart_rate_bpm,
        "measures": measures,
        "labelMapsPng": {
            "ed": _png_list(labels[ed], "ED label map"),
            "es": _png_list(labels[es], "ES label map"),
        },
        "slicesPng": {
            "ed": _png_list([display_uint8(image) for image in images[ed]], "ED slice"),
            "es": _png_list([display_uint8(image) for image in images[es]], "ES slice"),
        },
        "warnings": warnings,
    }


def analyze_cardio_volume(
    data: bytes, registry: ModelRegistry, max_pixels: int, batch_size: int = DEFAULT_BATCH_SIZE
) -> dict:
    started = time.perf_counter()
    stack = read_cine_stack(data, max_pixels)
    entry = registry.models.get(CARDIO_SEG_MODEL_ID)
    if entry is None or not entry.loaded:
        raise ModelNotLoaded()

    # Phase by phase, slice by slice: the order a model that stands in for this one
    # in the tests may rely on.
    flat = [stack.images[phase][index] for phase in range(stack.phases) for index in range(stack.slices)]
    maps = segment_batch(flat, entry, batch_size)
    labels = [maps[phase * stack.slices : (phase + 1) * stack.slices] for phase in range(stack.phases)]

    result = build_result(
        stack,
        labels,
        model={
            "modelId": CARDIO_SEG_MODEL_ID,
            "weightsSha256": entry.weights_sha256,
            "configSha256": entry.config_sha256,
        },
    )
    result["durationMs"] = round((time.perf_counter() - started) * 1000)
    return result
