"""Offline evaluation of the cardiac MRI segmentation, as the service runs it.

Replays the service's own code (app.cardio_seg_pipeline.predict_labels:
to_uint8, grey -> RGB, resize, normalisation, inference, argmax) on the test
patients of the model card, from the preprocessed ACDC slices
(Kaggle anhoangvo/acdc-dataset): every patientXXX_frameYY_slice_Z.h5 file
(keys "image" and "label") of those patients, at any depth.

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
# ACDC (1 RV, 2 MYO, 3 LV) -> model (1 LV, 2 RV, 3 MYO).
ACDC_TO_MODEL = {1: 2, 2: 3, 3: 1}


def find_volumes(root: Path, patients: list[int]) -> dict[tuple[int, int], list[Path]]:
    """{(patient, frame): slice files in slice order} for the given patients."""
    volumes: dict[tuple[int, int], list[tuple[int, Path]]] = defaultdict(list)
    wanted = set(patients)
    for path in root.rglob("patient*_frame*_slice_*.h5"):
        match = SLICE_NAME.search(path.name)
        if match and int(match.group(1)) in wanted:
            volumes[(int(match.group(1)), int(match.group(2)))].append((int(match.group(3)), path))
    return {key: [path for _, path in sorted(files)] for key, files in sorted(volumes.items())}


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


def read_slice(path: Path) -> tuple[np.ndarray, np.ndarray]:
    import h5py

    with h5py.File(path, "r") as handle:
        return np.asarray(handle["image"], dtype=np.float32), np.asarray(handle["label"]).astype(np.uint8)


def evaluate_volumes(volumes: dict[tuple[int, int], list[Path]], predict, size: int, read=read_slice) -> list[dict]:
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


def _json_safe(value):
    if isinstance(value, float) and np.isnan(value):
        return None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def build_report(entry, volumes: dict, per_volume: list[dict], acdc_root: Path) -> dict:
    card = entry.config["card"]
    measured = summarize(per_volume)
    status = entry.status()
    return _json_safe(
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


def write_report(report: dict, output_dir: Path, sha256: str, now: datetime.date | None = None) -> Path:
    """cardio-seg-<date>-<sha8>.json, named inside, copied to cardio-seg-latest.json."""
    output_dir.mkdir(parents=True, exist_ok=True)
    day = (now or datetime.date.today()).isoformat()
    path = output_dir / f"cardio-seg-{day}-{sha256[:8]}.json"
    report = {"file": path.name, **report}
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    shutil.copyfile(path, output_dir / LATEST_REPORT_NAME)
    return path


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--acdc", type=Path, required=True, help="ACDC_preprocessed folder (patientXXX_frameYY_slice_Z.h5)")
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
