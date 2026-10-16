"""Offline evaluation of the pathology pipelines, as the service runs them.

Measures the service's actual level, not the training notebooks' figures:
every image goes through the service's own code (app.pathology_pipeline:
analyze_breast and analyze_nuclei, from the image bytes), on CPU.

    .venv/Scripts/python -m scripts.evaluate_pathology \\
        --breakhis-root <folder holding BreaKHis_v1> --pannuke-root <folder holding fold_3>

BreakHis: the patient-level test split of the BreakHis notebook
(notebooks/breakhis-classification-efficientnetb0.ipynb), rebuilt and
checked (13 patients, 1,346 images) before any inference. PanNuke: Fold 3
(the test fold of notebooks/pannuke-segmentation.ipynb), with Dice and IoU
from pixel counts pooled over the fold, and a check of the tiled path on
2 x 2 mosaics of its patches.

Writes evaluation/pathology-<date>-<HHMMSS>-<sha256[:8] of each model>.json
and prints a summary. No image is written.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import json
import logging
import platform
import re
import shutil
import sys
import time
from pathlib import Path

if __package__ in (None, ""):
    # Run as a file (python scripts/evaluate_pathology.py): make `app` and `scripts` importable.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import sklearn  # noqa: E402
from sklearn.metrics import average_precision_score, roc_auc_score  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402

from app.config import load_settings  # noqa: E402
from app.models import ModelRegistry  # noqa: E402
from app.pathology_models import (  # noqa: E402
    BREAST_CLASSIFIER_ID,
    NUCLEI_CLASSES,
    NUCLEI_SEGMENTER_ID,
    configure_tensorflow_threads,
    keras,
    load_pathology_models,
    tf,
)
from app.pathology_pipeline import (  # noqa: E402
    NUCLEI_MARGIN,
    NUCLEI_OVERLAP,
    NUCLEI_TILE,
    TTA_VIEWS,
    analyze_breast,
    analyze_nuclei,
)
from app.preprocess import InvalidImage  # noqa: E402
from scripts.evaluate_brain import (  # noqa: E402
    BOOTSTRAP_DRAWS,
    BOOTSTRAP_SEED,
    SetupError,
    _indented,
    _json_default,
    _missing_folder,
    _percent,
    normalize_path,
    percentile_ci,
)

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "evaluation"
LATEST_REPORT_NAME = "pathology-latest.json"

# ---------------------------------------------------------------------------
# BreakHis: the notebook's index and patient-level split
# ---------------------------------------------------------------------------

BREAKHIS_FOLDER = "BreaKHis_v1"
BREAKHIS_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}
# extract_patient_id of the notebook (cell 3B): class, subtype, patient, magnification.
BREAKHIS_FILENAME = re.compile(r"^SOB_([BM])_([A-Z]+)-(\d+-[A-Za-z0-9]+)-(40|100|200|400)-\d+\.png$", re.IGNORECASE)
BREAKHIS_CLASSES = ("benign", "malignant")
# Images indexed by the notebook (7,909): informative, the split is what is checked.
BREAKHIS_NOTEBOOK_INDEXED = 7909
# The notebook's test patients. Any other split would mix training patients.
BREAKHIS_TEST_PATIENTS = (
    "14-11031", "14-12773", "14-14946", "14-15704", "14-16456", "14-19854C", "14-21978AB",
    "14-22704", "14-2773", "14-29315EF", "14-3909", "14-4372", "14-9146",
)
BREAKHIS_TEST_IMAGES = {"total": 1346, "benign": 347, "malignant": 999}

# ---------------------------------------------------------------------------
# PanNuke: Fold 3
# ---------------------------------------------------------------------------

PANNUKE_TEST_FOLD = "fold_3"
PANNUKE_TEST_IMAGES = 2722
PANNUKE_FILES = ("images.npy", "masks.npy", "types.npy")
PANNUKE_IGNORE = 255
NUCLEUS_TYPES = NUCLEI_CLASSES[1:]

# Reported by the notebooks (notebooks/ at the repository root), for comparison only.
NOTEBOOK_REPORTED = {
    "breakhis": {
        "accuracy": 0.8819,
        "aucRoc": 0.9392,
        "confusionMatrix": [[262, 85], [74, 925]],
        "note": "Phase 2 + TTA at threshold 0.13 on the 13 test patients (cell 20 of the notebook, on GPU)",
    },
    "pannuke": {
        "dice": {
            "background": 0.9625, "neoplastic": 0.7119, "inflammatory": 0.6239,
            "connective": 0.5600, "dead": 0.3056, "epithelial": 0.6230,
        },
        "nucleiMeanDice": 0.5649,
        "note": "Cell 10 of the notebook evaluates val_dataset.take(316): Fold 2, the validation fold "
        "(the one phase2_best was selected on), not Fold 3. A gap with the Fold 3 figures is expected.",
    },
}

logger = logging.getLogger("evaluate_pathology")


class BreakhisSplitError(Exception):
    """The notebook's BreakHis split cannot be reproduced: no BreakHis metric."""


class PannukeDataError(Exception):
    """Fold 3 is not the one the notebook tested on: no PanNuke metric."""


# ---------------------------------------------------------------------------
# BreakHis index and split (pure)
# ---------------------------------------------------------------------------


def parse_breakhis_name(name: str) -> dict | None:
    """Class letter, subtype, patient and magnification of SOB_<B|M>_<subtype>-<patient>-<magnification>-<n>.png."""
    match = BREAKHIS_FILENAME.match(name)
    if match is None:
        return None
    return {
        "code": match.group(1).upper(),
        "subtype": match.group(2).upper(),
        "patient": match.group(3),
        "magnification": int(match.group(4)),
    }


