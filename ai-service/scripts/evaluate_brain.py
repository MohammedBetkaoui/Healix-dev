"""Offline evaluation of the brain pipeline, as the service runs it.

Measures the service's actual level, not the training notebooks' figures:
the images go through the service's own code (app.preprocess, app.pipeline),
on CPU, in one deterministic pass, without test-time augmentation.

    .venv/Scripts/python -m scripts.evaluate_brain \\
        --nickparvar-test <Nickparvar>/Testing [--brisc-root <folder holding manifest.csv>]

Classification: the Testing folder of the Nickparvar Brain Tumor MRI dataset
(never used for training: the notebook trains on Training + BraTS).
Segmentation (optional): BRISC 2025, on the exact test split of
segmentation-reelle.ipynb. The official BRISC test folder is never used as
is: the notebook mixed it into training.

Writes evaluation/brain-<date>-<classifier sha256[:8]>.json and prints a
summary. No image and no patient data is written.
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import platform
import sys
import time
from pathlib import Path, PurePosixPath

if __package__ in (None, ""):
    # Run as a file (python scripts/evaluate_brain.py): make `app` importable.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2
import numpy as np
import pandas as pd
import segmentation_models_pytorch as smp
import sklearn
import timm
import torch
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support, roc_auc_score
from sklearn.model_selection import train_test_split

from app.config import load_settings
from app.models import CLASS_LABELS, CLASSIFIER_ID, LoadedModel, ModelRegistry, load_registry
from app.pipeline import MASK_THRESHOLD, SEGMENTER_BY_CLASS, _segment, analyze_brain
from app.preprocess import InvalidImage, decode_image, to_input_tensor

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "evaluation"

BOOTSTRAP_DRAWS = 1000
BOOTSTRAP_SEED = 42
CALIBRATION_BINS = 10
# 0.50, 0.55, ... 0.95
CONFIDENCE_THRESHOLDS = tuple(round(0.50 + 0.05 * step, 2) for step in range(10))

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
# Folder name -> class, as build_classification_df of the training notebook.
NICKPARVAR_FOLDERS = {
    "glioma": "glioma",
    "meningioma": "meningioma",
    "notumor": "notumor",
    "pituitary": "pituitary",
    "no_tumor": "notumor",
    "normal": "notumor",
}
# Testing split of the dataset version the classifier was trained against
# (7,200 images: Training 1,400 and Testing 400 per class). Another version
# may hold, in its Testing folder, images of that version's Training.
TRAINING_VERSION_TESTING_PER_CLASS = 400

# The BRISC split of segmentation-reelle.ipynb: image/mask pairs found, then
# test images. Another count means another split, mixing training images.
BRISC_EXPECTED = {
    "meningioma": {"pairs": 1635, "test": 123},
    "pituitary": {"pairs": 1757, "test": 132},
}
BRISC_MANIFEST_COLUMNS = ("tumor_label", "task", "is_mask", "relative_path")
# Notebook evaluation: Dice averaged per batch of 16, at 256 x 256, smoothed.
NOTEBOOK_BATCH_SIZE = 16
NOTEBOOK_SMOOTH = 1e-6
# Masks binarized as in BriscDataset (mask > 127).
MASK_BINARY_THRESHOLD = 127

# Reported by the notebooks, for comparison only.
NOTEBOOK_REPORTED = {
    "classification": {
        "accuracy": 0.9544,
        "note": "TTA x4 (identity, horizontal flip, vertical flip, rotation) and mixed precision on GPU",
    },
    "meningioma": {"dice": 0.9277, "iou": 0.8753, "sensitivity": 0.9576},
    "pituitary": {"dice": 0.8717, "iou": 0.7859, "sensitivity": 0.9156},
}

logger = logging.getLogger("evaluate_brain")


# ---------------------------------------------------------------------------
# Statistics (pure)
# ---------------------------------------------------------------------------


def bootstrap_indices(n: int, draws: int = BOOTSTRAP_DRAWS, seed: int = BOOTSTRAP_SEED) -> np.ndarray:
    """(draws, n) resampling indices, with replacement; reproducible for a seed."""
    return np.random.default_rng(seed).integers(0, n, size=(draws, n))


def percentile_ci(samples: np.ndarray) -> list[float] | None:
    """95 % percentile interval of bootstrap statistics (NaN draws ignored)."""
    finite = np.asarray(samples, dtype=float)
    finite = finite[np.isfinite(finite)]
    if finite.size == 0:
        return None
    return [float(np.percentile(finite, 2.5)), float(np.percentile(finite, 97.5))]


def summarize(values, seed: int = BOOTSTRAP_SEED) -> dict:
    """Mean, median and bootstrap 95 % interval of the mean; NaN values (undefined) are left out."""
    defined = np.asarray(values, dtype=float)
    defined = defined[~np.isnan(defined)]
    if defined.size == 0:
        return {"n": 0, "mean": None, "median": None, "ci95": None}
    means = defined[bootstrap_indices(defined.size, seed=seed)].mean(axis=1)
    return {
        "n": int(defined.size),
        "mean": float(defined.mean()),
        "median": float(np.median(defined)),
        "ci95": percentile_ci(means),
    }


def reliability_table(confidence: np.ndarray, correct: np.ndarray, bins: int = CALIBRATION_BINS) -> tuple[float, list[dict]]:
    """Expected calibration error and its table, on equal-width bins (lower, upper]."""
    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    edges = np.linspace(0.0, 1.0, bins + 1)
    # right=True: edges[i - 1] < x <= edges[i]; the first bin also holds 0.
    bin_ids = np.digitize(confidence, edges[1:-1], right=True)
    total = confidence.size
    ece = 0.0
    rows = []
    for index in range(bins):
        in_bin = bin_ids == index
        count = int(in_bin.sum())
        row = {
            "lower": round(float(edges[index]), 2),
            "upper": round(float(edges[index + 1]), 2),
            "count": count,
            "meanConfidence": None,
            "accuracy": None,
        }
        if count:
            mean_confidence = float(confidence[in_bin].mean())
            accuracy = float(correct[in_bin].mean())
            ece += count / total * abs(accuracy - mean_confidence)
            row.update(meanConfidence=mean_confidence, accuracy=accuracy)
        rows.append(row)
    return float(ece), rows


def accuracy_by_confidence(confidence: np.ndarray, correct: np.ndarray, thresholds=CONFIDENCE_THRESHOLDS) -> list[dict]:
    """For each threshold: share of the images at or above it, and accuracy on that share."""
    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    rows = []
    for threshold in thresholds:
        kept = confidence >= threshold
        count = int(kept.sum())
        rows.append({
            "threshold": threshold,
            "count": count,
            "coverage": count / confidence.size,
            "accuracy": float(correct[kept].mean()) if count else None,
        })
    return rows


def classification_metrics(y_true: np.ndarray, probabilities: np.ndarray, seed: int = BOOTSTRAP_SEED) -> dict:
    """Metrics of a 4-class classifier; y_true holds indices into CLASS_LABELS."""
    y_true = np.asarray(y_true)
    probabilities = np.asarray(probabilities, dtype=float)
    classes = range(len(CLASS_LABELS))
    predicted = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    correct = predicted == y_true

    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, predicted, labels=list(classes), zero_division=0
    )

    # Same resamples for every bootstrapped figure.
    draws = bootstrap_indices(y_true.size, seed=seed)
    resampled_true = y_true[draws]
    resampled_correct = correct[draws]

    per_class = {}
    aucs = []
    for index, label in enumerate(CLASS_LABELS):
        is_class = y_true == index
        auc = float(roc_auc_score(is_class, probabilities[:, index])) if 0 < is_class.sum() < y_true.size else None
        aucs.append(auc)
        in_class = resampled_true == index
        counts = in_class.sum(axis=1)
        hits = (resampled_correct & in_class).sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            recalls = np.where(counts > 0, hits / counts, np.nan)
        per_class[label] = {
            "support": int(support[index]),
            "precision": float(precision[index]),
            "recall": float(recall[index]),
            "recallCi95": percentile_ci(recalls),
            "f1": float(f1[index]),
            "auc": auc,
        }

    ece, bins = reliability_table(confidence, correct)
    return {
        "n": int(y_true.size),
        "accuracy": {"value": float(correct.mean()), "ci95": percentile_ci(resampled_correct.mean(axis=1))},
        "confusionMatrix": {
            "labels": list(CLASS_LABELS),
            "rows": "true class",
            "columns": "predicted class",
            "matrix": confusion_matrix(y_true, predicted, labels=list(classes)).tolist(),
        },
        "perClass": per_class,
        "macro": {
            "precision": float(np.mean(precision)),
            "recall": float(np.mean(recall)),
            "f1": float(np.mean(f1)),
            # One-vs-rest, unweighted mean of the per-class AUCs.
            "auc": float(np.mean(aucs)) if all(auc is not None for auc in aucs) else None,
        },
        "calibration": {"ece": ece, "bins": bins},
        "accuracyByConfidence": accuracy_by_confidence(confidence, correct),
    }


def mask_metrics(predicted: np.ndarray, truth: np.ndarray) -> dict:
    """Dice, IoU and sensitivity of one binary mask; sensitivity is None without a true pixel."""
    predicted = np.asarray(predicted, dtype=bool)
    truth = np.asarray(truth, dtype=bool)
    intersection = int(np.logical_and(predicted, truth).sum())
    predicted_area = int(predicted.sum())
    true_area = int(truth.sum())
    union = predicted_area + true_area - intersection
    return {
        # Both empty: a perfect match.
        "dice": 1.0 if predicted_area + true_area == 0 else 2 * intersection / (predicted_area + true_area),
        "iou": 1.0 if union == 0 else intersection / union,
        "sensitivity": None if true_area == 0 else intersection / true_area,
    }


def notebook_batch_means(
    intersections, predicted_areas, true_areas, batch_size: int = NOTEBOOK_BATCH_SIZE, smooth: float = NOTEBOOK_SMOOTH
) -> dict:
    """Dice, IoU and sensitivity as evaluate_on_testset of segmentation-reelle.ipynb computes them.

    Per image, smoothed; averaged within each batch of `batch_size` images (in
    test order); the batch means are then averaged, so a short last batch
    weighs as much as a full one. Sensitivity is pooled over each batch.
    """
    intersections = np.asarray(intersections, dtype=float)
    predicted_areas = np.asarray(predicted_areas, dtype=float)
    true_areas = np.asarray(true_areas, dtype=float)
    dice = (2 * intersections + smooth) / (predicted_areas + true_areas + smooth)
    iou = (intersections + smooth) / (predicted_areas + true_areas - intersections + smooth)

    batches = [slice(start, start + batch_size) for start in range(0, intersections.size, batch_size)]
    return {
        "dice": float(np.mean([dice[batch].mean() for batch in batches])),
        "iou": float(np.mean([iou[batch].mean() for batch in batches])),
        "sensitivity": float(np.mean([intersections[batch].sum() / (true_areas[batch].sum() + 1e-8) for batch in batches])),
    }


# ---------------------------------------------------------------------------
# Datasets
# ---------------------------------------------------------------------------


def list_nickparvar_testing(folder: Path) -> tuple[list[tuple[Path, int]], list[str]]:
    """(image, class index) pairs, sorted; and the subfolders that name no class."""
    samples = []
    ignored = []
    for class_dir in sorted(path for path in folder.iterdir() if path.is_dir()):
        label = NICKPARVAR_FOLDERS.get(class_dir.name.lower())
        if label is None:
            ignored.append(class_dir.name)
            continue
        index = CLASS_LABELS.index(label)
        samples.extend(
            (path, index)
            for path in sorted(class_dir.iterdir())
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        )
    return samples, ignored


def nickparvar_counts(samples: list[tuple[Path, int]]) -> dict[str, int]:
    """Images per class, in CLASS_LABELS order (0 for a class without folder)."""
    return {label: sum(1 for _, index in samples if index == position) for position, label in enumerate(CLASS_LABELS)}


def read_grayscale(path: Path) -> np.ndarray | None:
    """cv2.imread(path, 0), but through the bytes: works with any path on Windows."""
    data = np.fromfile(str(path), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_GRAYSCALE) if data.size else None


class BriscSplitError(Exception):
    """The notebook's BRISC split cannot be reproduced: no segmentation metric."""


