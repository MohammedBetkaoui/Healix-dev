"""compute_measures: volumes by Simpson's discs, ejection fractions, myocardial
mass, output, indexing, the ESC class of the LVEF.

The cases of tests/fixtures/cardio-volume/measures-cases.json are shared with the
backend (backend/src/ai-analysis-runs/volumetry/volumetry-measures.spec.ts, which
runs the TypeScript version on the same file): the inputs were chosen by hand and
the expected values computed in exact rational arithmetic, independently of both.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.cardio_volume_measures import (
    MYOCARDIAL_DENSITY_G_ML,
    automatic_phases,
    compute_measures,
    lv_volume_curve_ml,
    lvef_class,
    mosteller_bsa,
    structure_volume_ml,
)

CASES = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "cardio-volume" / "measures-cases.json").read_text(encoding="utf-8")
)["cases"]


def uniform(lv_ed=1000, lv_es=400, slices=6):
    return [
        [{"LV": lv_ed, "RV": 1200, "MYO": 800}] * slices,
        [{"LV": lv_es, "RV": 700, "MYO": 900}] * slices,
    ]


def assert_same(actual, expected, path="measures"):
    """Every number to 1e-9, everything else equal, key for key."""
    if isinstance(expected, dict):
        assert isinstance(actual, dict) and set(actual) == set(expected), f"{path}: keys {sorted(actual)} != {sorted(expected)}"
        for key, value in expected.items():
            assert_same(actual[key], value, f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), path
        for index, value in enumerate(expected):
            assert_same(actual[index], value, f"{path}[{index}]")
    elif isinstance(expected, float) and not isinstance(expected, bool):
        assert actual == pytest.approx(expected, rel=1e-9, abs=1e-9), path
    else:
        assert actual == expected, path


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_the_shared_cases(case):
    given = case["input"]

    measures = compute_measures(
        given["areas"],
        given["gapMm"],
        given["edPhase"],
        given["esPhase"],
        given["excludedSlices"],
        given["bsaM2"],
        given["heartRateBpm"],
    )

    assert_same(measures, case["expected"])


def test_the_volume_of_a_uniform_stack_is_the_sum_of_its_discs():
    # 6 slices of 1000 mm² and a 10 mm step: 6 x 1000 x 10 = 60 000 mm³ = 60 ml.
    assert structure_volume_ml(uniform(), 10, 0, "LV") == 60
    assert structure_volume_ml(uniform(), 10, 1, "LV") == 24


def test_the_step_between_slices_is_the_height_of_each_disc_not_the_slice_thickness():
    # The same areas with a step twice as large: twice the volume.
    assert structure_volume_ml(uniform(), 20, 0, "LV") == 2 * structure_volume_ml(uniform(), 10, 0, "LV")


def test_ef_mass_and_the_sixty_percent_of_the_uniform_stack():
    measures = compute_measures(uniform(), 10, 0, 1)

    assert measures["lv"] == {"edvMl": 60, "esvMl": 24, "svMl": 36, "efPercent": pytest.approx(60.0)}
    assert measures["rv"]["edvMl"] == pytest.approx(72) and measures["rv"]["efPercent"] == pytest.approx(30 / 72 * 100)
    # 48 ml of myocardium at ED x 1.05 g/ml.
    assert MYOCARDIAL_DENSITY_G_ML == 1.05
    assert measures["lvMassG"] == pytest.approx(48 * 1.05)
    assert measures["lvefClass"] == "preserved"


def test_the_cardiac_output_needs_the_heart_rate_and_the_indexing_the_surface():
    bare = compute_measures(uniform(), 10, 0, 1)
    assert bare["cardiacOutputLMin"] is None and bare["indexed"] is None and bare["heartRateBpm"] is None

    rate = compute_measures(uniform(), 10, 0, 1, hr=60)
    assert rate["cardiacOutputLMin"] == pytest.approx(36 * 60 / 1000) and rate["indexed"] is None

    surface = compute_measures(uniform(), 10, 0, 1, bsa=2.0)
    assert surface["cardiacOutputLMin"] is None
    assert surface["indexed"]["lvEdvMlM2"] == pytest.approx(30) and surface["indexed"]["cardiacIndexLMinM2"] is None

    both = compute_measures(uniform(), 10, 0, 1, bsa=2.0, hr=60)
    assert both["indexed"]["cardiacIndexLMinM2"] == pytest.approx(2.16 / 2)


def test_excluded_slices_leave_every_sum_and_the_curve():
    areas = [
        [{"LV": 3000, "RV": 1, "MYO": 1}] + [{"LV": 1000, "RV": 1, "MYO": 1}] * 5,
        [{"LV": 1500, "RV": 1, "MYO": 1}] + [{"LV": 500, "RV": 1, "MYO": 1}] * 5,
    ]

    assert lv_volume_curve_ml(areas, 10) == pytest.approx([80, 40])
    assert lv_volume_curve_ml(areas, 10, [0]) == pytest.approx([50, 25])
    assert compute_measures(areas, 10, 0, 1, [0])["lv"]["efPercent"] == pytest.approx(50)
    assert compute_measures(areas, 10, 0, 1, [0])["excludedSlices"] == [0]


def test_ed_and_es_are_the_largest_and_the_smallest_lv_volume():
    assert automatic_phases([60.0, 55.0, 41.0, 30.0, 24.0, 28.0, 45.0, 58.0]) == (0, 4)
    assert automatic_phases([30.0, 62.0, 40.0, 25.0, 33.0]) == (1, 3)
    # Ties: the first phase.
    assert automatic_phases([50.0, 50.0, 20.0, 20.0]) == (0, 2)
    with pytest.raises(ValueError):
        automatic_phases([])


def test_a_negative_stroke_volume_is_computed_and_warned_about():
    measures = compute_measures(uniform(), 10, 1, 0)

    assert measures["lv"]["svMl"] == -36 and measures["lv"]["efPercent"] == pytest.approx(-150)
    assert measures["warnings"] == ["es_volume_exceeds_ed"]


def test_no_lv_at_ed_gives_no_ef_and_no_class():
    empty = [[{"LV": 0, "RV": 0, "MYO": 0}] * 6] * 2

    measures = compute_measures(empty, 10, 0, 1)

    assert measures["lv"]["efPercent"] is None and measures["lvefClass"] is None


@pytest.mark.parametrize(
    ("ef", "expected"),
    [
        (10.0, "reduced"),
        (39.9, "reduced"),
        (40.0, "reduced"),
        (40.4, "reduced"),
        (40.6, "mildlyReduced"),
        (41.0, "mildlyReduced"),
        (45.0, "mildlyReduced"),
        (49.0, "mildlyReduced"),
        (49.4, "mildlyReduced"),
        (49.6, "preserved"),
        (50.0, "preserved"),
        (62.0, "preserved"),
        (-5.0, "reduced"),
        (None, None),
        (float("nan"), None),
    ],
)
def test_the_esc_class_is_read_on_the_ef_rounded_to_the_unit(ef, expected):
    # 2021 ESC heart failure guidelines: <= 40 reduced, 41-49 mildly reduced, >= 50 preserved.
    assert lvef_class(ef) == expected


def test_mosteller():
    assert mosteller_bsa(180, 80) == pytest.approx(math.sqrt(180 * 80 / 3600))
    assert mosteller_bsa(170, 70) == pytest.approx(1.8181, abs=1e-4)
    for height, weight in ((0, 70), (170, 0), (-1, 70), (float("nan"), 70), (170, float("inf"))):
        assert mosteller_bsa(height, weight) is None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"ed": 2, "es": 0},
        {"ed": 0, "es": -1},
        {"ed": 0, "es": 1, "excluded_slices": [6]},
        {"ed": 0, "es": 1, "excluded_slices": [-1]},
        {"ed": 0, "es": 1, "excluded_slices": [0, 1, 2, 3, 4, 5]},
        {"ed": 0, "es": 1, "bsa": 0},
        {"ed": 0, "es": 1, "hr": -60},
    ],
)
def test_impossible_arguments_are_refused(kwargs):
    with pytest.raises(ValueError):
        compute_measures(uniform(), 10, **kwargs)


def test_a_bad_stack_or_step_is_refused():
    for spacing in (0, -3, float("nan")):
        with pytest.raises(ValueError):
            compute_measures(uniform(), spacing, 0, 1)
    with pytest.raises(ValueError):
        compute_measures([], 10, 0, 0)
    with pytest.raises(ValueError):
        compute_measures([uniform()[0], uniform(slices=5)[1]], 10, 0, 1)