def label_from_path(path: Path) -> str | None:
    """benign or malignant, from the folder the image sits in (…/breast/benign/…)."""
    parts = {part.lower() for part in path.parts[:-1]}
    found = [label for label in BREAKHIS_CLASSES if label in parts]
    return found[0] if len(found) == 1 else None


def list_breakhis_images(data_root: Path) -> list[Path]:
    """Every image under BreaKHis_v1, sorted (the notebook's recursive glob, duplicates removed)."""
    return sorted({path for path in data_root.rglob("*") if path.is_file() and path.suffix.lower() in BREAKHIS_IMAGE_SUFFIXES})


def build_breakhis_index(paths: list[Path]) -> tuple[pd.DataFrame, list[str], list[str]]:
    """(index, ignored file names, files whose path and name disagree on the class).

    Label from the path; patient and magnification from the file name, as the
    notebook extracts them. A file whose name does not match is ignored.
    """
    rows, ignored, disagreeing = [], [], []
    for path in paths:
        parsed = parse_breakhis_name(path.name)
        if parsed is None:
            ignored.append(path.name)
            continue
        label = label_from_path(path)
        if label is None or label[0].upper() != parsed["code"]:
            disagreeing.append(str(path))
            continue
        rows.append({"path": path, "label": label, "patient": parsed["patient"], "magnification": parsed["magnification"]})
    return pd.DataFrame(rows, columns=["path", "label", "patient", "magnification"]), ignored, disagreeing


def patient_table(index: pd.DataFrame) -> pd.DataFrame:
    """One row per patient, sorted by patient, with the label of its first image (as the notebook)."""
    labels_per_patient = index.groupby("patient")["label"].nunique()
    mixed = labels_per_patient[labels_per_patient > 1]
    if len(mixed):
        raise BreakhisSplitError(f"{len(mixed)} patient(s) avec deux classes : {', '.join(mixed.index[:5])}.")
    return index.groupby("patient").agg(label=("label", "first"), images=("path", "count")).reset_index()


def notebook_test_patients(patients: pd.DataFrame) -> list[str]:
    """The notebook's test patients: 30 % held out (stratified, seed 42), then the second half of it."""
    _, held_out = train_test_split(patients, test_size=0.30, random_state=42, stratify=patients["label"])
    _, test = train_test_split(held_out, test_size=0.50, random_state=42, stratify=held_out["label"])
    return sorted(test["patient"])


def plan_breakhis(index: pd.DataFrame) -> pd.DataFrame:
    """The test images; BreakhisSplitError unless the split is exactly the notebook's."""
    if index.empty:
        raise BreakhisSplitError("aucune image BreakHis reconnue.")
    patients = patient_table(index)
    try:
        test_patients = notebook_test_patients(patients)
    except ValueError as error:  # too few patients per class to split
        raise BreakhisSplitError(f"découpage impossible ({error}).") from error

    test = index[index["patient"].isin(test_patients)].sort_values("path").reset_index(drop=True)
    counts = {"total": len(test), **{label: int((test["label"] == label).sum()) for label in BREAKHIS_CLASSES}}
    problems = []
    if test_patients != sorted(BREAKHIS_TEST_PATIENTS):
        problems.append(f"patients de test {', '.join(test_patients)} (attendu {', '.join(BREAKHIS_TEST_PATIENTS)})")
    if counts != BREAKHIS_TEST_IMAGES:
        problems.append(
            f"{counts['total']} images de test, {counts['benign']} bénignes, {counts['malignant']} malignes "
            f"(attendu {BREAKHIS_TEST_IMAGES['total']}, {BREAKHIS_TEST_IMAGES['benign']} et {BREAKHIS_TEST_IMAGES['malignant']})"
        )
    if problems:
        raise BreakhisSplitError(
            "Découpage du notebook non reproduit — " + " ; ".join(problems) + ". "
            "Un autre découpage mélangerait des patients d'entraînement au test."
        )
    return test


# ---------------------------------------------------------------------------
# Statistics (pure)
# ---------------------------------------------------------------------------


def _ratio(numerator: float, denominator: float) -> float | None:
    return None if denominator == 0 else float(numerator) / float(denominator)


def binary_metrics(y_true, scores, threshold: float) -> dict:
    """Metrics of the malignant class at `threshold` (decision: score >= threshold)."""
    y_true = np.asarray(y_true, dtype=int)
    scores = np.asarray(scores, dtype=float)
    predicted = (scores >= threshold).astype(int)
    tp = int(((predicted == 1) & (y_true == 1)).sum())
    tn = int(((predicted == 0) & (y_true == 0)).sum())
    fp = int(((predicted == 1) & (y_true == 0)).sum())
    fn = int(((predicted == 0) & (y_true == 1)).sum())
    both_classes = 0 < y_true.sum() < y_true.size
    return {
        "n": int(y_true.size),
        "accuracy": _ratio(tp + tn, y_true.size),
        "sensitivity": _ratio(tp, tp + fn),
        "specificity": _ratio(tn, tn + fp),
        "precision": _ratio(tp, tp + fp),
        "f1": _ratio(2 * tp, 2 * tp + fp + fn),
        "aucRoc": float(roc_auc_score(y_true, scores)) if both_classes else None,
        "aucPr": float(average_precision_score(y_true, scores)) if both_classes else None,
        "confusionMatrix": [[tn, fp], [fn, tp]],
    }