def load_brisc_pairs(root: Path, tumor_label: str) -> list[tuple[Path, Path]]:
    """Image/mask pairs of one class, built as load_brisc_pairs_v2 in segmentation-reelle.ipynb.

    manifest.csv rows with this tumor_label and task "segmentation", split into
    images and masks by is_mask; Windows paths (\\) turned into /; a mask is
    found by the image's file name without extension; images whose file or
    mask is missing, or whose mask is empty, are left out; manifest order kept.
    """
    manifest = pd.read_csv(root / "manifest.csv")
    missing = [column for column in BRISC_MANIFEST_COLUMNS if column not in manifest.columns]
    if missing:
        raise BriscSplitError(f"manifest.csv sans les colonnes {', '.join(missing)}.")

    rows = manifest[(manifest["tumor_label"] == tumor_label) & (manifest["task"] == "segmentation")]
    is_mask = rows["is_mask"].astype(bool)

    masks_by_stem = {}
    for relative in rows[is_mask]["relative_path"]:
        relative = str(relative).replace("\\", "/")
        masks_by_stem[PurePosixPath(relative).stem] = root / relative

    pairs = []
    for relative in rows[~is_mask]["relative_path"]:
        image_path = root / str(relative).replace("\\", "/")
        if not image_path.exists():
            continue
        mask_path = masks_by_stem.get(image_path.stem)
        if mask_path is None or not mask_path.exists():
            continue
        mask = read_grayscale(mask_path)
        if mask is not None and mask.max() > 0:
            pairs.append((image_path, mask_path))
    return pairs


