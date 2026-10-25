"""Offline evaluation of the cardiac MRI segmentation, as the service runs it.

Replays the service's own code (app.cardio_seg_pipeline.predict_labels:
to_uint8, grey -> RGB, resize, normalisation, inference, argmax) on the test
patients of the model card, from the preprocessed ACDC data
(Kaggle anhoangvo/acdc-dataset): patientXXX_frameYY_slice_Z.h5 files when
available, otherwise slices along axis 0 of patientXXX_frameYY.h5 volumes
(keys "image" and "label"), at any depth.

    .venv/Scripts/python -m scripts.evaluate_cardio_seg --acdc <ACDC_preprocessed folder>

The number of volumes (patient x phase) is checked against the card before
any inference (44); otherwise nothing runs. ACDC labels (1 RV, 2 MYO, 3 LV)
are remapped to the model's (1 LV, 2 RV, 3 MYO). The 3D Dice of each volume
is computed at 256 x 256, as in the notebook: NaN when the structure is
absent from both. Writes evaluation/cardio-seg-<date>-<sha256[:8]>.json,
copied to evaluation/cardio-seg-latest.json; fails (exit code 1) when the
mean Dice differs from the card's by more than 0.005, exit code 2 when the
data or the model is missing. No image is written.
"""

from __future__ import annotations

import argparse
import datetime
import json
import platform
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import h5py

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import segmentation_models_pytorch as smp  # noqa: E402
import torch  # noqa: E402

from app.cardio_seg_models import CARDIO_SEG_MODEL_ID, STRUCTURES, load_cardio_seg_model  # noqa: E402
from app.cardio_seg_pipeline import predict_labels  # noqa: E402
from app.config import DEFAULT_MODELS_DIR  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "evaluation"
LATEST_REPORT_NAME = "cardio-seg-latest.json"
MAX_MEAN_DICE_GAP = 0.005
SLICE_NAME = re.compile(r"patient(\d+)_frame(\d+)_slice_(\d+)\.h5$")
VOLUME_NAME = re.compile(r"patient(\d+)_frame(\d+)\.h5$")
SliceSource = Path | tuple[Path, int]
# ACDC (1 RV, 2 MYO, 3 LV) -> model (1 LV, 2 RV, 3 MYO).
ACDC_TO_MODEL = {1: 2, 2: 3, 3: 1}


def find_volumes(root: Path, patients: list[int]) -> dict[tuple[int, int], list[SliceSource]]:
    """Find ordered slices, preferring 2D files over a 3D file for each phase."""
    volumes: dict[tuple[int, int], list[tuple[int, Path]]] = defaultdict(list)
    wanted = set(patients)
    for path in root.rglob("patient*_frame*_slice_*.h5"):
        match = SLICE_NAME.search(path.name)
        if match and int(match.group(1)) in wanted:
            volumes[(int(match.group(1)), int(match.group(2)))].append((int(match.group(3)), path))
    found: dict[tuple[int, int], list[SliceSource]] = {
        key: [path for _, path in sorted(files)] for key, files in volumes.items()
    }
    for path in root.rglob("patient*_frame*.h5"):
        match = VOLUME_NAME.fullmatch(path.name)
        if not match or int(match.group(1)) not in wanted:
            continue
        key = (int(match.group(1)), int(match.group(2)))
        if key in found:
            continue
        with h5py.File(path, "r") as handle:
            image_shape, label_shape = handle["image"].shape, handle["label"].shape
        if len(image_shape) != 3 or image_shape != label_shape:
            raise ValueError(f"{path}: expected matching 3D image and label shapes, got {image_shape} and {label_shape}.")
        if image_shape[0] != min(image_shape):
            raise ValueError(f"{path}: axis 0 must be the smallest axis (slices first), got shape {image_shape}.")
        found[key] = [(path, index) for index in range(image_shape[0])]
    return dict(sorted(found.items()))


def remap_acdc(label: np.ndarray) -> np.ndarray:
    remapped = np.zeros(label.shape, dtype=np.uint8)
    for acdc, model in ACDC_TO_MODEL.items():
        remapped[label == acdc] = model
    return remapped


def dice_3d(predicted: np.ndarray, truth: np.ndarray, label: int) -> float:
    """2 |P ∩ G| / (|P| + |G|) over the volume; NaN when the structure is in neither."""
    p, g = predicted == label, truth == label
    total = int(p.sum()) + int(g.sum())
    return float("nan") if total == 0 else 2.0 * int((p & g).sum()) / total


def read_slice(source: SliceSource) -> tuple[np.ndarray, np.ndarray]:
    """Read a 2D file or one axis-0 slice of a 3D file identically."""
    path, index = (source, None) if isinstance(source, Path) else source
    with h5py.File(path, "r") as handle:
        image = handle["image"] if index is None else handle["image"][index]
        label = handle["label"] if index is None else handle["label"][index]
        return np.asarray(image, dtype=np.float32), np.asarray(label).astype(np.uint8)


def evaluate_volumes(volumes: dict[tuple[int, int], list[SliceSource]], predict, size: int, read=read_slice) -> list[dict]:
    """The Dice of each volume; predict(pixels) gives the (size, size) class map."""
    results = []
    for (patient, frame), files in volumes.items():
        predicted, truth = [], []
        for path in files:
            image, label = read(path)
            predicted.append(predict(image))
            truth.append(cv2.resize(remap_acdc(label), (size, size), interpolation=cv2.INTER_NEAREST))
        stack_p, stack_t = np.stack(predicted), np.stack(truth)
        results.append(
            {
                "patient": patient,
                "frame": frame,
                "slices": len(files),
                "dice": {name: dice_3d(stack_p, stack_t, index) for index, name in enumerate(STRUCTURES, start=1)},
            }
        )
    return results


