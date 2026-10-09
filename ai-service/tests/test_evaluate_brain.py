"""scripts/evaluate_brain.py: manifest parsing, split, metrics (no weights needed)."""

from __future__ import annotations

import datetime
from pathlib import Path

import cv2
import numpy as np
import pytest

from scripts.evaluate_brain import (
    BriscSplitError,
    accuracy_by_confidence,
    bootstrap_indices,
    classification_metrics,
    list_nickparvar_testing,
    load_brisc_pairs,
    mask_metrics,
    notebook_batch_means,
    notebook_test_split,
    percentile_ci,
    plan_brisc,
    reliability_table,
    report_path,
    summarize,
)

# --- BRISC manifest ---------------------------------------------------------


def write_png(path: Path, value: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = np.zeros((8, 8), np.uint8)
    image[2:5, 2:5] = value
    assert cv2.imwrite(str(path), image)


def write_jpeg(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    assert cv2.imwrite(str(path), np.full((8, 8, 3), 90, np.uint8))


def write_manifest(root: Path, rows: list[tuple[str, str, bool, str]]) -> None:
    lines = ["relative_path,tumor_label,task,is_mask"]
    lines += [f"{path},{label},{task},{is_mask}" for path, label, task, is_mask in rows]
    (root / "manifest.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def brisc(tmp_path: Path) -> Path:
    seg = tmp_path / "segmentation_task"
    for name in ("me_b", "me_a", "me_empty", "me_nomask", "pi_a"):
        write_jpeg(seg / "train" / "images" / f"{name}.jpg")
    write_jpeg(seg / "test" / "images" / "me_test.jpg")
    write_png(seg / "train" / "masks" / "me_b.png", 255)
    write_png(seg / "train" / "masks" / "me_a.png", 255)
    write_png(seg / "train" / "masks" / "me_empty.png", 0)
    write_png(seg / "train" / "masks" / "pi_a.png", 255)
    write_png(seg / "test" / "masks" / "me_test.png", 255)
    write_jpeg(tmp_path / "classification_task" / "train" / "meningioma" / "me_cls.jpg")

    # Windows separators, as in the BRISC manifest; masks listed before or
    # after their image; one image file missing on disk.
    write_manifest(tmp_path, [
        (r"segmentation_task\train\masks\me_a.png", "meningioma", "segmentation", True),
        (r"segmentation_task\train\images\me_b.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\test\images\me_test.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\images\me_a.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\images\me_empty.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\images\me_nomask.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\images\me_gone.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\masks\me_b.png", "meningioma", "segmentation", True),
        (r"segmentation_task\train\masks\me_empty.png", "meningioma", "segmentation", True),
        (r"segmentation_task\test\masks\me_test.png", "meningioma", "segmentation", True),
        (r"segmentation_task\train\images\pi_a.jpg", "pituitary", "segmentation", False),
        (r"segmentation_task\train\masks\pi_a.png", "pituitary", "segmentation", True),
        (r"classification_task\train\meningioma\me_cls.jpg", "meningioma", "classification", False),
    ])
    return tmp_path


def test_manifest_pairs_follow_the_notebook(brisc: Path):
    pairs = load_brisc_pairs(brisc, "meningioma")
    names = [(image.name, mask.name) for image, mask in pairs]

    # Manifest order of the images; Windows paths resolved; paired by file
    # name without extension; empty mask, missing mask and missing image left
    # out; classification rows and other classes ignored; the official test
    # folder is not set apart.
    assert names == [("me_b.jpg", "me_b.png"), ("me_test.jpg", "me_test.png"), ("me_a.jpg", "me_a.png")]
    assert all(image.exists() and mask.exists() for image, mask in pairs)
    assert [image.name for image, _ in load_brisc_pairs(brisc, "pituitary")] == ["pi_a.jpg"]


def test_manifest_without_the_expected_columns_stops(tmp_path: Path):
    (tmp_path / "manifest.csv").write_text("path,label\nx.jpg,meningioma\n", encoding="utf-8")

    with pytest.raises(BriscSplitError, match="is_mask"):
        load_brisc_pairs(tmp_path, "meningioma")


def test_notebook_split_gives_123_and_132_test_images():
    meningioma = notebook_test_split(list(range(1635)))
    pituitary = notebook_test_split(list(range(1757)))

    assert (len(meningioma), len(pituitary)) == (123, 132)
    # Deterministic (random_state=42 twice).
    assert notebook_test_split(list(range(1635))) == meningioma


def test_another_split_stops_the_segmentation(brisc: Path):
    # 3 meningioma pairs and 1 pituitary pair, not 1635 and 1757.
    with pytest.raises(BriscSplitError, match="attendu 1635 et 123"):
        plan_brisc(brisc)


# --- Nickparvar ---------------------------------------------------------------


def test_nickparvar_folders_map_like_the_notebook(tmp_path: Path):
    for folder, files in {
        "glioma": ["a.jpg", "b.PNG", "notes.txt"],
        "no_tumor": ["c.jpeg"],
        "normal": ["d.jpg"],
        "Pituitary": ["e.jpg"],
        "other": ["f.jpg"],
    }.items():
        for name in files:
            path = tmp_path / folder / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"x")

    samples, ignored = list_nickparvar_testing(tmp_path)

    # Folder names compared in lower case; only image files kept.
    assert sorted((path.name, label) for path, label in samples) == [
        ("a.jpg", 0), ("b.PNG", 0), ("c.jpeg", 2), ("d.jpg", 2), ("e.jpg", 3),
    ]
    assert ignored == ["other"]


# --- Segmentation metrics -----------------------------------------------------


def test_mask_metrics_on_hand_made_masks():
    predicted = np.array([[1, 1, 0], [0, 0, 0]])
    truth = np.array([[1, 0, 0], [1, 0, 0]])

    # intersection 1, predicted 2, true 2, union 3
    assert mask_metrics(predicted, truth) == pytest.approx({"dice": 0.5, "iou": 1 / 3, "sensitivity": 0.5})
    assert mask_metrics(truth, truth) == {"dice": 1.0, "iou": 1.0, "sensitivity": 1.0}
    assert mask_metrics(np.zeros((2, 2)), np.zeros((2, 2))) == {"dice": 1.0, "iou": 1.0, "sensitivity": None}
    assert mask_metrics(np.zeros((2, 2)), np.ones((2, 2))) == {"dice": 0.0, "iou": 0.0, "sensitivity": 0.0}


def test_notebook_dice_averages_batch_means():
    # Per-image Dice 1, 0.5 and 0: per image 0.5; per batch of 2,
    # mean(0.75, 0) = 0.375 — the short last batch weighs as much as a full one.
    result = notebook_batch_means([2, 1, 0], [2, 2, 2], [2, 2, 2], batch_size=2, smooth=0.0)

    assert result["dice"] == pytest.approx(0.375)
    assert result["iou"] == pytest.approx(np.mean([np.mean([1.0, 1 / 3]), 0.0]))
    # Pooled per batch: (2 + 1) / (2 + 2), then 0 / 2.
    assert result["sensitivity"] == pytest.approx(np.mean([0.75, 0.0]))


# --- Classification metrics ---------------------------------------------------


def test_expected_calibration_error_on_a_hand_made_case():
    confidence = np.array([0.95, 0.95, 0.65, 0.3])
    correct = np.array([True, False, True, True])

    ece, bins = reliability_table(confidence, correct)

    # 2/4 * |0.5 - 0.95| + 1/4 * |1 - 0.65| + 1/4 * |1 - 0.3|
    assert ece == pytest.approx(0.225 + 0.0875 + 0.175)
    assert [row["count"] for row in bins] == [0, 0, 1, 0, 0, 0, 1, 0, 0, 2]
    # 0.3 falls in (0.2, 0.3], not in (0.3, 0.4].
    assert (bins[2]["lower"], bins[2]["upper"], bins[2]["accuracy"]) == (0.2, 0.3, 1.0)
    assert bins[0]["meanConfidence"] is None


def test_accuracy_above_a_confidence_threshold():
    rows = accuracy_by_confidence(np.array([0.5, 0.7, 0.9, 0.96]), np.array([False, True, True, False]))

    assert [row["threshold"] for row in rows] == [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]
    assert rows[0] == {"threshold": 0.5, "count": 4, "coverage": 1.0, "accuracy": 0.5}
    assert rows[4] == {"threshold": 0.7, "count": 3, "coverage": 0.75, "accuracy": pytest.approx(2 / 3)}
    assert rows[9] == {"threshold": 0.95, "count": 1, "coverage": 0.25, "accuracy": 0.0}


def test_classification_metrics_on_a_small_case():
    y_true = np.array([0, 0, 1, 2, 3, 3])
    probabilities = np.array([
        [0.7, 0.1, 0.1, 0.1],  # glioma, right
        [0.2, 0.6, 0.1, 0.1],  # glioma read as meningioma
        [0.1, 0.8, 0.05, 0.05],
        [0.1, 0.1, 0.7, 0.1],
        [0.05, 0.05, 0.1, 0.8],
        [0.1, 0.1, 0.1, 0.7],
    ])

    metrics = classification_metrics(y_true, probabilities)

    assert metrics["accuracy"]["value"] == pytest.approx(5 / 6)
    assert metrics["confusionMatrix"]["matrix"] == [[1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 2]]
    assert metrics["perClass"]["glioma"]["recall"] == 0.5
    assert metrics["perClass"]["meningioma"]["precision"] == 0.5
    assert metrics["perClass"]["pituitary"]["f1"] == 1.0
    assert metrics["perClass"]["glioma"]["auc"] == 1.0
    lower, upper = metrics["accuracy"]["ci95"]
    assert 0 <= lower <= 5 / 6 <= upper <= 1


# --- Bootstrap ----------------------------------------------------------------


def test_bootstrap_is_reproducible_with_its_seed():
    assert np.array_equal(bootstrap_indices(50, draws=20, seed=7), bootstrap_indices(50, draws=20, seed=7))
    assert not np.array_equal(bootstrap_indices(50, draws=20, seed=7), bootstrap_indices(50, draws=20, seed=8))

    values = np.random.default_rng(0).random(40)
    assert summarize(values) == summarize(values)


def test_summary_leaves_undefined_values_out():
    summary = summarize([0.8, np.nan, 0.6, 0.7])

    assert summary["n"] == 3
    assert summary["mean"] == pytest.approx(0.7)
    assert summary["median"] == pytest.approx(0.7)
    assert summary["ci95"][0] <= 0.7 <= summary["ci95"][1]
    assert summarize([np.nan]) == {"n": 0, "mean": None, "median": None, "ci95": None}
    assert percentile_ci(np.full(10, 0.9)) == [0.9, 0.9]


def test_report_name_carries_the_date_and_the_classifier_hash(tmp_path: Path):
    path = report_path(tmp_path, "311d2cbb171266721871f46f7f841b1d", datetime.date(2026, 10, 9))

    assert path == tmp_path / "brain-2026-10-09-311d2cbb.json"