def notebook_test_split(pairs: list) -> list:
    """The notebook's test set: 15 % held out, then the second half of it."""
    _, held_out = train_test_split(pairs, test_size=0.15, random_state=42)
    _, test = train_test_split(held_out, test_size=0.5, random_state=42)
    return test


def plan_brisc(root: Path) -> dict[str, dict]:
    """Pairs and test set per class; BriscSplitError unless both match the notebook."""
    plan = {}
    mismatches = []
    for label, expected in BRISC_EXPECTED.items():
        pairs = load_brisc_pairs(root, label)
        try:
            test = notebook_test_split(pairs)
        except ValueError:  # too few pairs to split at all
            test = []
        plan[label] = {"pairs": pairs, "test": test}
        if len(pairs) != expected["pairs"] or len(test) != expected["test"]:
            mismatches.append(
                f"{label} : {len(pairs)} paires, {len(test)} images de test "
                f"(attendu {expected['pairs']} et {expected['test']})"
            )
    if mismatches:
        raise BriscSplitError(
            "Découpage du notebook non reproduit — " + " ; ".join(mismatches) + ". "
            "Un autre découpage mélangerait des images d'entraînement au test."
        )
    return plan


# ---------------------------------------------------------------------------
# Setup: paths and datasets as the user gives them (Windows, PowerShell)
# ---------------------------------------------------------------------------

