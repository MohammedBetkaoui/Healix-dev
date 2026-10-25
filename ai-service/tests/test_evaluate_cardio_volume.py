"""scripts/evaluate_cardio_volume.py without ACDC: the statistics, the pairing of the
phases of a patient, the EF from voxel counts, the volumes in ml from synthetic NIfTI,
the figures, the report, and the checks that stop it before any inference.

Everything here is made-up data written to a temporary folder: no image of ACDC.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import h5py
import nibabel
import numpy as np
import pytest

import scripts.evaluate_cardio_volume as module
from scripts.evaluate_cardio_seg import remap_acdc
from scripts.evaluate_cardio_volume import (
    LATEST_REPORT_NAME,
    agreement_stats,
    ef_statistics,
    ejection_fraction,
    evaluate_patient_nifti,
    evaluate_volumes,
    find_patient_folders,
    inside_repository,
    main,
    minmax,
    nifti_statistics,
    pair_patients,
    write_figures,
)

CARD = json.loads((Path(__file__).resolve().parent / "fixtures" / "cardio-seg" / "model-card.json").read_text(encoding="utf-8"))


# --- Statistics ---------------------------------------------------------------------------------------


def test_agreement_statistics_of_a_small_sample():
    stats = agreement_stats([50.0, 60.0, 40.0], [48.0, 62.0, 41.0])

    differences = [2.0, -2.0, -1.0]
    bias = sum(differences) / 3
    sd = math.sqrt(sum((d - bias) ** 2 for d in differences) / 2)
    assert stats["n"] == 3
    assert stats["mae"] == pytest.approx(5 / 3)
    assert stats["bias"] == pytest.approx(bias)
    assert stats["sdOfDifferences"] == pytest.approx(sd)
    assert stats["limitsOfAgreement"] == pytest.approx([bias - 1.96 * sd, bias + 1.96 * sd])
    # Pearson by hand: cov / (sd_x sd_y).
    mean_p, mean_t = (50 + 60 + 40) / 3, (48 + 62 + 41) / 3
    cov = sum((p - mean_p) * (t - mean_t) for p, t in zip([50, 60, 40], [48, 62, 41], strict=True))
    var_p = sum((p - mean_p) ** 2 for p in [50, 60, 40])
    var_t = sum((t - mean_t) ** 2 for t in [48, 62, 41])
    assert stats["pearsonR"] == pytest.approx(cov / math.sqrt(var_p * var_t))


def test_a_perfect_prediction_has_no_error_and_a_correlation_of_one():
    values = [35.0, 48.0, 55.0, 62.0, 70.0]
    stats = agreement_stats(values, values)

    assert stats["mae"] == 0 and stats["bias"] == 0 and stats["sdOfDifferences"] == 0
    assert stats["limitsOfAgreement"] == [0.0, 0.0] and stats["pearsonR"] == pytest.approx(1.0)


def test_a_sample_too_small_gives_no_spread_and_no_correlation():
    one = agreement_stats([50.0], [45.0])
    assert one["sdOfDifferences"] is None and one["limitsOfAgreement"] is None and one["pearsonR"] is None
    assert one["bias"] == 5.0
    assert agreement_stats([50.0, 40.0], [45.0, 41.0])["pearsonR"] is None
    # A constant sample has no correlation either.
    assert agreement_stats([50.0, 50.0, 50.0], [40.0, 45.0, 50.0])["pearsonR"] is None
    for predicted, truth in (([], []), ([1.0], [1.0, 2.0])):
        with pytest.raises(ValueError):
            agreement_stats(predicted, truth)


def test_an_ejection_fraction_needs_an_ed_volume():
    assert ejection_fraction(200, 80) == pytest.approx(60.0)
    assert ejection_fraction(0, 0) is None


# --- The preprocessed slices ----------------------------------------------------------------------------------


def write_slice(folder: Path, patient: int, frame: int, index: int, label: np.ndarray) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    with h5py.File(folder / f"patient{patient:03d}_frame{frame:02d}_slice_{index}.h5", "w") as handle:
        handle["image"] = (label * 50).astype(np.float32)
        handle["label"] = label


def disc(size: int, radius: int, value: int, centre=(32, 32)) -> np.ndarray:
    rows, columns = np.mgrid[0:size, 0:size]
    return np.where(np.hypot(rows - centre[0], columns - centre[1]) <= radius, value, 0).astype(np.uint8)


def write_patient(folder: Path, patient: int, ed_frame: int, es_frame: int, lv_ed: int, lv_es: int, rv_ed: int = 8, rv_es: int = 6) -> None:
    """Two volumes of three slices: ACDC labels, 3 = LV, 1 = RV."""
    for frame, lv, rv in ((ed_frame, lv_ed, rv_ed), (es_frame, lv_es, rv_es)):
        for index in range(3):
            label = disc(64, lv, 3)
            label[disc(64, rv, 1, centre=(32, 56)) == 1] = 1
            write_slice(folder, patient, frame, index, label)


def perfect(images: list[np.ndarray]) -> list[np.ndarray]:
    """The written image is the ACDC label x 50: its own ground truth, at 256 x 256."""
    return [cv2.resize(remap_acdc((image / 50).astype(np.uint8)), (256, 256), interpolation=cv2.INTER_NEAREST) for image in images]


def test_the_voxels_of_each_structure_are_counted_for_the_prediction_and_the_truth(tmp_path):
    write_patient(tmp_path, 1, 1, 12, lv_ed=20, lv_es=12)
    volumes = module.find_volumes(tmp_path, [1])

    per_volume = evaluate_volumes(volumes, perfect, 256)

    assert [(volume["patient"], volume["frame"], volume["slices"]) for volume in per_volume] == [(1, 1, 3), (1, 12, 3)]
    for volume in per_volume:
        assert volume["voxels"]["predicted"] == volume["voxels"]["truth"]
        assert volume["dice"]["LV"] == 1.0 and math.isnan(volume["dice"]["MYO"])
    assert per_volume[0]["voxels"]["truth"]["LV"] > per_volume[1]["voxels"]["truth"]["LV"] > 0


def test_ed_is_the_phase_whose_true_lv_is_larger_whatever_the_frame_numbers(tmp_path):
    # Here ES comes first in the numbering (frame 3 is the larger).
    write_patient(tmp_path, 1, 3, 1, lv_ed=22, lv_es=10)
    pairs = pair_patients(evaluate_volumes(module.find_volumes(tmp_path, [1]), perfect, 256))

    assert (pairs[0]["edFrame"], pairs[0]["esFrame"]) == (3, 1)
    lv = pairs[0]["lvef"]
    assert lv["predicted"] == pytest.approx(lv["truth"])
    assert 0 < lv["truth"] < 100
    assert pairs[0]["rvef"]["truth"] == pytest.approx(pairs[0]["rvef"]["predicted"])


def test_the_ef_of_a_wrong_prediction_differs_from_the_truth(tmp_path):
    write_patient(tmp_path, 1, 1, 12, lv_ed=20, lv_es=12)

    def lazy(images):
        # A model that sees the same LV in both phases: an EF of 0.
        return [cv2.resize(remap_acdc(disc(64, 16, 3)), (256, 256), interpolation=cv2.INTER_NEAREST) for _ in images]

    pairs = pair_patients(evaluate_volumes(module.find_volumes(tmp_path, [1]), lazy, 256))

    assert pairs[0]["lvef"]["predicted"] == pytest.approx(0.0)
    assert pairs[0]["lvef"]["truth"] > 50


def test_a_patient_without_two_phases_or_without_a_true_lv_stops_the_evaluation(tmp_path):
    write_patient(tmp_path, 1, 1, 12, 20, 12)
    write_slice(tmp_path, 1, 5, 0, disc(64, 10, 3))
    with pytest.raises(ValueError, match="3 volumes"):
        pair_patients(evaluate_volumes(module.find_volumes(tmp_path, [1]), perfect, 256))

    other = tmp_path / "other"
    write_patient(other, 2, 1, 12, 0, 0, rv_ed=5, rv_es=4)
    # lv 0: the "LV" discs are empty.
    for path in other.glob("*.h5"):
        with h5py.File(path, "r+") as handle:
            label = np.asarray(handle["label"])
            label[label == 3] = 0
            handle["label"][...] = label
            handle["image"][...] = (label * 50).astype(np.float32)
    with pytest.raises(ValueError, match="no true LV"):
        pair_patients(evaluate_volumes(module.find_volumes(other, [2]), perfect, 256))


def test_a_patient_whose_ef_cannot_be_computed_is_counted_apart():
    pairs = [
        {"patient": 1, "lvef": {"predicted": 50.0, "truth": 52.0}, "rvef": {"predicted": 45.0, "truth": 47.0}},
        {"patient": 2, "lvef": {"predicted": None, "truth": 60.0}, "rvef": {"predicted": 40.0, "truth": 42.0}},
        {"patient": 3, "lvef": {"predicted": 30.0, "truth": 33.0}, "rvef": {"predicted": 55.0, "truth": 50.0}},
    ]

    stats = ef_statistics(pairs)

    assert stats["lvef"]["n"] == 2 and stats["lvef"]["undefined"] == 1
    assert stats["lvef"]["bias"] == pytest.approx(-2.5)
    assert stats["rvef"]["n"] == 3 and stats["rvef"]["undefined"] == 0
    assert stats["lvef"]["unit"] == "percentage points"


# --- The original NIfTI --------------------------------------------------------------------------------------------


def write_nifti_patient(
    root: Path, patient: int, *, ed: int = 1, es: int = 12, spacing=(1.5, 1.5, 8.0), lv_ed=14, lv_es=8, height=170.0, weight=70.0, group="training"
) -> Path:
    folder = root / group / f"patient{patient:03d}"
    folder.mkdir(parents=True)
    (folder / "Info.cfg").write_text(f"ED: {ed}\nES: {es}\nGroup: NOR\nHeight: {height}\nNbFrame: 30\nWeight: {weight}\n", encoding="utf-8")
    affine = np.diag([*spacing, 1.0])
    for number, radius in ((ed, lv_ed), (es, lv_es)):
        # ACDC labels: 1 RV, 2 MYO, 3 LV; slices (X, Y, Z), 5 of them.
        truth = np.zeros((64, 64, 5), dtype=np.uint8)
        for z in range(5):
            slice_ = disc(64, radius, 3)
            slice_[disc(64, radius + 4, 3) > 0] = np.where(slice_[disc(64, radius + 4, 3) > 0] == 3, 3, 2)
            slice_[disc(64, 5, 1, centre=(32, 58)) == 1] = 1
            truth[:, :, z] = slice_.T
        # An image that is its own ground truth once rescaled to [0, 1]: label / 3.
        nibabel.save(nibabel.Nifti1Image((truth / 3.0).astype(np.float32), affine), str(folder / f"patient{patient:03d}_frame{number:02d}.nii.gz"))
        nibabel.save(nibabel.Nifti1Image(truth, affine), str(folder / f"patient{patient:03d}_frame{number:02d}_gt.nii.gz"))
    return folder


def perfect_segmenter(images: list[np.ndarray]) -> list[np.ndarray]:
    return [remap_acdc(np.round(image * 3).astype(np.uint8)) for image in images]


def test_the_volumes_in_ml_come_from_the_pixdim_and_the_step_between_slices(tmp_path):
    folder = write_nifti_patient(tmp_path, 1)

    result = evaluate_patient_nifti(folder, perfect_segmenter)

    assert (result["patient"], result["edFrame"], result["esFrame"], result["sliceStepMm"]) == (1, 1, 12, 8.0)
    # The model's mask is the truth: the same measures.
    assert result["predicted"]["lv"] == pytest.approx(result["truth"]["lv"])
    assert result["predicted"]["lvMassG"] == pytest.approx(result["truth"]["lvMassG"])
    # Counted by hand from the truth: LV disc areas x 2.25 mm² x 5 slices x 8 mm.
    truth_ed = disc(64, 14, 3)
    expected_edv = int((truth_ed == 3).sum()) * 2.25 * 5 * 8 / 1000
    assert result["truth"]["lv"]["edvMl"] == pytest.approx(expected_edv)
    assert 0 < result["truth"]["lv"]["efPercent"] < 100


def test_the_frame_is_rescaled_to_zero_one_over_its_volume():
    flat = np.full((4, 4, 2), 7.0, dtype=np.float32)
    ramp = np.arange(8, dtype=np.float32).reshape(2, 2, 2) * 10 + 30

    assert (minmax(flat) == 0).all()
    scaled = minmax(ramp)
    assert scaled.min() == 0 and scaled.max() == 1 and scaled.dtype == np.float32


def test_the_nifti_statistics_cover_the_volumes_the_mass_and_both_fractions(tmp_path):
    patients = [evaluate_patient_nifti(write_nifti_patient(tmp_path, number, lv_ed=14 + number, lv_es=8), perfect_segmenter) for number in (1, 2, 3)]

    stats = nifti_statistics(patients)

    assert set(stats) == {"lvEdvMl", "lvEsvMl", "lvMassG", "lvef", "rvef"}
    assert stats["lvEdvMl"]["unit"] == "ml" and stats["lvMassG"]["unit"] == "g" and stats["lvef"]["unit"] == "percentage points"
    assert stats["lvEdvMl"]["n"] == 3 and stats["lvEdvMl"]["mae"] == pytest.approx(0, abs=1e-9)


def test_the_patient_folders_are_found_in_training_and_testing(tmp_path):
    write_nifti_patient(tmp_path, 1, group="training")
    write_nifti_patient(tmp_path, 110, group="testing")
    (tmp_path / "training" / "patient002").mkdir()  # no Info.cfg: not a patient folder

    found = find_patient_folders(tmp_path, [1, 2, 110, 120])

    assert sorted(found) == [1, 110]
    assert found[110].parent.name == "testing"


# --- Figures -----------------------------------------------------------------------------------------------------------


def test_the_figures_are_two_pdfs_and_must_stay_outside_the_repository(tmp_path):
    pairs = [{"lvef": {"predicted": p, "truth": t}} for p, t in ((50.0, 52.0), (60.0, 58.0), (35.0, 38.0), (65.0, 63.0))]
    stats = ef_statistics([{**pair, "patient": index, "rvef": {"predicted": 1.0, "truth": 2.0}} for index, pair in enumerate(pairs)])

    paths = write_figures(pairs, stats, tmp_path / "figures")

    assert [path.name for path in paths] == ["lvef-bland-altman.pdf", "lvef-predicted-vs-truth.pdf"]
    assert all(path.read_bytes().startswith(b"%PDF") for path in paths)
    assert inside_repository(module.REPO_ROOT / "evaluation") and inside_repository(module.REPO_ROOT)
    assert not inside_repository(tmp_path)


# --- main --------------------------------------------------------------------------------------------------------------------


class FakeEntry:
    loaded = True
    weights_sha256 = "252fb672137d89835c6acc7f10d7c3c8873b8a3925eb1f2061fa51105e23901c"

    def __init__(self, test_patients=(1, 2), mean_dice=1.0):
        card = json.loads(json.dumps(CARD))
        card["training"]["test_patients"] = list(test_patients)
        card["test"]["n_volumes"] = 2 * len(test_patients)
        card["test"]["mean"] = mean_dice
        self.config = {"card": card, "input_size": 256}

    def status(self):
        return {"file": "cardio-seg-acdc-unet-effb4.pt", "weightsSha256": self.weights_sha256, "loaded": True}


@pytest.fixture
def dataset(tmp_path, monkeypatch):
    root = tmp_path / "ACDC_preprocessed"
    write_patient(root, 1, 1, 12, 20, 10)
    write_patient(root, 2, 1, 9, 22, 12)
    monkeypatch.setattr(module, "load_cardio_seg_model", lambda _: FakeEntry())
    monkeypatch.setattr(module, "predict_labels_batch", lambda images, entry: perfect(images))
    return root


def test_the_whole_evaluation_writes_a_named_report_and_the_latest_copy(dataset, tmp_path, capsys):
    out = tmp_path / "evaluation"

    code = main(["--acdc", str(dataset), "--output-dir", str(out)])

    assert code == 0
    written = sorted(out.glob("cardio-volume-*.json"))
    assert [path.name for path in written if path.name != LATEST_REPORT_NAME][0].endswith("-252fb672.json")
    report = json.loads((out / LATEST_REPORT_NAME).read_text(encoding="utf-8"))
    assert report["pipeline"] == "cardio-volume-mri" and report["file"].startswith("cardio-volume-")
    assert report["dataset"]["nPatients"] == 2 and report["dataset"]["nVolumes"] == 4
    assert report["metrics"]["lvef"]["bias"] == pytest.approx(0, abs=1e-9) and report["metrics"]["lvef"]["n"] == 2
    assert report["segmentation"]["comparison"]["ok"] is True
    assert report["metricsNifti"] is None
    output = capsys.readouterr().out
    assert "LVEF" in output and "RVEF" in output and "MAE" in output


def test_a_mean_dice_away_from_the_cards_is_exit_code_1(dataset, tmp_path, monkeypatch):
    monkeypatch.setattr(module, "load_cardio_seg_model", lambda _: FakeEntry(mean_dice=0.9))

    assert main(["--acdc", str(dataset), "--output-dir", str(tmp_path / "evaluation")]) == 1


def test_the_nifti_folder_adds_the_volumes_and_the_mass(dataset, tmp_path, monkeypatch):
    database = tmp_path / "database"
    write_nifti_patient(database, 1)
    write_nifti_patient(database, 2, group="testing")
    monkeypatch.setattr(module, "segment_batch", lambda images, entry: perfect_segmenter(images))
    out = tmp_path / "evaluation"

    code = main(["--acdc", str(dataset), "--acdc-nifti", str(database), "--output-dir", str(out), "--figures", str(tmp_path / "figures")])

    assert code == 0
    report = json.loads((out / LATEST_REPORT_NAME).read_text(encoding="utf-8"))
    assert set(report["metricsNifti"]) == {"lvEdvMl", "lvEsvMl", "lvMassG", "lvef", "rvef"}
    assert report["dataset"]["nifti"] == {"folder": "database", "nPatients": 2}
    assert len(report["perPatientNifti"]) == 2
    assert (tmp_path / "figures" / "lvef-bland-altman.pdf").is_file()


def test_it_stops_before_any_inference_when_something_is_missing(dataset, tmp_path, monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("inference started")

    monkeypatch.setattr(module, "evaluate_volumes", forbidden)
    out = str(tmp_path / "evaluation")

    # No ACDC folder; no NIfTI folder.
    assert main(["--acdc", str(tmp_path / "missing"), "--output-dir", out]) == 2
    assert main(["--acdc", str(dataset), "--acdc-nifti", str(tmp_path / "missing"), "--output-dir", out]) == 2
    # Figures in the repository.
    assert main(["--acdc", str(dataset), "--figures", str(module.REPO_ROOT / "figures"), "--output-dir", out]) == 2
    # Not the 44 volumes of the card.
    monkeypatch.setattr(module, "load_cardio_seg_model", lambda _: FakeEntry(test_patients=(1, 2, 3)))
    assert main(["--acdc", str(dataset), "--output-dir", out]) == 2
    # The NIfTI patients are not all there.
    monkeypatch.setattr(module, "load_cardio_seg_model", lambda _: FakeEntry())
    database = tmp_path / "database"
    write_nifti_patient(database, 1)
    assert main(["--acdc", str(dataset), "--acdc-nifti", str(database), "--output-dir", out]) == 2
    assert not Path(out).exists()


def test_a_model_that_did_not_load_is_exit_code_2(dataset, tmp_path, monkeypatch):
    class Unloaded:
        loaded = False
        error = "weights_missing"

    monkeypatch.setattr(module, "load_cardio_seg_model", lambda _: Unloaded())

    assert main(["--acdc", str(dataset), "--output-dir", str(tmp_path / "out")]) == 2
