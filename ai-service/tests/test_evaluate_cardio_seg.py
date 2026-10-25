"""scripts/evaluate_cardio_seg.py without ACDC: volumes, remapping, 3D Dice,
summary, comparison with the card, and the count check before inference."""

from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import h5py
import numpy as np
import pytest

from scripts.evaluate_cardio_seg import (
    LATEST_REPORT_NAME,
    compare,
    dice_3d,
    evaluate_volumes,
    find_volumes,
    main,
    read_slice,
    remap_acdc,
    summarize,
    write_report,
)
from scripts.evaluate_cardio_volume import evaluate_volumes as evaluate_volume_measures

CARD = json.loads((Path(__file__).resolve().parent / "fixtures" / "cardio-seg" / "model-card.json").read_text(encoding="utf-8"))


def write_slice(folder: Path, patient: int, frame: int, index: int, label: np.ndarray) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    with h5py.File(folder / f"patient{patient:03d}_frame{frame:02d}_slice_{index}.h5", "w") as handle:
        handle["image"] = (label * 50).astype(np.float32)
        handle["label"] = label


def test_finds_the_volumes_of_the_test_patients_only(tmp_path):
    label = np.zeros((8, 8), dtype=np.uint8)
    for index in (2, 0, 1):
        write_slice(tmp_path / "a" / "b", 1, 1, index, label)
    write_slice(tmp_path, 1, 12, 0, label)
    write_slice(tmp_path, 2, 1, 0, label)  # not a test patient

    volumes = find_volumes(tmp_path, [1, 19])

    assert list(volumes) == [(1, 1), (1, 12)]
    assert [path.name for path in volumes[(1, 1)]] == [
        "patient001_frame01_slice_0.h5",
        "patient001_frame01_slice_1.h5",
        "patient001_frame01_slice_2.h5",
    ]


def test_2d_and_3d_patients_have_the_same_ordered_slices_and_evaluation(tmp_path):
    labels = np.zeros((3, 8, 8), dtype=np.uint8)
    for index, value in enumerate((3, 1, 2)):
        labels[index, 2:6, 2:6] = value
    images = (labels * 50).astype(np.float32)
    for index in (2, 0, 1):
        write_slice(tmp_path / "slices", 1, 1, index, labels[index])
    volume_path = tmp_path / "ACDC_testing_volumes" / "patient110_frame01.h5"
    volume_path.parent.mkdir()
    with h5py.File(volume_path, "w") as handle:
        handle["image"] = images
        handle["label"] = labels
    # A complete 2D phase takes precedence even if its 3D counterpart has bad axes.
    with h5py.File(tmp_path / "patient001_frame01.h5", "w") as handle:
        handle["image"] = np.zeros((8, 3, 8), dtype=np.float32)
        handle["label"] = np.zeros((8, 3, 8), dtype=np.uint8)

    volumes = find_volumes(tmp_path, [110, 1])
    assert list(volumes) == [(1, 1), (110, 1)]
    assert [path.name for path in volumes[(1, 1)]] == [
        f"patient001_frame01_slice_{index}.h5" for index in range(3)
    ]
    assert volumes[(110, 1)] == [(volume_path, index) for index in range(3)]
    for sources in volumes.values():
        for index, source in enumerate(sources):
            image, label = read_slice(source)
            np.testing.assert_array_equal(image, images[index])
            np.testing.assert_array_equal(label, labels[index])

    seen_single, seen_batch = [], []

    def predict(image):
        seen_single.append(image.copy())
        return cv2.resize(remap_acdc((image / 50).astype(np.uint8)), (16, 16), interpolation=cv2.INTER_NEAREST)

    def predict_batch(batch):
        seen_batch.extend(image.copy() for image in batch)
        return [cv2.resize(remap_acdc((image / 50).astype(np.uint8)), (16, 16), interpolation=cv2.INTER_NEAREST) for image in batch]

    segmented = evaluate_volumes(volumes, predict, 16)
    measured = evaluate_volume_measures(volumes, predict_batch, 16)
    assert [(v["patient"], v["frame"], v["slices"]) for v in segmented] == [(1, 1, 3), (110, 1, 3)]
    assert [v["dice"] for v in segmented] == [v["dice"] for v in measured] == [
        {"LV": 1.0, "RV": 1.0, "MYO": 1.0}
    ] * 2
    for seen in (seen_single, seen_batch):
        for index, image in enumerate(seen):
            np.testing.assert_array_equal(image, images[index % 3])


