"""scripts/evaluate_brain.py reports: never overwritten; brain-latest.json from complete runs only."""

from __future__ import annotations

import datetime
import json
from pathlib import Path

import pytest

from scripts.evaluate_brain import LATEST_REPORT_NAME, is_complete, write_report

SHA = "311d2cbb171266721871f46f7f841b1dffef0c0fec40853745f55be9939ae654"
NOW = datetime.datetime(2026, 10, 9, 15, 30, 12)


def report(classification="ok", segmentation="ok", segmenters=("ok", "ok")) -> dict:
    return {
        "pipeline": "brain",
        "classification": None if classification is None else {"status": classification, "accuracy": {"value": 0.955}},
        "segmentation": None if segmentation is None else {
            "status": segmentation,
            "classes": {label: {"status": status} for label, status in zip(("meningioma", "pituitary"), segmenters)},
        },
    }


def test_a_report_is_never_overwritten(tmp_path: Path):
    first, _ = write_report(report(), tmp_path, SHA, NOW)
    first_text = first.read_text(encoding="utf-8")

    # Same second, same classifier: a new file, the first one untouched.
    second, _ = write_report(report(classification=None), tmp_path, SHA, NOW)
    third, _ = write_report(report(segmentation=None), tmp_path, SHA, NOW)

    assert first.name == "brain-2026-10-09-153012-311d2cbb.json"
    assert second.name == "brain-2026-10-09-153012-311d2cbb-2.json"
    assert third.name == "brain-2026-10-09-153012-311d2cbb-3.json"
    assert first.read_text(encoding="utf-8") == first_text
    # Each report names itself.
    assert [json.loads(path.read_text(encoding="utf-8"))["file"] for path in (first, second, third)] == [
        first.name, second.name, third.name,
    ]


def test_latest_is_a_copy_of_the_last_complete_report(tmp_path: Path):
    complete, updated = write_report(report(), tmp_path, SHA, NOW)
    latest = tmp_path / LATEST_REPORT_NAME

    assert updated
    assert latest.read_bytes() == complete.read_bytes()

    newer, updated = write_report(report(), tmp_path, SHA, NOW + datetime.timedelta(hours=1))
    assert updated
    assert latest.read_bytes() == newer.read_bytes()
    assert json.loads(latest.read_text(encoding="utf-8"))["file"] == newer.name


@pytest.mark.parametrize(
    "partial",
    [
        report(classification=None),  # segmentation only
        report(segmentation=None),  # classification only
        report(segmentation="stopped"),  # BRISC split not reproduced
        report(segmenters=("ok", "model_not_loaded")),
        report(classification="no_image"),
    ],
)
def test_a_partial_run_leaves_latest_alone(tmp_path: Path, partial: dict):
    complete, _ = write_report(report(), tmp_path, SHA, NOW)
    latest_before = (tmp_path / LATEST_REPORT_NAME).read_bytes()

    path, updated = write_report(partial, tmp_path, SHA, NOW + datetime.timedelta(minutes=5))

    assert not updated
    assert not is_complete(partial)
    assert path.exists() and path != complete
    assert (tmp_path / LATEST_REPORT_NAME).read_bytes() == latest_before


def test_no_latest_without_a_complete_report(tmp_path: Path):
    write_report(report(segmentation=None), tmp_path, SHA, NOW)

    assert not (tmp_path / LATEST_REPORT_NAME).exists()