def summarize(per_volume: list[dict]) -> dict:
    per_class = {}
    for name in STRUCTURES:
        values = np.array([volume["dice"][name] for volume in per_volume], dtype=np.float64)
        defined = values[~np.isnan(values)]
        per_class[name] = {
            "mean": float(defined.mean()) if defined.size else None,
            "std": float(defined.std()) if defined.size else None,
            "n": int(defined.size),
        }
    means = [entry["mean"] for entry in per_class.values() if entry["mean"] is not None]
    return {"perClass": per_class, "mean": float(np.mean(means)) if means else None}


def compare(measured: dict, card_test: dict) -> dict:
    gap = (measured["mean"] if measured["mean"] is not None else float("nan")) - float(card_test["mean"])
    return {
        "notebookMeanDice": float(card_test["mean"]),
        "serviceMeanDice": measured["mean"],
        "difference": gap,
        "tolerance": MAX_MEAN_DICE_GAP,
        "ok": bool(abs(gap) <= MAX_MEAN_DICE_GAP),
    }


def json_safe(value):
    """The value with every NaN replaced by None (null in JSON)."""
    if isinstance(value, float) and np.isnan(value):
        return None
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


def build_report(entry, volumes: dict, per_volume: list[dict], acdc_root: Path) -> dict:
    card = entry.config["card"]
    measured = summarize(per_volume)
    status = entry.status()
    return json_safe(
        {
            "schemaVersion": 1,
            "pipeline": "cardio-seg-mri",
            "generatedAt": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
            "method": {
                "inference": "app.cardio_seg_pipeline.predict_labels: to_uint8, grey -> RGB, resize, normalisation of the card, argmax; CPU",
                "metric": "3D Dice per volume (patient x phase) at 256 x 256, NaN when the structure is absent from both",
            },
            "dataset": {
                "name": "ACDC (preprocessed, Kaggle anhoangvo/acdc-dataset)",
                "folder": acdc_root.name,
                "testPatients": card["training"]["test_patients"],
                "nVolumes": len(volumes),
                "nSlices": sum(len(files) for files in volumes.values()),
            },
            "weights": {
                CARDIO_SEG_MODEL_ID: {
                    "file": status["file"],
                    "sha256": status["weightsSha256"],
                    "loaded": status["loaded"],
                    "config": status.get("config"),
                }
            },
            "versions": {
                "python": platform.python_version(),
                "torch": torch.__version__,
                "segmentation_models_pytorch": smp.__version__,
                "numpy": np.__version__,
                "opencv": cv2.__version__,
            },
            "metrics": measured,
            "comparison": compare(measured, card["test"]),
            "perVolume": per_volume,
        }
    )


def write_report(
    report: dict,
    output_dir: Path,
    sha256: str,
    now: datetime.date | None = None,
    *,
    prefix: str = "cardio-seg",
    latest_name: str = LATEST_REPORT_NAME,
) -> Path:
    """<prefix>-<date>-<sha8>.json, named inside, copied to <latest_name> (the
    cardiac volumetry evaluation writes cardio-volume-* the same way)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    day = (now or datetime.date.today()).isoformat()
    path = output_dir / f"{prefix}-{day}-{sha256[:8]}.json"
    report = {"file": path.name, **report}
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    shutil.copyfile(path, output_dir / latest_name)
    return path


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--acdc", type=Path, required=True, help="ACDC_preprocessed folder (2D slices and/or 3D volumes)")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODELS_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args(argv)

    if not args.acdc.is_dir():
        print(f"ACDC folder not found: {args.acdc}.", file=sys.stderr)
        return 2
    entry = load_cardio_seg_model(args.models_dir)
    if not entry.loaded:
        print(f"Model {CARDIO_SEG_MODEL_ID} not loaded: {entry.error}.", file=sys.stderr)
        return 2

    card = entry.config["card"]
    volumes = find_volumes(args.acdc, card["training"]["test_patients"])
    expected = int(card["test"]["n_volumes"])
    # Checked before any inference: another count is another test set.
    if len(volumes) != expected:
        print(f"{len(volumes)} test volumes found in {args.acdc}, the card expects {expected}.", file=sys.stderr)
        return 2

    per_volume = evaluate_volumes(volumes, lambda pixels: predict_labels(pixels, entry), entry.config["input_size"])
    report = build_report(entry, volumes, per_volume, args.acdc)
    path = write_report(report, args.output_dir, entry.weights_sha256)
    comparison = report["comparison"]
    print(
        f"{len(volumes)} volumes, mean 3D Dice {comparison['serviceMeanDice']:.4f} "
        f"(notebook {comparison['notebookMeanDice']:.4f}, difference {comparison['difference']:+.4f})."
    )
    for name, metrics in report["metrics"]["perClass"].items():
        print(f"  {name:3s} {metrics['mean']:.4f} ± {metrics['std']:.4f} (n={metrics['n']})")
    print(f"Written: {path}")
    if not comparison["ok"]:
        print(f"Mean Dice differs from the notebook's by more than {MAX_MEAN_DICE_GAP}.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