MISSING_FOLDER_HINT = "Copiez le chemin depuis la barre d'adresse de l'Explorateur."
MANIFEST_SEARCH_DEPTH = 2
MISSING_FILE_EXAMPLES = 3


class SetupError(Exception):
    """A path or dataset the user must fix; the message says how. Nothing is evaluated."""


def normalize_path(raw: str | Path) -> Path:
    """A path as typed in PowerShell or pasted from the Explorer, made absolute.

    Surrounding quotes and trailing separators are removed (PowerShell turns
    "C:\\data\\" into C:\\data" for the program), ~ is expanded, then the path
    is resolved.
    """
    text = str(raw).strip().strip("\"'").strip()
    stripped = text.rstrip("\\/")
    # Keep the separator of a root: "C:\\" (not "C:", the drive's current folder) or "/".
    if stripped and not (len(stripped) == 2 and stripped[1] == ":"):
        text = stripped
    return Path(text).expanduser().resolve()


def _missing_folder(path: Path) -> SetupError:
    return SetupError(f"Dossier introuvable : {path}. {MISSING_FOLDER_HINT}")


def resolve_nickparvar(folder: Path) -> tuple[Path, str | None]:
    """The folder holding the class subfolders, and a note when Testing was picked inside it."""
    if not folder.is_dir():
        raise _missing_folder(folder)

    note = None
    testing = sorted(child for child in folder.iterdir() if child.is_dir() and child.name.lower() == "testing")
    if testing:
        folder = testing[0]
        note = f"Utilisation de {folder}"

    subfolders = sorted(child.name for child in folder.iterdir() if child.is_dir())
    if not any(name.lower() in NICKPARVAR_FOLDERS for name in subfolders):
        found = ", ".join(subfolders) if subfolders else "aucun sous-dossier"
        raise SetupError(
            f"Aucun dossier de classe dans {folder}. Trouvé : {found}. "
            "Attendu : glioma, meningioma, notumor, pituitary (notumor peut s'appeler no_tumor ou normal). "
            "Indiquez le dossier Testing du jeu Nickparvar."
        )
    return folder, note


def prepare_nickparvar(raw: Path) -> tuple[Path, dict[str, int], str | None]:
    """Testing folder, images per class and the Testing note; SetupError if a class has no image."""
    folder, note = resolve_nickparvar(raw)
    counts = nickparvar_counts(list_nickparvar_testing(folder)[0])
    empty = [label for label, count in counts.items() if count == 0]
    if empty:
        raise SetupError(
            f"Aucune image pour {', '.join(empty)} dans {folder} "
            f"(images par classe : {format_counts(counts)}). Chaque classe doit avoir ses images (.jpg, .jpeg ou .png)."
        )
    return folder, counts, note


def locate_brisc(root: Path) -> tuple[Path, str | None]:
    """The folder holding manifest.csv: the given one, or a single one up to 2 levels below."""
    if not root.is_dir():
        raise _missing_folder(root)
    if (root / "manifest.csv").is_file():
        return root, None

    found = sorted({
        manifest.parent
        for depth in range(1, MANIFEST_SEARCH_DEPTH + 1)
        for manifest in root.glob("/".join(["*"] * depth) + "/manifest.csv")
        if manifest.is_file()
    })
    if not found:
        raise SetupError(
            f"manifest.csv introuvable dans {root} ni dans ses sous-dossiers ({MANIFEST_SEARCH_DEPTH} niveaux). "
            "Indiquez le dossier BRISC 2025 qui contient manifest.csv."
        )
    if len(found) > 1:
        places = "".join(f"\n  {folder / 'manifest.csv'}" for folder in found)
        raise SetupError(f"manifest.csv trouvé à plusieurs endroits :{places}\nIndiquez lequel utiliser avec --brisc-root.")
    return found[0], f"Utilisation de {found[0] / 'manifest.csv'}"


def missing_brisc_files(root: Path) -> list[Path]:
    """Meningioma and pituitary segmentation rows of the manifest whose image or mask is not on disk."""
    manifest = pd.read_csv(root / "manifest.csv")
    absent = [column for column in BRISC_MANIFEST_COLUMNS if column not in manifest.columns]
    if absent:
        raise BriscSplitError(f"manifest.csv sans les colonnes {', '.join(absent)}.")

    rows = manifest[manifest["tumor_label"].isin(list(BRISC_EXPECTED)) & (manifest["task"] == "segmentation")]
    expected = (root / str(relative).replace("\\", "/") for relative in rows["relative_path"])
    return [path for path in expected if not path.exists()]