BOOTSTRAPPED = ("accuracy", "sensitivity", "specificity", "precision", "f1", "aucRoc", "aucPr")


def patient_bootstrap(patients, y_true, scores, threshold: float, draws: int = BOOTSTRAP_DRAWS, seed: int = BOOTSTRAP_SEED) -> dict:
    """95 % intervals from resampling PATIENTS with replacement (all the images of each drawn patient).

    A draw where a metric is undefined (no benign patient drawn, for
    instance) is left out of that metric's interval; `draws` says how many count.
    """
    patients = np.asarray(patients)
    y_true = np.asarray(y_true, dtype=int)
    scores = np.asarray(scores, dtype=float)
    ids = sorted(set(patients.tolist()))
    images_of = [np.flatnonzero(patients == patient) for patient in ids]
    rng = np.random.default_rng(seed)
    samples = {key: [] for key in BOOTSTRAPPED}
    for _ in range(draws):
        drawn = rng.integers(0, len(ids), size=len(ids))
        rows = np.concatenate([images_of[index] for index in drawn])
        metrics = binary_metrics(y_true[rows], scores[rows], threshold)
        for key in BOOTSTRAPPED:
            samples[key].append(np.nan if metrics[key] is None else metrics[key])
    return {
        key: {"ci95": percentile_ci(np.array(values)), "draws": int(np.isfinite(values).sum())}
        for key, values in samples.items()
    }


def patient_summary(patients, y_true, scores, threshold: float) -> list[dict]:
    """Per patient: images, mean score and majority decision of its images."""
    frame = pd.DataFrame({"patient": patients, "label": y_true, "score": scores})
    rows = []
    for patient, group in frame.groupby("patient"):
        malignant_votes = int((group["score"] >= threshold).sum())
        benign_votes = len(group) - malignant_votes
        majority = "malignant" if malignant_votes > benign_votes else "benign" if benign_votes > malignant_votes else "tie"
        label = BREAKHIS_CLASSES[int(group["label"].iloc[0])]
        rows.append({
            "patient": patient,
            "label": label,
            "images": len(group),
            "meanScore": float(group["score"].mean()),
            "majorityDecision": majority,
            "majorityCorrect": majority == label,
            "imageAccuracy": float(((group["score"] >= threshold).astype(int) == group["label"]).mean()),
        })
    return rows


def pannuke_reference(mask: np.ndarray) -> np.ndarray:
    """(H, W) labels from a PanNuke mask (H, W, 6): channel c (0-4) > 0 -> c + 1; several -> 255; none -> 0."""
    occupied = np.asarray(mask)[..., :5] > 0
    count = occupied.sum(axis=-1)
    labels = np.zeros(count.shape, dtype=np.uint8)
    single = count == 1
    labels[single] = (occupied[single].argmax(axis=-1) + 1).astype(np.uint8)
    labels[count > 1] = PANNUKE_IGNORE
    return labels


def confusion_counts(truth: np.ndarray, predicted: np.ndarray, classes: int = len(NUCLEI_CLASSES)) -> np.ndarray:
    """(classes, classes) pixel counts, rows: reference, columns: prediction; ignored pixels left out."""
    truth = np.asarray(truth).ravel()
    predicted = np.asarray(predicted).ravel().astype(np.int64)
    kept = truth != PANNUKE_IGNORE
    return np.bincount(truth[kept].astype(np.int64) * classes + predicted[kept], minlength=classes * classes).reshape(classes, classes)


def dice_iou(confusion: np.ndarray) -> dict:
    """Dice and IoU per class from pooled pixel counts (None when the class is absent from both)."""
    confusion = np.asarray(confusion, dtype=np.int64)
    result = {}
    for index, name in enumerate(NUCLEI_CLASSES):
        intersection = int(confusion[index, index])
        true_area = int(confusion[index].sum())
        predicted_area = int(confusion[:, index].sum())
        result[name] = {
            "dice": _ratio(2 * intersection, true_area + predicted_area),
            "iou": _ratio(intersection, true_area + predicted_area - intersection),
            "truePixels": true_area,
            "predictedPixels": predicted_area,
        }
    return result


def nuclei_mean_dice(per_class: dict) -> float | None:
    """Mean Dice of the 5 nucleus types (None if one of them is undefined)."""
    values = [per_class[name]["dice"] for name in NUCLEUS_TYPES]
    return None if any(value is None for value in values) else float(np.mean(values))


def segmentation_summary(confusion: np.ndarray) -> dict:
    per_class = dice_iou(confusion)
    return {"perClass": per_class, "nucleiMeanDice": nuclei_mean_dice(per_class), "pixels": int(np.asarray(confusion).sum())}


def mosaic(tiles: list[np.ndarray]) -> np.ndarray:
    """2 x 2 mosaic of 4 equal patches: [[0, 1], [2, 3]]."""
    top = np.concatenate(tiles[:2], axis=1)
    bottom = np.concatenate(tiles[2:4], axis=1)
    return np.concatenate([top, bottom], axis=0)


# ---------------------------------------------------------------------------
# Setup: paths and datasets as the user gives them
# ---------------------------------------------------------------------------


def resolve_breakhis(root: Path) -> Path:
    """The BreaKHis_v1 folder: inside the given one, or the given one itself."""
    if not root.is_dir():
        raise _missing_folder(root)
    if root.name.lower() == BREAKHIS_FOLDER.lower():
        return root
    inside = [child for child in root.iterdir() if child.is_dir() and child.name.lower() == BREAKHIS_FOLDER.lower()]
    if not inside:
        raise SetupError(f"Dossier {BREAKHIS_FOLDER} introuvable dans {root}. Indiquez le dossier qui contient {BREAKHIS_FOLDER}.")
    return inside[0]


