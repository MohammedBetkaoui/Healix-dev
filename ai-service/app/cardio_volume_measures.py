"""Volumes, ejection fraction and myocardial mass from the areas of a short-axis
cine stack: pure arithmetic, no model, no image.

The backend recalculates these when the physician moves ED or ES, excludes a
slice or gives the height and weight, without running the model again:
backend/src/ai-analysis-runs/volumetry/volumetry-measures.ts is this module
written again in TypeScript, and both are checked against the same cases
(tests/fixtures/cardio-volume/measures-cases.json). The same order of
additions on both sides, and nothing rounded here: rounding is for display.

Method
- Volume of a structure at a phase: Simpson's method of discs, the sum over the
  slices of (area of the slice in mm² x step between slices in mm) / 1000, in
  ml. The step is the distance between the positions of successive slices, not
  the slice thickness, which can leave a gap between slices.
- ED and ES: the phases of the largest and of the smallest LV volume, unless
  the physician chooses them.
- LV: EDV, ESV, SV = EDV - ESV, EF = SV / EDV. RV: the same.
- Mass of the LV myocardium: the MYO volume at ED x 1.05 g/ml.
- Cardiac output: SV x heart rate, only when the heart rate is known.
- Indexed values: divided by the body surface area (Mosteller), when known.
- LVEF class: 2021 ESC Guidelines for the diagnosis and treatment of acute and
  chronic heart failure (McDonagh TA et al., Eur Heart J 2021;42:3599-3726,
  doi:10.1093/eurheartj/ehab368): reduced <= 40 %, mildly reduced 41-49 %,
  preserved >= 50 %, read on the EF rounded to the unit, as it is reported.

A measurement aid, to be checked by the physician. Never a diagnosis.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

STRUCTURES = ("LV", "RV", "MYO")
# Density of the myocardium, g/ml.
MYOCARDIAL_DENSITY_G_ML = 1.05
# 1 ml = 1000 mm³.
MM3_PER_ML = 1000.0

# ESC 2021 (see the module docstring).
LVEF_REDUCED_MAX = 40
LVEF_MILDLY_REDUCED_MAX = 49


def mosteller_bsa(height_cm: float, weight_kg: float) -> float | None:
    """Body surface area in m² (Mosteller: sqrt(cm x kg / 3600)); None for a
    height or a weight that is not a positive finite number."""
    values = (height_cm, weight_kg)
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0 for value in values):
        return None
    return math.sqrt(height_cm * weight_kg / 3600.0)


def lvef_class(ef_percent: float | None) -> str | None:
    """reduced / mildlyReduced / preserved, on the EF rounded to the unit (half
    up); None without an EF."""
    if ef_percent is None or not math.isfinite(ef_percent):
        return None
    reported = math.floor(ef_percent + 0.5)
    if reported <= LVEF_REDUCED_MAX:
        return "reduced"
    return "mildlyReduced" if reported <= LVEF_MILDLY_REDUCED_MAX else "preserved"


def _check_areas(areas: Sequence[Sequence[dict]], spacing: float) -> tuple[int, int]:
    if not areas or not areas[0]:
        raise ValueError("areas must hold at least one phase and one slice.")
    slices = len(areas[0])
    if any(len(phase) != slices for phase in areas):
        raise ValueError("every phase must have the same number of slices.")
    if not (isinstance(spacing, (int, float)) and math.isfinite(spacing) and spacing > 0):
        raise ValueError("the step between slices must be a positive number of mm.")
    return len(areas), slices


def _check_slices(excluded: Sequence[int], slices: int) -> list[int]:
    unique = sorted({int(index) for index in excluded})
    if any(index < 0 or index >= slices for index in unique):
        raise ValueError("excluded slice out of range.")
    return unique


def structure_volume_ml(
    areas: Sequence[Sequence[dict]], spacing: float, phase: int, structure: str, excluded: Sequence[int] = ()
) -> float:
    """Volume of `structure` at `phase`, in ml, without the excluded slices."""
    phases, slices = _check_areas(areas, spacing)
    skipped = set(_check_slices(excluded, slices))
    if not 0 <= phase < phases:
        raise ValueError("phase out of range.")
    total = 0.0
    for index in range(slices):
        if index not in skipped:
            total += areas[phase][index][structure] * spacing
    return total / MM3_PER_ML


def lv_volume_curve_ml(areas: Sequence[Sequence[dict]], spacing: float, excluded: Sequence[int] = ()) -> list[float]:
    """The LV volume at each phase, in ml."""
    phases, _ = _check_areas(areas, spacing)
    return [structure_volume_ml(areas, spacing, phase, "LV", excluded) for phase in range(phases)]


def automatic_phases(curve: Sequence[float]) -> tuple[int, int]:
    """(ED, ES): the first phase of the largest and of the smallest LV volume."""
    if not curve:
        raise ValueError("the curve is empty.")
    return curve.index(max(curve)), curve.index(min(curve))


def _ventricle(areas, spacing, ed, es, excluded, structure) -> dict:
    edv = structure_volume_ml(areas, spacing, ed, structure, excluded)
    esv = structure_volume_ml(areas, spacing, es, structure, excluded)
    stroke = edv - esv
    return {
        "edvMl": edv,
        "esvMl": esv,
        "svMl": stroke,
        "efPercent": stroke / edv * 100.0 if edv > 0 else None,
    }


def compute_measures(
    areas: Sequence[Sequence[dict]],
    spacing: float,
    ed: int,
    es: int,
    excluded_slices: Sequence[int] = (),
    bsa: float | None = None,
    hr: float | None = None,
) -> dict:
    """The measures of a cine stack.

    areas[phase][slice] = {"LV": mm², "RV": mm², "MYO": mm²}; spacing: the step
    between slices, mm; ed, es: phase indices; excluded_slices: slices left out
    of every sum; bsa: m²; hr: beats per minute (None when unknown).
    """
    phases, slices = _check_areas(areas, spacing)
    for name, phase in (("ed", ed), ("es", es)):
        if not 0 <= phase < phases:
            raise ValueError(f"{name} phase out of range.")
    excluded = _check_slices(excluded_slices, slices)
    if len(excluded) == slices:
        raise ValueError("at least one slice must be kept.")
    if bsa is not None and not (math.isfinite(bsa) and bsa > 0):
        raise ValueError("the body surface area must be a positive number of m².")
    if hr is not None and not (math.isfinite(hr) and hr > 0):
        raise ValueError("the heart rate must be a positive number of beats per minute.")

    lv = _ventricle(areas, spacing, ed, es, excluded, "LV")
    rv = _ventricle(areas, spacing, ed, es, excluded, "RV")
    mass = structure_volume_ml(areas, spacing, ed, "MYO", excluded) * MYOCARDIAL_DENSITY_G_ML
    output = lv["svMl"] * hr / 1000.0 if hr is not None else None

    indexed = None
    if bsa is not None:
        indexed = {
            "lvEdvMlM2": lv["edvMl"] / bsa,
            "lvEsvMlM2": lv["esvMl"] / bsa,
            "lvSvMlM2": lv["svMl"] / bsa,
            "rvEdvMlM2": rv["edvMl"] / bsa,
            "rvEsvMlM2": rv["esvMl"] / bsa,
            "lvMassGM2": mass / bsa,
            "cardiacIndexLMinM2": output / bsa if output is not None else None,
        }

    warnings = []
    if lv["efPercent"] is not None and lv["efPercent"] < 0:
        warnings.append("es_volume_exceeds_ed")
    return {
        "edPhase": ed,
        "esPhase": es,
        "excludedSlices": excluded,
        "lv": lv,
        "rv": rv,
        "lvMassG": mass,
        "cardiacOutputLMin": output,
        "heartRateBpm": hr,
        "bsaM2": bsa,
        "indexed": indexed,
        "lvefClass": lvef_class(lv["efPercent"]),
        "warnings": warnings,
    }
