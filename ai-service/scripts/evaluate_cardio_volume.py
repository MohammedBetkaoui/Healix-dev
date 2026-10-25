"""Offline evaluation of the cardiac volumetry on the 22 test patients of the model card.

Replays the service's own code (app.cardio_seg_pipeline.predict_labels_batch for
the segmentation, app.cardio_volume_measures.compute_measures for the measures)
on the test patients of the model card, and compares with the ground truth:

    .venv/Scripts/python -m scripts.evaluate_cardio_volume --acdc <ACDC_preprocessed folder>
    .venv/Scripts/python -m scripts.evaluate_cardio_volume --acdc <ACDC_preprocessed> \\
        --acdc-nifti <ACDC database folder> --figures <a folder outside the repository>

1. With the preprocessed slices (Kaggle anhoangvo/acdc-dataset, the files of
   evaluate_cardio_seg.py), which hold only the ED and ES phases and no pixel
   spacing: the ejection fraction of the LV and of the RV, from the predicted
   masks and from the ground truth. The spacing cancels out in the ratio of two
   volumes of the same patient. ED is the phase whose ground-truth LV is the
   larger, for both. The number of volumes (patient x phase) is checked against
   the card before any inference (44).
2. With --acdc-nifti (the original NIfTI, "database/training/patientXXX" and
   "database/testing/patientXXX", with pixdim and Info.cfg): also the LV
   end-diastolic and end-systolic volumes in ml and the LV mass in g, ED and ES
   being those of Info.cfg. Each frame is rescaled to [0, 1] over its volume
   before the model, as the preprocessing that wrote the h5 files did (an
   assumption this script cannot check without the Kaggle files side by side).

Statistics, for each measure: mean absolute error, bias and 95 % limits of
agreement (Bland-Altman: bias +/- 1.96 SD of the differences), Pearson's r.
The 3D Dice of the segmentation is computed on the way and compared with the
card's, as evaluate_cardio_seg.py does: the volumes are only worth reading if
the batch inference still reproduces the notebook.

Writes evaluation/cardio-volume-<date>-<sha256[:8]>.json, copied to
evaluation/cardio-volume-latest.json (what the backend prints in the report).
--figures: the Bland-Altman plot of the LVEF and the predicted-against-truth
scatter, as PDF, in a folder that must be outside the repository. Exit code 1
when the mean Dice differs from the card's by more than 0.005, 2 when the data,
the model or the folder is missing or does not hold what the card expects. No
image of the database is written.
"""

from __future__ import annotations

import argparse
import datetime
import platform
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import segmentation_models_pytorch as smp  # noqa: E402
import torch  # noqa: E402