def locate_pannuke(root: Path) -> dict[str, Path]:
    """images.npy, masks.npy and types.npy of fold_3 (each found once, at any depth inside it)."""
    if not root.is_dir():
        raise _missing_folder(root)
    fold = root / PANNUKE_TEST_FOLD
    if not fold.is_dir():
        found = ", ".join(sorted(child.name for child in root.iterdir() if child.is_dir())) or "aucun sous-dossier"
        raise SetupError(f"Dossier {PANNUKE_TEST_FOLD} introuvable dans {root} (trouvé : {found}). "
                         "Indiquez le dossier qui contient fold_1, fold_2 et fold_3.")
    files = {}
    for name in PANNUKE_FILES:
        matches = sorted(fold.rglob(name))
        if len(matches) != 1:
            where = "".join(f"\n  {path}" for path in matches)
            raise SetupError(f"{name} trouvé {len(matches)} fois dans {fold} (attendu une fois).{where}")
        files[name] = matches[0]
    return files


def open_pannuke(files: dict[str, Path]) -> dict[str, np.ndarray]:
    """Memory-mapped Fold 3 arrays; PannukeDataError unless they are the notebook's test fold."""
    try:
        # allow_pickle stays off: a downloaded .npy never runs code.
        arrays = {name.removesuffix(".npy"): np.load(path, mmap_mode="r", allow_pickle=False) for name, path in files.items()}
    except (OSError, ValueError) as error:
        raise PannukeDataError(f"Lecture impossible des fichiers de {PANNUKE_TEST_FOLD} : {error}") from error
    expected = {
        "images": (PANNUKE_TEST_IMAGES, NUCLEI_TILE, NUCLEI_TILE, 3),
        "masks": (PANNUKE_TEST_IMAGES, NUCLEI_TILE, NUCLEI_TILE, 6),
        "types": (PANNUKE_TEST_IMAGES,),
    }
    mismatches = [f"{name} {arrays[name].shape} (attendu {shape})" for name, shape in expected.items() if arrays[name].shape != shape]
    if mismatches:
        raise PannukeDataError(
            "Fold 3 inattendu — " + " ; ".join(mismatches) + ". "
            f"Le test du notebook est le Fold 3 de PanNuke ({PANNUKE_TEST_IMAGES} images)."
        )
    return arrays


# ---------------------------------------------------------------------------
# Inference, through the service's code
# ---------------------------------------------------------------------------


def _progress(task: str, done: int, total: int) -> None:
    if done == total or done % 100 == 0:
        print(f"  {task} : {done}/{total}", file=sys.stderr, flush=True)


def evaluate_breakhis(test: pd.DataFrame, data_root: Path, registry: ModelRegistry, max_pixels: int) -> dict:
    started = time.perf_counter()
    entry = registry.get(BREAST_CLASSIFIER_ID)
    threshold = entry.config["threshold"]
    labels, scores, patients, magnifications, unreadable = [], [], [], [], []

    for done, row in enumerate(test.itertuples(index=False), start=1):
        try:
            # The service's endpoint code, from the file's bytes.
            result = analyze_breast(row.path.read_bytes(), row.magnification, registry, max_pixels)
        except InvalidImage as error:
            unreadable.append({"file": row.path.name, "reason": error.reason})
        else:
            labels.append(BREAKHIS_CLASSES.index(row.label))
            scores.append(result["malignancyScore"])
            patients.append(row.patient)
            magnifications.append(row.magnification)
        _progress("BreakHis", done, len(test))

    result = {
        "dataset": {
            "name": "BreakHis v1 (BreaKHis_v1), patient-level test split of the notebook",
            "folder": data_root.name,
            "testPatients": sorted(set(test["patient"])),
            "testImages": {"total": len(test), **{label: int((test["label"] == label).sum()) for label in BREAKHIS_CLASSES}},
            "unreadable": unreadable,
        },
        "threshold": threshold,
    }
    if not labels:
        result["status"] = "no_image"
        return result

    labels, scores = np.array(labels), np.array(scores)
    patients, magnifications = np.array(patients), np.array(magnifications)
    metrics = binary_metrics(labels, scores, threshold)
    per_patient = patient_summary(patients, labels, scores, threshold)
    reported = NOTEBOOK_REPORTED["breakhis"]
    result.update(
        status="ok",
        **metrics,
        bootstrap={"unit": "patient", "draws": BOOTSTRAP_DRAWS, "seed": BOOTSTRAP_SEED, "interval": "percentile 2.5-97.5",
                   **patient_bootstrap(patients, labels, scores, threshold)},
        byMagnification={
            str(magnification): binary_metrics(labels[magnifications == magnification], scores[magnifications == magnification], threshold)
            for magnification in sorted(set(magnifications.tolist()))
        },
        byPatient=per_patient,
        patientLevel={
            "patients": len(per_patient),
            "majorityCorrect": sum(row["majorityCorrect"] for row in per_patient),
        },
        notebookReported=reported,
        comparison={
            "accuracy": {"service": metrics["accuracy"], "notebook": reported["accuracy"],
                         "difference": metrics["accuracy"] - reported["accuracy"]},
            "aucRoc": {"service": metrics["aucRoc"], "notebook": reported["aucRoc"],
                       "difference": None if metrics["aucRoc"] is None else metrics["aucRoc"] - reported["aucRoc"]},
            "confusionMatrixIdentical": metrics["confusionMatrix"] == reported["confusionMatrix"],
        },
        durationSeconds=round(time.perf_counter() - started, 1),
    )
    return result