def test_3d_volume_rejects_an_axis_zero_that_is_not_the_smallest(tmp_path):
    path = tmp_path / "patient110_frame01.h5"
    with h5py.File(path, "w") as handle:
        handle["image"] = np.zeros((8, 3, 8), dtype=np.float32)
        handle["label"] = np.zeros((8, 3, 8), dtype=np.uint8)

    with pytest.raises(ValueError, match=r"patient110_frame01\.h5: axis 0 must be the smallest axis.*\(8, 3, 8\)"):
        find_volumes(tmp_path, [110])


def test_remaps_acdc_labels_to_the_models():
    assert remap_acdc(np.array([0, 1, 2, 3], dtype=np.uint8)).tolist() == [0, 2, 3, 1]


def test_dice_is_nan_when_the_structure_is_in_neither():
    truth = np.array([[1, 1, 0], [0, 2, 2]])
    predicted = np.array([[1, 0, 0], [0, 2, 2]])
    assert dice_3d(predicted, truth, 1) == pytest.approx(2 / 3)
    assert dice_3d(predicted, truth, 2) == 1.0
    assert math.isnan(dice_3d(predicted, truth, 3))


def test_evaluates_at_256_and_summarizes_without_the_undefined_volumes(tmp_path):
    label = np.zeros((64, 64), dtype=np.uint8)
    label[10:20, 10:20] = 3  # ACDC LV
    label[30:40, 30:40] = 1  # ACDC RV
    write_slice(tmp_path, 1, 1, 0, label)
    volumes = find_volumes(tmp_path, [1])

    def perfect(pixels: np.ndarray) -> np.ndarray:
        # The written image is the ACDC label x 50: its own ground truth.
        return cv2.resize(remap_acdc((pixels / 50).astype(np.uint8)), (256, 256), interpolation=cv2.INTER_NEAREST)

    per_volume = evaluate_volumes(volumes, perfect, 256)
    summary = summarize(per_volume)

    assert per_volume[0]["dice"]["LV"] == 1.0 and per_volume[0]["dice"]["RV"] == 1.0
    assert math.isnan(per_volume[0]["dice"]["MYO"])
    assert summary["perClass"]["MYO"] == {"mean": None, "n": 0, "std": None}
    assert summary["mean"] == 1.0


def test_compares_with_the_cards_mean_within_0005():
    card_test = CARD["test"]
    assert compare({"mean": card_test["mean"] + 0.004}, card_test)["ok"] is True
    assert compare({"mean": card_test["mean"] - 0.006}, card_test)["ok"] is False


def test_writes_a_named_report_and_its_latest_copy(tmp_path):
    path = write_report({"pipeline": "cardio-seg-mri"}, tmp_path, "252fb672137d")
    assert path.name.endswith("-252fb672.json")
    assert json.loads((tmp_path / LATEST_REPORT_NAME).read_text(encoding="utf-8")) == {
        "file": path.name,
        "pipeline": "cardio-seg-mri",
    }


def test_stops_before_any_inference_without_the_44_volumes(tmp_path, monkeypatch):
    write_slice(tmp_path, 1, 1, 0, np.zeros((8, 8), dtype=np.uint8))

    class Entry:
        loaded = True
        config = {"card": CARD, "input_size": 256}

    monkeypatch.setattr("scripts.evaluate_cardio_seg.load_cardio_seg_model", lambda _: Entry())
    monkeypatch.setattr(
        "scripts.evaluate_cardio_seg.evaluate_volumes",
        lambda *args, **kwargs: pytest.fail("inference started"),
    )

    assert main(["--acdc", str(tmp_path), "--output-dir", str(tmp_path / "out")]) == 2
    assert main(["--acdc", str(tmp_path / "missing")]) == 2