def check_brisc_files(root: Path) -> None:
    """BriscSplitError, before any pair is built, if the manifest names files that are not on disk."""
    missing = missing_brisc_files(root)
    if missing:
        examples = "".join(f"\n  {path}" for path in missing[:MISSING_FILE_EXAMPLES])
        raise BriscSplitError(
            f"{len(missing)} fichier(s) du manifeste (images ou masques de méningiome et d'hypophyse) "
            f"absent(s) du disque. Exemples de chemins attendus :{examples}\n"
            "Copiez le dossier segmentation_task à côté de manifest.csv."
        )


def format_counts(counts: dict[str, int]) -> str:
    return ", ".join(f"{label} {count}" for label, count in counts.items())


def _indented(message: str, indent: str = "    ") -> str:
    """A multi-line message under a bullet or a heading."""
    return message.replace("\n", "\n" + indent)


# ---------------------------------------------------------------------------
# Inference, through the service's code
# ---------------------------------------------------------------------------


def classifier_only(registry: ModelRegistry) -> ModelRegistry:
    """The same registry with the segmenters unloaded: analyze_brain then only classifies."""
    return ModelRegistry(
        models={
            model_id: entry if model_id == CLASSIFIER_ID else LoadedModel(spec=entry.spec)
            for model_id, entry in registry.models.items()
        }
    )


def classify(data: bytes, registry: ModelRegistry, max_pixels: int) -> np.ndarray:
    """Softmax probabilities in CLASS_LABELS order, from the service's analyze_brain."""
    predictions = analyze_brain(data, registry, max_pixels)["classification"]["predictions"]
    by_label = {prediction["label"]: prediction["probability"] for prediction in predictions}
    return np.array([by_label[label] for label in CLASS_LABELS])


def _progress(task: str, done: int, total: int) -> None:
    if done == total or done % 100 == 0:
        print(f"  {task} : {done}/{total}", file=sys.stderr, flush=True)


def evaluate_classification(folder: Path, registry: ModelRegistry, max_pixels: int) -> dict:
    started = time.perf_counter()
    samples, ignored = list_nickparvar_testing(folder)
    only_classifier = classifier_only(registry)

    labels, probabilities, unreadable = [], [], []
    for done, (path, label) in enumerate(samples, start=1):
        try:
            probabilities.append(classify(path.read_bytes(), only_classifier, max_pixels))
            labels.append(label)
        except InvalidImage as error:
            # The service would answer 422: no prediction to score.
            unreadable.append({"file": f"{path.parent.name}/{path.name}", "reason": error.reason})
        _progress("Classification", done, len(samples))

    per_class = nickparvar_counts(samples)
    matches_training_version = all(count == TRAINING_VERSION_TESTING_PER_CLASS for count in per_class.values())
    result = {
        "dataset": {
            "name": "Nickparvar Brain Tumor MRI Dataset, Testing",
            "folder": folder.name,
            "imagesPerClass": per_class,
            "ignoredFolders": ignored,
            "unreadable": unreadable,
            "expectedPerClass": TRAINING_VERSION_TESTING_PER_CLASS,
            "matchesTrainingVersion": matches_training_version,
        },
    }
    if not labels:
        result["status"] = "no_image"
        return result

    result.update(status="ok", **classification_metrics(np.array(labels), np.vstack(probabilities)))
    result["notebookReported"] = NOTEBOOK_REPORTED["classification"]
    result["durationSeconds"] = round(time.perf_counter() - started, 1)
    return result