def _png(rgb: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    if not ok:
        raise RuntimeError("PNG encoding failed.")
    return encoded.tobytes()


def _label_map(result: dict) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(base64.b64decode(result["labelMapPng"]), np.uint8), cv2.IMREAD_UNCHANGED)


def _patch_rgb(images: np.ndarray, index: int) -> tuple[np.ndarray, bool]:
    """The patch as the uint8 RGB image the service receives, and whether that was exact."""
    patch = np.asarray(images[index], dtype=np.float64)
    exact = bool(np.array_equal(patch, np.rint(patch)) and patch.min() >= 0 and patch.max() <= 255)
    return np.clip(np.rint(patch), 0, 255).astype(np.uint8), exact


def evaluate_pannuke(arrays: dict[str, np.ndarray], fold: Path, registry: ModelRegistry, max_pixels: int, max_side: int) -> dict:
    started = time.perf_counter()
    images, masks, types = arrays["images"], arrays["masks"], arrays["types"]
    total = images.shape[0]
    classes = len(NUCLEI_CLASSES)
    confusion = np.zeros((classes, classes), dtype=np.int64)
    by_tissue: dict[str, np.ndarray] = {}
    tissue_images: dict[str, int] = {}
    inexact = 0
    # Tiled path: 2 x 2 mosaics of consecutive patches.
    agreement = np.zeros((classes, classes), dtype=np.int64)
    tiled_vs_truth = np.zeros((classes, classes), dtype=np.int64)
    patch_vs_truth = np.zeros((classes, classes), dtype=np.int64)
    tile_counts = set()
    mosaics = 0

    group: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    for index in range(total):
        rgb, exact = _patch_rgb(images, index)
        inexact += int(not exact)
        truth = pannuke_reference(masks[index])
        predicted = _label_map(analyze_nuclei(_png(rgb), registry, max_pixels, max_side))

        counts = confusion_counts(truth, predicted)
        confusion += counts
        tissue = str(types[index])
        by_tissue[tissue] = by_tissue.get(tissue, np.zeros_like(confusion)) + counts
        tissue_images[tissue] = tissue_images.get(tissue, 0) + 1

        group.append((rgb, truth, predicted))
        if len(group) == 4:
            result = analyze_nuclei(_png(mosaic([item[0] for item in group])), registry, max_pixels, max_side)
            tiled = _label_map(result)
            per_patch = mosaic([item[2] for item in group])
            mosaic_truth = mosaic([item[1] for item in group])
            agreement += confusion_counts(per_patch, tiled)
            tiled_vs_truth += confusion_counts(mosaic_truth, tiled)
            patch_vs_truth += confusion_counts(mosaic_truth, per_patch)
            tile_counts.add(result["tileCount"])
            mosaics += 1
            group = []
        _progress("PanNuke Fold 3", index + 1, total)

    agreement_summary = dice_iou(agreement)
    return {
        "status": "ok",
        "dataset": {
            "name": "PanNuke, Fold 3 (the notebook's test fold)",
            "folder": fold.name,
            "images": total,
            "patchesNotExactlyUint8": inexact,
        },
        "reference": "mask channels 0-4 > 0 -> class c + 1; pixels under several channels -> 255, left out; others background",
        "pooling": "pixel counts pooled over the whole fold (not a mean per image)",
        **segmentation_summary(confusion),
        "byTissue": {
            tissue: {"images": tissue_images[tissue], **segmentation_summary(counts)}
            for tissue, counts in sorted(by_tissue.items())
        },
        "notebookReported": NOTEBOOK_REPORTED["pannuke"],
        "tiling": {
            "method": f"2 x 2 mosaics of consecutive Fold 3 patches ({2 * NUCLEI_TILE} x {2 * NUCLEI_TILE}), "
            "segmented through the service's large-image path, compared with the 4 patches segmented one by one",
            "mosaics": mosaics,
            "patchesUsed": 4 * mosaics,
            "tilesPerMosaic": sorted(tile_counts),
            "agreementWithPerPatch": {
                "pixelShare": float(np.trace(agreement) / agreement.sum()) if agreement.sum() else None,
                "dicePerClass": {name: agreement_summary[name]["dice"] for name in NUCLEI_CLASSES},
            },
            "tiledVsReference": segmentation_summary(tiled_vs_truth),
            "perPatchVsReferenceOnSamePatches": segmentation_summary(patch_vs_truth),
        },
        "durationSeconds": round(time.perf_counter() - started, 1),
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def build_report(registry: ModelRegistry) -> dict:
    return {
        "schemaVersion": 1,
        "pipeline": "pathology",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "method": {
            "inference": "app.pathology_pipeline.analyze_breast and analyze_nuclei, from the image bytes "
            "(PNG for the PanNuke patches and mosaics): the service's code, CPU",
            "breakhis": f"test-time augmentation {', '.join(TTA_VIEWS)}; mean of the sigmoid outputs; "
            "decision score >= threshold of breakhis_inference_config.json",
            "pannuke": f"one pass at {NUCLEI_TILE} x {NUCLEI_TILE}; larger images in tiles overlapping by {NUCLEI_OVERLAP} px, "
            f"mirrored borders, centre kept ({NUCLEI_MARGIN} px margins dropped)",
            "bootstrap": {"draws": BOOTSTRAP_DRAWS, "seed": BOOTSTRAP_SEED, "unit": "patient", "interval": "percentile 2.5-97.5"},
        },
        "weights": {
            entry["modelId"]: {
                "file": entry["file"], "sha256": entry["weightsSha256"], "loaded": entry["loaded"],
                **({"config": entry["config"]} if "config" in entry else {}),
            }
            for entry in registry.status()
        },
        "versions": {
            "python": platform.python_version(),
            "tensorflow": tf.__version__,
            "keras": keras.__version__,
            "opencv": cv2.__version__,
            "numpy": np.__version__,
            "scikitLearn": sklearn.__version__,
            "pandas": pd.__version__,
        },
        "breakhis": None,
        "pannuke": None,
    }


def report_path(output_dir: Path, registry: ModelRegistry, now: datetime.datetime | None = None) -> Path:
    """evaluation/pathology-<date>-<HHMMSS>-<classifier sha256[:8]>-<segmenter sha256[:8]>.json"""
    moment = now or datetime.datetime.now()
    shas = "-".join((registry.get(model_id).weights_sha256 or "absent")[:8] for model_id in (BREAST_CLASSIFIER_ID, NUCLEI_SEGMENTER_ID))
    return output_dir / f"pathology-{moment:%Y-%m-%d}-{moment:%H%M%S}-{shas}.json"


def is_complete(report: dict) -> bool:
    """Both parts evaluated: BreakHis and PanNuke (with its tiling check)."""
    breakhis = report.get("breakhis") or {}
    pannuke = report.get("pannuke") or {}
    return breakhis.get("status") == "ok" and pannuke.get("status") == "ok" and bool((pannuke.get("tiling") or {}).get("mosaics"))


def write_report(report: dict, output_dir: Path, registry: ModelRegistry, now: datetime.datetime | None = None) -> tuple[Path, bool]:
    """Writes a new report, never over an existing one; True when it was also copied to pathology-latest.json.

    pathology-latest.json is a copy of the last COMPLETE report: a partial run
    (one dataset only, or a stopped part) leaves it as it was.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    first = report_path(output_dir, registry, now)
    path, attempt = first, 1
    while True:
        report["file"] = path.name
        try:
            with path.open("x", encoding="utf-8", newline="\n") as handle:  # "x": fails if it exists
                handle.write(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default) + "\n")
            break
        except FileExistsError:
            attempt += 1
            path = first.with_name(f"{first.stem}-{attempt}{first.suffix}")

    complete = is_complete(report)
    if complete:
        shutil.copyfile(path, output_dir / LATEST_REPORT_NAME)
    return path, complete


def _ci(stats: dict | None) -> str:
    ci = (stats or {}).get("ci95")
    return "" if ci is None else f" [IC 95 % {ci[0] * 100:.2f} – {ci[1] * 100:.2f}]"


def _number(value: float | None, digits: int = 4) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def print_summary(report: dict, path: Path) -> None:
    print("\n=== Évaluation hors ligne — pathologie (code du service) ===")
    for model_id, weights in report["weights"].items():
        print(f"  {model_id} : {(weights['sha256'] or 'absent')[:12]} {'chargé' if weights['loaded'] else 'NON CHARGÉ'}")

    breakhis = report["breakhis"]
    if breakhis:
        print("\n--- BreakHis (13 patients de test du notebook) ---")
        if breakhis["status"] == "stopped":
            print(f"  ARRÊTÉE : {breakhis['reason']}")
            print("  Aucune métrique n'est calculée.")
        elif breakhis["status"] != "ok":
            print("  Aucune image lisible.")
        else:
            images = breakhis["dataset"]["testImages"]
            print(f"  Images : {images['total']} ({images['benign']} bénignes, {images['malignant']} malignes), seuil {breakhis['threshold']}")
            if breakhis["dataset"]["unreadable"]:
                print(f"  Illisibles (exclues) : {len(breakhis['dataset']['unreadable'])}")
            boot = breakhis["bootstrap"]
            for key, name in (("accuracy", "Exactitude"), ("sensitivity", "Sensibilité"), ("specificity", "Spécificité"),
                              ("precision", "Précision"), ("f1", "F1")):
                print(f"  {name:<12} {_percent(breakhis[key]):>9}{_ci(boot[key])}")
            print(f"  AUC ROC      {_number(breakhis['aucRoc'])}{_ci(boot['aucRoc'])}  (notebook : {breakhis['notebookReported']['aucRoc']})")
            print(f"  AUC PR       {_number(breakhis['aucPr'])}{_ci(boot['aucPr'])}")
            print(f"  Exactitude du notebook : {_percent(breakhis['notebookReported']['accuracy'])}"
                  f" (écart {breakhis['comparison']['accuracy']['difference'] * 100:+.2f} points)")
            (tn, fp), (fn, tp) = breakhis["confusionMatrix"]
            print(f"  Matrice (lignes : vraie classe ; colonnes : décision) : bénin [{tn}, {fp}], malin [{fn}, {tp}]"
                  f" — notebook {breakhis['notebookReported']['confusionMatrix']}"
                  f"{' (identique)' if breakhis['comparison']['confusionMatrixIdentical'] else ''}")
            print("  Grossissement   n     Exactitude  Sensibilité  Spécificité  AUC")
            for magnification, metrics in breakhis["byMagnification"].items():
                print(f"  {magnification + 'x':<14} {metrics['n']:>4}  {_percent(metrics['accuracy']):>10}  {_percent(metrics['sensitivity']):>11}"
                      f"  {_percent(metrics['specificity']):>11}  {_number(metrics['aucRoc'])}")
            level = breakhis["patientLevel"]
            print(f"  Par patient (décision majoritaire) : {level['majorityCorrect']}/{level['patients']} patients bien classés")
            for row in breakhis["byPatient"]:
                print(f"    {row['patient']:<11} {row['label']:<9} {row['images']:>4} images, score moyen {row['meanScore']:.3f},"
                      f" majorité {row['majorityDecision']}")

    pannuke = report["pannuke"]
    if pannuke:
        print("\n--- PanNuke (Fold 3) ---")
        if pannuke["status"] != "ok":
            print(f"  ARRÊTÉE : {pannuke['reason']}")
            print("  Aucun Dice n'est calculé.")
        else:
            reported = pannuke["notebookReported"]
            print(f"  Images : {pannuke['dataset']['images']} ; Dice et IoU sur les pixels de tout le fold (255 exclus)")
            print("  Classe         Dice     IoU      (notebook, Fold 2)")
            for name in NUCLEI_CLASSES:
                metrics = pannuke["perClass"][name]
                print(f"  {name:<13} {_number(metrics['dice'])}  {_number(metrics['iou'])}  ({reported['dice'][name]:.4f})")
            print(f"  Dice moyen des 5 types de noyaux : {_number(pannuke['nucleiMeanDice'])} (notebook, Fold 2 : {reported['nucleiMeanDice']})")
            print("  Attention : les chiffres du notebook portent sur le Fold 2 (validation), pas sur le Fold 3.")
            print("  Par tissu (Dice moyen des noyaux) :")
            for tissue, metrics in pannuke["byTissue"].items():
                print(f"    {tissue:<16} {metrics['images']:>4} images  {_number(metrics['nucleiMeanDice'])}")
            tiling = pannuke["tiling"]
            agreement = tiling["agreementWithPerPatch"]
            print(f"  Découpage en tuiles : {tiling['mosaics']} mosaïques 512 x 512 ({tiling['tilesPerMosaic']} tuiles chacune)")
            print(f"    Accord avec le patch par patch : {_percent(agreement['pixelShare'])} des pixels ; Dice par classe "
                  + ", ".join(f"{name} {_number(value, 3)}" for name, value in agreement["dicePerClass"].items()))
            print(f"    Dice moyen des noyaux, mêmes patchs : en tuiles {_number(tiling['tiledVsReference']['nucleiMeanDice'])},"
                  f" patch par patch {_number(tiling['perPatchVsReferenceOnSamePatches']['nucleiMeanDice'])}")

    print(f"\nRapport : {path}")


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Évaluation hors ligne des modèles de pathologie, par le code du service.")
    parser.add_argument("--breakhis-root", type=normalize_path, help=f"dossier contenant {BREAKHIS_FOLDER} (ou {BREAKHIS_FOLDER} lui-même)")
    parser.add_argument("--pannuke-root", type=normalize_path, help="dossier contenant fold_1, fold_2 et fold_3 de PanNuke")
    parser.add_argument("--models-dir", type=normalize_path, help="dossier des poids (par défaut AI_MODELS_DIR, comme le service)")
    parser.add_argument("--output-dir", type=normalize_path, default=DEFAULT_OUTPUT_DIR, help="dossier du rapport JSON")
    parser.add_argument("--check", action="store_true", help="vérifie chemins, poids, découpage et effectifs, sans aucune inférence")
    args = parser.parse_args(argv)
    if args.breakhis_root is None and args.pannuke_root is None:
        parser.error("indiquez --breakhis-root et/ou --pannuke-root")
    return args


def prepare(args: argparse.Namespace) -> dict:
    """Every check that needs no model.

    `problems` stop everything (exit 1); a `stop` reason stops one part only,
    as a split or a fold that does not match the notebook does.
    """
    setup = {"problems": [], "breakhis": None, "breakhisIndexed": None, "breakhisIgnored": 0, "breakhisTest": None,
             "breakhisStop": None, "pannukeFiles": None, "pannuke": None, "pannukeStop": None}

    if args.models_dir is not None and not args.models_dir.is_dir():
        setup["problems"].append(str(_missing_folder(args.models_dir)))

    if args.breakhis_root is not None:
        try:
            setup["breakhis"] = resolve_breakhis(args.breakhis_root)
        except SetupError as error:
            setup["problems"].append(str(error))
        else:
            index, ignored, disagreeing = build_breakhis_index(list_breakhis_images(setup["breakhis"]))
            setup["breakhisIndexed"], setup["breakhisIgnored"] = len(index), len(ignored)
            try:
                if disagreeing:
                    examples = "".join(f"\n  {path}" for path in disagreeing[:3])
                    raise BreakhisSplitError(
                        f"{len(disagreeing)} image(s) dont le dossier (benign/malignant) ne correspond pas au nom (SOB_B/SOB_M) :{examples}"
                    )
                # Split first: a wrong one stops BreakHis before any inference.
                setup["breakhisTest"] = plan_breakhis(index)
            except BreakhisSplitError as error:
                setup["breakhisStop"] = str(error)
            if not args.check and setup["breakhisTest"] is not None:
                print(f"BreakHis ({setup['breakhis']}) : {len(index)} images indexées, {len(setup['breakhisTest'])} images de test")

    if args.pannuke_root is not None:
        try:
            setup["pannukeFiles"] = locate_pannuke(args.pannuke_root)
        except SetupError as error:
            setup["problems"].append(str(error))
        else:
            try:
                setup["pannuke"] = open_pannuke(setup["pannukeFiles"])
            except PannukeDataError as error:
                setup["pannukeStop"] = str(error)
            if not args.check and setup["pannuke"] is not None:
                print(f"PanNuke ({args.pannuke_root / PANNUKE_TEST_FOLD}) : {setup['pannuke']['images'].shape[0]} images")
    return setup


def load_models(models_dir: Path) -> ModelRegistry:
    settings = load_settings()
    configure_tensorflow_threads(settings.tf_intra_op_threads, settings.tf_inter_op_threads)
    return ModelRegistry(models=load_pathology_models(models_dir))


def print_check(args: argparse.Namespace, setup: dict, registry: ModelRegistry, models_dir: Path) -> int:
    """Summary of --check; 0 when the evaluation can run as asked, 1 otherwise."""
    problems = list(setup["problems"])
    print("\n=== Vérification (aucune inférence) ===")
    print(f"Poids ({models_dir}) :")
    for entry in registry.models.values():
        state = "chargé" if entry.loaded else f"NON CHARGÉ ({entry.error})"
        print(f"  {entry.spec.model_id} — {entry.spec.file_name} — {(entry.weights_sha256 or 'absent')[:12]} — {state}")
    needed = ([BREAST_CLASSIFIER_ID] if args.breakhis_root else []) + ([NUCLEI_SEGMENTER_ID] if args.pannuke_root else [])
    for model_id in needed:
        entry = registry.get(model_id)
        if not entry.loaded:
            problems.append(f"{entry.spec.file_name} non chargé ({entry.error}) dans {models_dir}.")

    if args.breakhis_root is not None:
        print(f"BreakHis : {setup['breakhis'] or args.breakhis_root}")
        if setup["breakhisIndexed"] is not None:
            print(f"  {setup['breakhisIndexed']} images indexées (notebook : {BREAKHIS_NOTEBOOK_INDEXED}), {setup['breakhisIgnored']} ignorées")
        if setup["breakhisTest"] is not None:
            test = setup["breakhisTest"]
            print(f"  Test : {test['patient'].nunique()} patients, {len(test)} images "
                  f"({int((test['label'] == 'benign').sum())} bénignes, {int((test['label'] == 'malignant').sum())} malignes) — conforme au notebook")
        if setup["breakhisStop"]:
            problems.append(f"BreakHis : {setup['breakhisStop']}")

    if args.pannuke_root is not None:
        print(f"PanNuke : {args.pannuke_root}")
        for name, path in (setup["pannukeFiles"] or {}).items():
            print(f"  {name} : {path}")
        if setup["pannuke"] is not None:
            print(f"  Fold 3 : {setup['pannuke']['images'].shape[0]} images — conforme au notebook")
        if setup["pannukeStop"]:
            problems.append(f"PanNuke : {setup['pannukeStop']}")

    if problems:
        print("\nÀ corriger :")
        for problem in problems:
            print(f"  - {_indented(problem)}")
        print("\nPrêt : non")
        return 1
    print("\nPrêt : oui — relancez la même commande sans --check.")
    return 0


def main(argv=None) -> int:
    # UTF-8 even when redirected to a file (Windows would use its ANSI code page).
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    settings = load_settings()
    models_dir = args.models_dir or settings.models_dir

    setup = prepare(args)
    if args.check:
        # Loading the models reads their hash and checks them; no inference.
        return print_check(args, setup, load_models(models_dir), models_dir)

    if setup["problems"]:
        for problem in setup["problems"]:
            print(f"\nERREUR : {_indented(problem, '  ')}", file=sys.stderr)
        return 1
    for name, reason in (("BREAKHIS", setup["breakhisStop"]), ("PANNUKE", setup["pannukeStop"])):
        if reason:
            print(f"\n{name} ARRÊTÉ : {_indented(reason, '  ')}\n", file=sys.stderr)

    registry = load_models(models_dir)
    needed = ([BREAST_CLASSIFIER_ID] if args.breakhis_root else []) + ([NUCLEI_SEGMENTER_ID] if args.pannuke_root else [])
    missing = [registry.get(model_id) for model_id in needed if not registry.get(model_id).loaded]
    if missing:
        for entry in missing:
            print(f"Modèle non chargé ({entry.error}) : {entry.spec.file_name} dans {models_dir}. "
                  "Indiquez le dossier des poids avec --models-dir.", file=sys.stderr)
        return 1

    report = build_report(registry)
    if args.breakhis_root is not None:
        report["breakhis"] = (
            {"status": "stopped", "reason": setup["breakhisStop"]}
            if setup["breakhisStop"]
            else evaluate_breakhis(setup["breakhisTest"], setup["breakhis"], registry, settings.max_image_pixels)
        )
    if args.pannuke_root is not None:
        report["pannuke"] = (
            {"status": "stopped", "reason": setup["pannukeStop"]}
            if setup["pannukeStop"]
            else evaluate_pannuke(setup["pannuke"], args.pannuke_root / PANNUKE_TEST_FOLD, registry,
                                  settings.max_image_pixels, settings.nuclei_max_side)
        )

    path, latest_updated = write_report(report, args.output_dir, registry)
    print_summary(report, path)
    if latest_updated:
        print(f"Rapport complet : copié dans {args.output_dir / LATEST_REPORT_NAME}")
    else:
        print(f"Rapport partiel (BreakHis et PanNuke non tous deux évalués) : {LATEST_REPORT_NAME} n'est pas modifié.")
    return 2 if setup["breakhisStop"] or setup["pannukeStop"] else 0


if __name__ == "__main__":
    sys.exit(main())