from app.cardio_seg_models import CARDIO_SEG_MODEL_ID, STRUCTURES, load_cardio_seg_model  # noqa: E402
from app.cardio_seg_pipeline import predict_labels_batch, segment_batch  # noqa: E402
from app.cardio_volume_measures import compute_measures  # noqa: E402
from app.cardio_volume_pipeline import slice_areas  # noqa: E402
from app.config import DEFAULT_MODELS_DIR  # noqa: E402
from scripts.evaluate_cardio_seg import (  # noqa: E402
    OUTPUT_DIR,
    compare,
    dice_3d,
    find_volumes,
    json_safe,
    read_slice,
    remap_acdc,
    summarize,
    write_report,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
LATEST_REPORT_NAME = "cardio-volume-latest.json"
REPORT_PREFIX = "cardio-volume"
MAX_MEAN_DICE_GAP = 0.005


# --- Statistics -----------------------------------------------------------------------------------


def agreement_stats(predicted: list[float], truth: list[float]) -> dict:
    """Mean absolute error, bias and limits of agreement (Bland-Altman) of predicted
    against truth, Pearson's r. None where the sample is too small to say."""
    p, t = np.asarray(predicted, dtype=np.float64), np.asarray(truth, dtype=np.float64)
    if p.shape != t.shape or p.size == 0:
        raise ValueError("predicted and truth must be two samples of the same, non-zero size.")
    difference = p - t
    bias = float(difference.mean())
    sd = float(difference.std(ddof=1)) if p.size > 1 else None
    correlation = None
    if p.size > 2 and p.std() > 0 and t.std() > 0:
        correlation = float(np.corrcoef(p, t)[0, 1])
    return {
        "n": int(p.size),
        "mae": float(np.abs(difference).mean()),
        "bias": bias,
        "sdOfDifferences": sd,
        "limitsOfAgreement": None if sd is None else [bias - 1.96 * sd, bias + 1.96 * sd],
        "pearsonR": correlation,
    }


# --- The preprocessed slices: EF of the LV and of the RV -------------------------------------------


def evaluate_volumes(volumes: dict, predict_batch, size: int, read=read_slice) -> list[dict]:
    """For each volume (patient x phase): its slices segmented, the 3D Dice of the
    segmentation and the number of voxels of each structure, predicted and true, at
    size x size. predict_batch(images) gives one (size, size) class map per image."""
    results = []
    for (patient, frame), files in volumes.items():
        images, truth = [], []
        for path in files:
            image, label = read(path)
            images.append(image)
            truth.append(cv2.resize(remap_acdc(label), (size, size), interpolation=cv2.INTER_NEAREST))
        stack_p, stack_t = np.stack(predict_batch(images)), np.stack(truth)
        results.append(
            {
                "patient": patient,
                "frame": frame,
                "slices": len(files),
                "dice": {name: dice_3d(stack_p, stack_t, index) for index, name in enumerate(STRUCTURES, start=1)},
                "voxels": {
                    "predicted": {name: int((stack_p == index).sum()) for index, name in enumerate(STRUCTURES, start=1)},
                    "truth": {name: int((stack_t == index).sum()) for index, name in enumerate(STRUCTURES, start=1)},
                },
            }
        )
    return results


def ejection_fraction(ed: float, es: float) -> float | None:
    return (ed - es) / ed * 100.0 if ed > 0 else None


def pair_patients(per_volume: list[dict]) -> list[dict]:
    """One entry per patient from its two volumes: ED is the one whose true LV is the
    larger; the EF of the LV and of the RV, predicted and true. A patient who has not
    exactly two volumes, or no true LV, has no entry's worth of data: ValueError."""
    by_patient: dict[int, list[dict]] = {}
    for volume in per_volume:
        by_patient.setdefault(volume["patient"], []).append(volume)
    pairs = []
    for patient, volumes in sorted(by_patient.items()):
        if len(volumes) != 2:
            raise ValueError(f"patient {patient} has {len(volumes)} volumes, two phases (ED and ES) are expected.")
        ed, es = sorted(volumes, key=lambda volume: volume["voxels"]["truth"]["LV"], reverse=True)
        if ed["voxels"]["truth"]["LV"] == 0:
            raise ValueError(f"patient {patient} has no true LV.")
        entry = {"patient": patient, "edFrame": ed["frame"], "esFrame": es["frame"]}
        for name, key in (("LV", "lvef"), ("RV", "rvef")):
            entry[key] = {
                which: ejection_fraction(ed["voxels"][which][name], es["voxels"][which][name])
                for which in ("predicted", "truth")
            }
        pairs.append(entry)
    return pairs


def ef_statistics(pairs: list[dict]) -> dict:
    stats = {}
    for key in ("lvef", "rvef"):
        usable = [pair[key] for pair in pairs if pair[key]["predicted"] is not None and pair[key]["truth"] is not None]
        stats[key] = {
            **agreement_stats([item["predicted"] for item in usable], [item["truth"] for item in usable]),
            "unit": "percentage points",
            "undefined": len(pairs) - len(usable),
        }
    return stats


# --- The original NIfTI: volumes in ml and mass ------------------------------------------------------


def find_patient_folders(root: Path, patients: list[int]) -> dict[int, Path]:
    """{patient: folder} for the given patients, a folder being a patientXXX with its Info.cfg."""
    found = {}
    for patient in patients:
        matches = [path for path in root.rglob(f"patient{patient:03d}") if (path / "Info.cfg").is_file()]
        if len(matches) == 1:
            found[patient] = matches[0]
    return found


def minmax(volume: np.ndarray) -> np.ndarray:
    """The volume rescaled to [0, 1] (the preprocessing of the h5 slices); zeros if it is flat."""
    low, high = float(volume.min()), float(volume.max())
    return np.zeros_like(volume, dtype=np.float32) if high <= low else ((volume - low) / (high - low)).astype(np.float32)


def read_patient(folder: Path) -> dict:
    """ED and ES frames of Info.cfg with their ground truth and the voxel size (x, y, z), mm."""
    import nibabel

    from scripts.make_sample_cine_dicom import parse_info_cfg

    info = parse_info_cfg((folder / "Info.cfg").read_text(encoding="utf-8"))
    patient = folder.name
    frames = {}
    spacing = None
    for key in ("ED", "ES"):
        number = int(info[key])
        image = nibabel.load(str(folder / f"{patient}_frame{number:02d}.nii.gz"))
        truth = nibabel.load(str(folder / f"{patient}_frame{number:02d}_gt.nii.gz"))
        spacing = tuple(float(value) for value in image.header.get_zooms()[:3])
        frames[key] = {
            "frame": number,
            "image": np.asarray(image.dataobj, dtype=np.float32),
            "truth": np.asarray(truth.dataobj).astype(np.uint8),
        }
    return {"frames": frames, "spacing": spacing}


def phase_areas(labels_by_slice: list[np.ndarray], pixel_area: float) -> list[dict]:
    return [slice_areas(labels, pixel_area) for labels in labels_by_slice]


def evaluate_patient_nifti(folder: Path, segment_batch_fn, read=read_patient) -> dict:
    """The measures of one patient, from the predicted masks and from the truth, at
    the ED and ES of Info.cfg: segment_batch_fn(images) gives one (H, W) class map per image."""
    data = read(folder)
    sx, sy, sz = data["spacing"]
    pixel_area = sx * sy
    predicted_areas, truth_areas = [], []
    for key in ("ED", "ES"):
        frame = data["frames"][key]
        volume = minmax(frame["image"])
        # volume[:, :, z].T: the rows are y, as in the SimpleITK arrays the h5 slices were cut from.
        images = [volume[:, :, z].T for z in range(volume.shape[2])]
        predicted_areas.append(phase_areas(segment_batch_fn(images), pixel_area))
        truth_areas.append(phase_areas([remap_acdc(frame["truth"][:, :, z].T) for z in range(volume.shape[2])], pixel_area))
    return {
        "patient": int(folder.name.removeprefix("patient")),
        "edFrame": data["frames"]["ED"]["frame"],
        "esFrame": data["frames"]["ES"]["frame"],
        "sliceStepMm": sz,
        "predicted": compute_measures(predicted_areas, sz, 0, 1),
        "truth": compute_measures(truth_areas, sz, 0, 1),
    }


NIFTI_MEASURES = {
    "lvEdvMl": lambda measures: measures["lv"]["edvMl"],
    "lvEsvMl": lambda measures: measures["lv"]["esvMl"],
    "lvMassG": lambda measures: measures["lvMassG"],
    "lvef": lambda measures: measures["lv"]["efPercent"],
    "rvef": lambda measures: measures["rv"]["efPercent"],
}


def nifti_statistics(patients: list[dict]) -> dict:
    stats = {}
    for name, read_value in NIFTI_MEASURES.items():
        pairs = [
            (read_value(patient["predicted"]), read_value(patient["truth"]))
            for patient in patients
            if read_value(patient["predicted"]) is not None and read_value(patient["truth"]) is not None
        ]
        stats[name] = {
            **agreement_stats([p for p, _ in pairs], [t for _, t in pairs]),
            "unit": {"lvEdvMl": "ml", "lvEsvMl": "ml", "lvMassG": "g"}.get(name, "percentage points"),
            "undefined": len(patients) - len(pairs),
        }
    return stats


# --- Figures --------------------------------------------------------------------------------------------


def inside_repository(folder: Path) -> bool:
    resolved = folder.resolve()
    return resolved == REPO_ROOT or REPO_ROOT in resolved.parents


def write_figures(pairs: list[dict], stats: dict, folder: Path) -> list[Path]:
    """The Bland-Altman plot of the LVEF and the predicted-against-truth line, as PDF."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    folder.mkdir(parents=True, exist_ok=True)
    usable = [pair["lvef"] for pair in pairs if pair["lvef"]["predicted"] is not None and pair["lvef"]["truth"] is not None]
    predicted = np.array([item["predicted"] for item in usable])
    truth = np.array([item["truth"] for item in usable])
    lvef = stats["lvef"]
    paths = []

    figure, axis = plt.subplots(figsize=(5.2, 4.2))
    mean = (predicted + truth) / 2
    axis.scatter(mean, predicted - truth, s=22, color="#0072B2")
    axis.axhline(lvef["bias"], color="#D55E00", linewidth=1.2, label=f"bias {lvef['bias']:+.2f}")
    if lvef["limitsOfAgreement"]:
        for limit in lvef["limitsOfAgreement"]:
            axis.axhline(limit, color="#555555", linestyle="--", linewidth=1)
    axis.axhline(0, color="#999999", linewidth=0.6)
    axis.set_xlabel("mean of predicted and true LVEF (%)")
    axis.set_ylabel("predicted - true LVEF (percentage points)")
    axis.set_title(f"Bland-Altman, LVEF (n = {lvef['n']})")
    axis.legend(loc="best", fontsize=8)
    paths.append(folder / "lvef-bland-altman.pdf")
    figure.savefig(paths[-1], bbox_inches="tight")
    plt.close(figure)

    figure, axis = plt.subplots(figsize=(4.4, 4.4))
    axis.scatter(truth, predicted, s=22, color="#009E73")
    low, high = float(min(truth.min(), predicted.min())) - 3, float(max(truth.max(), predicted.max())) + 3
    axis.plot([low, high], [low, high], color="#999999", linewidth=1)
    axis.set_xlim(low, high)
    axis.set_ylim(low, high)
    axis.set_xlabel("true LVEF (%)")
    axis.set_ylabel("predicted LVEF (%)")
    r = lvef["pearsonR"]
    axis.set_title(f"LVEF, predicted against truth (r = {r:.3f})" if r is not None else "LVEF, predicted against truth")
    paths.append(folder / "lvef-predicted-vs-truth.pdf")
    figure.savefig(paths[-1], bbox_inches="tight")
    plt.close(figure)
    return paths


# --- Report ---------------------------------------------------------------------------------------------


def build_report(entry, volumes: dict, per_volume: list[dict], pairs: list[dict], acdc_root: Path, nifti: dict | None) -> dict:
    card = entry.config["card"]
    measured = summarize(per_volume)
    status = entry.status()
    return json_safe(
        {
            "schemaVersion": 1,
            "pipeline": "cardio-volume-mri",
            "generatedAt": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
            "method": {
                "inference": "app.cardio_seg_pipeline.predict_labels_batch (the preprocessing of the single-slice pipeline), CPU",
                "efPreprocessed": "ejection fraction of the LV and the RV from voxel counts at 256 x 256 (the spacing cancels in the ratio); ED = the phase whose true LV is the larger",
                "efNifti": "app.cardio_volume_measures.compute_measures at the ED and ES of Info.cfg, volumes by Simpson's discs with the step between slices of the NIfTI, each frame rescaled to [0, 1]",
                "agreement": "mean absolute error, bias and 95 % limits of agreement (bias +/- 1.96 SD of the differences), Pearson's r",
            },
            "dataset": {
                "name": "ACDC (preprocessed, Kaggle anhoangvo/acdc-dataset)",
                "folder": acdc_root.name,
                "testPatients": card["training"]["test_patients"],
                "nPatients": len(pairs),
                "nVolumes": len(volumes),
                "nSlices": sum(len(files) for files in volumes.values()),
                "nifti": None if nifti is None else {"folder": nifti["folder"], "nPatients": len(nifti["patients"])},
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
            "segmentation": {"metrics": measured, "comparison": compare(measured, card["test"])},
            "metrics": ef_statistics(pairs),
            "metricsNifti": None if nifti is None else nifti_statistics(nifti["patients"]),
            "perPatient": pairs,
            "perPatientNifti": None if nifti is None else nifti["patients"],
        }
    )


def describe(name: str, stats: dict) -> str:
    limits = stats["limitsOfAgreement"]
    interval = f"[{limits[0]:+.2f}, {limits[1]:+.2f}]" if limits else "n/a"
    r = f"{stats['pearsonR']:.3f}" if stats["pearsonR"] is not None else "n/a"
    return f"  {name:7s} n={stats['n']:2d}  MAE {stats['mae']:.2f}  bias {stats['bias']:+.2f}  limits {interval}  r {r}  ({stats['unit']})"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--acdc", type=Path, required=True, help="ACDC_preprocessed folder (patientXXX_frameYY_slice_Z.h5)")
    parser.add_argument("--acdc-nifti", type=Path, default=None, help="ACDC database folder (training/ and testing/ with the NIfTI and Info.cfg)")
    parser.add_argument("--figures", type=Path, default=None, help="folder for the PDF figures, outside the repository")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODELS_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args(argv)

    if not args.acdc.is_dir():
        print(f"ACDC folder not found: {args.acdc}.", file=sys.stderr)
        return 2
    if args.acdc_nifti is not None and not args.acdc_nifti.is_dir():
        print(f"ACDC NIfTI folder not found: {args.acdc_nifti}.", file=sys.stderr)
        return 2
    if args.figures is not None and inside_repository(args.figures):
        print("The figures must be written outside the repository (the ACDC licence forbids sharing its data).", file=sys.stderr)
        return 2
    entry = load_cardio_seg_model(args.models_dir)
    if not entry.loaded:
        print(f"Model {CARDIO_SEG_MODEL_ID} not loaded: {entry.error}.", file=sys.stderr)
        return 2

    card = entry.config["card"]
    patients = card["training"]["test_patients"]
    volumes = find_volumes(args.acdc, patients)
    expected = int(card["test"]["n_volumes"])
    # Checked before any inference: another count is another test set.
    if len(volumes) != expected:
        print(f"{len(volumes)} test volumes found in {args.acdc}, the card expects {expected}.", file=sys.stderr)
        return 2
    folders = {}
    if args.acdc_nifti is not None:
        folders = find_patient_folders(args.acdc_nifti, patients)
        if len(folders) != len(patients):
            print(f"{len(folders)} of the {len(patients)} test patients found in {args.acdc_nifti} (a patientXXX folder with its Info.cfg).", file=sys.stderr)
            return 2

    size = entry.config["input_size"]
    per_volume = evaluate_volumes(volumes, lambda images: predict_labels_batch(images, entry), size)
    try:
        pairs = pair_patients(per_volume)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    nifti = None
    if folders:
        nifti = {
            "folder": args.acdc_nifti.name,
            "patients": [evaluate_patient_nifti(folder, lambda images: segment_batch(images, entry)) for _, folder in sorted(folders.items())],
        }

    report = build_report(entry, volumes, per_volume, pairs, args.acdc, nifti)
    path = write_report(report, args.output_dir, entry.weights_sha256, prefix=REPORT_PREFIX, latest_name=LATEST_REPORT_NAME)
    comparison = report["segmentation"]["comparison"]
    print(
        f"{len(volumes)} volumes of {len(pairs)} patients, mean 3D Dice {comparison['serviceMeanDice']:.4f} "
        f"(notebook {comparison['notebookMeanDice']:.4f}, difference {comparison['difference']:+.4f})."
    )
    for name, stats in report["metrics"].items():
        print(describe(name.upper(), stats))
    if report["metricsNifti"]:
        for name, stats in report["metricsNifti"].items():
            print(describe(name, stats))
    if args.figures is not None:
        for figure in write_figures(pairs, report["metrics"], args.figures):
            print(f"Figure: {figure}")
    print(f"Written: {path}")
    if not comparison["ok"]:
        print(f"Mean Dice differs from the notebook's by more than {MAX_MEAN_DICE_GAP}.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