def evaluate_segmenter(label: str, test: list, registry: ModelRegistry, max_pixels: int) -> dict:
    segmenter = registry.get(SEGMENTER_BY_CLASS[label])
    if not segmenter.loaded:
        return {"modelId": segmenter.spec.model_id, "status": "model_not_loaded"}

    size = segmenter.spec.input_size
    only_classifier = classifier_only(registry)
    service = {"dice": [], "iou": [], "sensitivity": []}
    end_to_end = []
    notebook = {"intersections": [], "predicted": [], "true": []}
    predicted_classes = dict.fromkeys(CLASS_LABELS, 0)
    shape_mismatches = 0
    empty_truth = 0
    unreadable = []

    for done, (image_path, mask_path) in enumerate(test, start=1):
        data = image_path.read_bytes()
        try:
            image = decode_image(data, max_pixels)
        except InvalidImage as error:
            # The service would answer 422: nothing to score.
            unreadable.append({"file": image_path.name, "reason": error.reason})
            continue
        raw_truth = read_grayscale(mask_path)
        binary_truth = raw_truth > MASK_BINARY_THRESHOLD
        empty_truth += int(not binary_truth.any())

        # The service's segmentation: _segment, at the original image size.
        predicted = _segment(segmenter.module, image, size) > 0
        truth = binary_truth
        if truth.shape != predicted.shape:
            shape_mismatches += 1
            truth = cv2.resize(truth.astype(np.uint8), predicted.shape[::-1], interpolation=cv2.INTER_NEAREST) > 0
        metrics = mask_metrics(predicted, truth)
        for key in service:
            service[key].append(np.nan if metrics[key] is None else metrics[key])

        # What the service returns end to end: the mask only if the classifier
        # routes the image to this segmenter (analyze_brain calls this same
        # _segment), no mask otherwise.
        top = CLASS_LABELS[int(classify(data, only_classifier, max_pixels).argmax())]
        predicted_classes[top] += 1
        end_to_end.append(mask_metrics(predicted if top == label else np.zeros_like(predicted), truth)["dice"])

        # The notebook's measure, at 256 x 256: same input tensor, threshold 0.5.
        with torch.inference_mode():
            logits = segmenter.module(to_input_tensor(image, size))
        predicted_small = (torch.sigmoid(logits)[0, 0] > MASK_THRESHOLD).numpy()
        truth_small = cv2.resize(binary_truth.astype(np.float32), (size, size), interpolation=cv2.INTER_NEAREST) > 0.5
        notebook["intersections"].append(int(np.logical_and(predicted_small, truth_small).sum()))
        notebook["predicted"].append(int(predicted_small.sum()))
        notebook["true"].append(int(truth_small.sum()))
        _progress(f"Segmentation {label}", done, len(test))

    if not service["dice"]:
        return {"modelId": segmenter.spec.model_id, "status": "no_image", "unreadable": unreadable}
    scored = len(service["dice"])
    routed = predicted_classes[label]
    return {
        "modelId": segmenter.spec.model_id,
        "status": "ok",
        "testImages": len(test),
        "scoredImages": scored,
        "service": {
            "resolution": "original image size (the mask the service returns)",
            "dice": summarize(service["dice"]),
            "iou": summarize(service["iou"]),
            "sensitivity": summarize(service["sensitivity"]),
        },
        "notebookStyle": {
            "resolution": f"{size}x{size}",
            "batchSize": NOTEBOOK_BATCH_SIZE,
            **notebook_batch_means(notebook["intersections"], notebook["predicted"], notebook["true"]),
        },
        "notebookReported": NOTEBOOK_REPORTED[label],
        "routing": {
            "predictedClasses": predicted_classes,
            "routedToThisSegmenter": routed,
            "share": routed / scored,
            # Not routed: the service returns no mask (Dice 0 on a tumour).
            "endToEndDice": summarize(end_to_end),
        },
        "unreadable": unreadable,
        "shapeMismatches": shape_mismatches,
        "emptyTruthAfterBinarization": empty_truth,
    }


def evaluate_segmentation(plan: dict, registry: ModelRegistry, max_pixels: int) -> dict:
    started = time.perf_counter()
    classes = {}
    for label, entry in plan.items():
        classes[label] = {
            "pairs": len(entry["pairs"]),
            **evaluate_segmenter(label, entry["test"], registry, max_pixels),
        }
    return {
        "status": "ok",
        "dataset": {
            "name": "BRISC 2025",
            "split": "segmentation-reelle.ipynb: train_test_split(test_size=0.15, random_state=42), "
            "then train_test_split(test_size=0.5, random_state=42); test = second half",
        },
        "classes": classes,
        "durationSeconds": round(time.perf_counter() - started, 1),
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def _json_default(value):
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def build_report(registry: ModelRegistry) -> dict:
    return {
        "schemaVersion": 1,
        "pipeline": "brain",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "method": {
            "inference": "app.pipeline.analyze_brain (classification) and app.pipeline._segment (segmentation): "
            "the service's code, CPU, one deterministic pass, no test-time augmentation",
            "preprocessing": "app.preprocess.decode_image and to_input_tensor",
            "maskThreshold": MASK_THRESHOLD,
            "bootstrap": {"draws": BOOTSTRAP_DRAWS, "seed": BOOTSTRAP_SEED, "interval": "percentile 2.5-97.5"},
            "calibrationBins": CALIBRATION_BINS,
        },
        "weights": {
            entry["modelId"]: {"file": entry["file"], "sha256": entry["weightsSha256"], "loaded": entry["loaded"]}
            for entry in registry.status()
        },
        "versions": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "timm": timm.__version__,
            "segmentationModelsPytorch": smp.__version__,
            "opencv": cv2.__version__,
            "numpy": np.__version__,
            "scikitLearn": sklearn.__version__,
            "pandas": pd.__version__,
        },
        "classification": None,
        "segmentation": None,
    }


def report_path(output_dir: Path, classifier_sha256: str, today: datetime.date | None = None) -> Path:
    day = (today or datetime.date.today()).isoformat()
    return output_dir / f"brain-{day}-{classifier_sha256[:8]}.json"


def _percent(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.2f} %"


def _interval(ci: list[float] | None) -> str:
    return "" if ci is None else f" [IC 95 % {ci[0] * 100:.2f} – {ci[1] * 100:.2f}]"


def print_summary(report: dict, path: Path) -> None:
    print("\n=== Évaluation hors ligne — analyse cérébrale (une passe, sans TTA) ===")
    for model_id, weights in report["weights"].items():
        print(f"  {model_id} : {(weights['sha256'] or 'absent')[:12]} {'chargé' if weights['loaded'] else 'NON CHARGÉ'}")

    classification = report["classification"]
    if classification:
        dataset = classification["dataset"]
        print("\n--- Classification (Nickparvar, Testing) ---")
        print("  Images : " + ", ".join(f"{label} {count}" for label, count in dataset["imagesPerClass"].items()))
        if not dataset["matchesTrainingVersion"]:
            print(
                f"  ATTENTION : ce Testing n'a pas {dataset['expectedPerClass']} images par classe : ce n'est pas la version "
                "du jeu utilisée pour l'entraînement (7 200 images). Ses images peuvent figurer dans le Training de cette "
                "version : résultats possiblement optimistes."
            )
        if dataset["unreadable"]:
            print(f"  Illisibles (exclues) : {len(dataset['unreadable'])}")
        if classification["status"] == "ok":
            accuracy = classification["accuracy"]
            print(f"  Exactitude : {_percent(accuracy['value'])}{_interval(accuracy['ci95'])}"
                  f"  (notebook : {_percent(NOTEBOOK_REPORTED['classification']['accuracy'])} avec TTA)")
            print(f"  AUC macro (OvR) : {classification['macro']['auc']:.4f}" if classification["macro"]["auc"] is not None else "  AUC macro : —")
            print(f"  ECE (10 intervalles) : {classification['calibration']['ece']:.4f}")
            print("  Classe        Précision  Rappel [IC 95 %]              F1      AUC")
            for label, metrics in classification["perClass"].items():
                auc = "—" if metrics["auc"] is None else f"{metrics['auc']:.4f}"
                print(f"  {label:<12}  {_percent(metrics['precision']):>9}  {_percent(metrics['recall']):>8}"
                      f"{_interval(metrics['recallCi95']):<24}  {metrics['f1']:.4f}  {auc}")
            print("  Matrice de confusion (lignes : vraie classe ; colonnes : prédite) :")
            for label, row in zip(CLASS_LABELS, classification["confusionMatrix"]["matrix"]):
                print(f"    {label:<12} " + " ".join(f"{cell:>5}" for cell in row))
            print("  Seuil de confiance → part des images / exactitude sur cette part :")
            for row in classification["accuracyByConfidence"]:
                print(f"    >= {row['threshold']:.2f} : {_percent(row['coverage']):>9} / {_percent(row['accuracy'])}")

    segmentation = report["segmentation"]
    if segmentation:
        print("\n--- Segmentation (BRISC 2025, découpage du notebook) ---")
        if segmentation["status"] != "ok":
            print(f"  ARRÊTÉE : {segmentation['reason']}")
            print("  Aucun Dice n'est calculé.")
        else:
            for label, result in segmentation["classes"].items():
                if result["status"] != "ok":
                    print(f"  {label} : {'modèle non chargé' if result['status'] == 'model_not_loaded' else 'aucune image lisible'}")
                    continue
                service = result["service"]
                reported = result["notebookReported"]
                unreadable = f", {len(result['unreadable'])} illisibles" if result["unreadable"] else ""
                print(f"  {label} ({result['testImages']} images de test sur {result['pairs']} paires{unreadable})")
                for key, name in (("dice", "Dice"), ("iou", "IoU"), ("sensitivity", "Sensibilité")):
                    stats = service[key]
                    print(f"    {name:<12} moyenne {_percent(stats['mean'])}{_interval(stats['ci95'])}, médiane {_percent(stats['median'])}")
                notebook = result["notebookStyle"]
                print(f"    Façon notebook (256 px, moyenne par lot de 16) : Dice {_percent(notebook['dice'])}"
                      f" (notebook : {_percent(reported['dice'])}), IoU {_percent(notebook['iou'])}, sensibilité {_percent(notebook['sensitivity'])}")
                routing = result["routing"]
                print(f"    Routage : {routing['routedToThisSegmenter']}/{result['scoredImages']} images envoyées à ce segmenteur"
                      f" ({_percent(routing['share'])}) ; Dice de bout en bout {_percent(routing['endToEndDice']['mean'])}")

    print(f"\nRapport : {path}")


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Évaluation hors ligne de l'analyse cérébrale, par le code du service.")
    parser.add_argument("--nickparvar-test", type=normalize_path, help="dossier Testing du jeu Nickparvar (ou son dossier parent)")
    parser.add_argument("--brisc-root", type=normalize_path, help="dossier BRISC 2025 contenant manifest.csv (ou jusqu'à 2 niveaux au-dessus)")
    parser.add_argument("--models-dir", type=normalize_path, help="dossier des poids (par défaut AI_MODELS_DIR, comme le service)")
    parser.add_argument("--output-dir", type=normalize_path, default=DEFAULT_OUTPUT_DIR, help="dossier du rapport JSON")
    parser.add_argument("--check", action="store_true", help="vérifie chemins, poids et effectifs, sans aucune inférence")
    args = parser.parse_args(argv)

    if args.nickparvar_test is None and args.brisc_root is None:
        parser.error("indiquez --nickparvar-test et/ou --brisc-root")
    return args


def prepare(args: argparse.Namespace) -> dict:
    """Every check that needs no model: resolved paths, counts, BRISC split.

    `problems` stop everything (exit 1); `stopReason` stops the segmentation
    only, as a split that does not match the notebook does.
    """
    setup = {"problems": [], "nickparvar": None, "counts": None, "brisc": None, "plan": None, "stopReason": None}

    if args.models_dir is not None and not args.models_dir.is_dir():
        setup["problems"].append(str(_missing_folder(args.models_dir)))

    if args.nickparvar_test is not None:
        try:
            setup["nickparvar"], setup["counts"], note = prepare_nickparvar(args.nickparvar_test)
        except SetupError as error:
            setup["problems"].append(str(error))
        else:
            if note:
                print(note)
            if not args.check:  # --check prints them in its summary
                print(f"Nickparvar ({setup['nickparvar']}) : {format_counts(setup['counts'])}")

    if args.brisc_root is not None:
        try:
            setup["brisc"], note = locate_brisc(args.brisc_root)
        except SetupError as error:
            setup["problems"].append(str(error))
        else:
            if note:
                print(note)
            # Files first, then the split: a wrong one stops the segmentation
            # before any inference, and no Dice is ever computed on it.
            try:
                check_brisc_files(setup["brisc"])
                setup["plan"] = plan_brisc(setup["brisc"])
            except BriscSplitError as error:
                setup["stopReason"] = str(error)
            else:
                if not args.check:
                    print("BRISC 2025 : " + " ; ".join(
                        f"{label} {len(entry['pairs'])} paires, {len(entry['test'])} images de test"
                        for label, entry in setup["plan"].items()
                    ))
    return setup


def print_check(args: argparse.Namespace, setup: dict, registry: ModelRegistry, models_dir: Path) -> int:
    """Summary of --check; 0 when the evaluation can run as asked, 1 otherwise."""
    problems = list(setup["problems"])
    print("\n=== Vérification (aucune inférence) ===")
    print(f"Poids ({models_dir}) :")
    for entry in registry.models.values():
        state = "chargé" if entry.loaded else f"NON CHARGÉ ({entry.error})"
        print(f"  {entry.spec.model_id} — {entry.spec.file_name} — {(entry.weights_sha256 or 'absent')[:12]} — {state}")
    needed = [CLASSIFIER_ID] + ([SEGMENTER_BY_CLASS[label] for label in BRISC_EXPECTED] if args.brisc_root else [])
    for model_id in needed:
        entry = registry.get(model_id)
        if not entry.loaded:
            problems.append(f"{entry.spec.file_name} non chargé ({entry.error}) dans {models_dir}.")

    if args.nickparvar_test is not None:
        print(f"Nickparvar : {setup['nickparvar'] or args.nickparvar_test}")
        if setup["counts"]:
            print(f"  {format_counts(setup['counts'])} — {sum(setup['counts'].values())} images")
            if any(count != TRAINING_VERSION_TESTING_PER_CLASS for count in setup["counts"].values()):
                print(
                    f"  Attention : pas {TRAINING_VERSION_TESTING_PER_CLASS} images par classe : ce n'est pas la version du jeu "
                    "utilisée pour l'entraînement (7 200 images) ; les résultats seront signalés comme possiblement optimistes."
                )

    if args.brisc_root is not None:
        print(f"BRISC 2025 : {setup['brisc'] or args.brisc_root}")
        if setup["plan"]:
            for label, entry in setup["plan"].items():
                expected = BRISC_EXPECTED[label]
                print(f"  {label} : {len(entry['pairs'])} paires, {len(entry['test'])} images de test "
                      f"(attendu {expected['pairs']} et {expected['test']})")
        if setup["stopReason"]:
            problems.append(f"Segmentation : {setup['stopReason']}")

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
        # Loading the weights reads their hash and checks them strictly; no inference.
        return print_check(args, setup, load_registry(models_dir), models_dir)

    if setup["problems"]:
        for problem in setup["problems"]:
            print(f"\nERREUR : {_indented(problem, '  ')}", file=sys.stderr)
        return 1
    plan, stop_reason = setup["plan"], setup["stopReason"]
    if stop_reason:
        print(f"\nSEGMENTATION ARRÊTÉE : {_indented(stop_reason, '  ')}\n", file=sys.stderr)

    registry = load_registry(models_dir)
    classifier = registry.get(CLASSIFIER_ID)
    if not classifier.loaded:
        print(
            f"Classifieur non chargé ({classifier.error}) : {classifier.spec.file_name} dans {models_dir}. "
            "Indiquez le dossier des poids avec --models-dir.",
            file=sys.stderr,
        )
        return 1

    report = build_report(registry)
    if args.nickparvar_test is not None:
        report["classification"] = evaluate_classification(setup["nickparvar"], registry, settings.max_image_pixels)
    if args.brisc_root is not None:
        report["segmentation"] = (
            {"status": "stopped", "reason": stop_reason}
            if stop_reason
            else evaluate_segmentation(plan, registry, settings.max_image_pixels)
        )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    path = report_path(args.output_dir, classifier.weights_sha256)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default) + "\n", encoding="utf-8")
    print_summary(report, path)
    return 2 if stop_reason else 0


if __name__ == "__main__":
    sys.exit(main())
