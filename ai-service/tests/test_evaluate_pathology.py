from __future__ import annotations

import datetime
import json
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import pytest

from app.models import LoadedModel, ModelRegistry
from app.pathology_models import BREAST_CLASSIFIER_ID, NUCLEI_SEGMENTER_ID, PATHOLOGY_SPECS
from scripts import evaluate_pathology as evaluation
from scripts.evaluate_pathology import (
    BREAKHIS_TEST_PATIENTS,
    BreakhisSplitError,
    binary_metrics,
    build_breakhis_index,
    confusion_counts,
    dice_iou,
    label_from_path,
    mosaic,
    notebook_test_patients,
    pannuke_reference,
    parse_breakhis_name,
    patient_bootstrap,
    plan_breakhis,
    write_report,
)

from .test_pathology import LABEL_STEP, RedEncodesClass, TopLeftRed

# The 81 BreakHis patients (patient, B/M), as the notebook's index lists them.
# The split must give the notebook's 13 test patients from this table.
BREAKHIS_PATIENTS = """
14-10147 M 14-10926 M 14-11031 M 14-11520 M 14-11951 M 14-12204 M 14-12312 M 14-12465 M 14-12773 M
14-13200 B 14-13412 M 14-13413 M 14-13418DE M 14-13993 M 14-14015 M 14-14134 B 14-14134E B 14-14926 M
14-14946 M 14-15275 B 14-15570 M 14-15570C M 14-15572 M 14-15687B M 14-15696 M 14-15704 M 14-15792 M
14-16184 B 14-16184CD B 14-16188 M 14-16196 M 14-16336 M 14-16448 M 14-16456 M 14-16601 M 14-16716 M
14-16875 M 14-17614 M 14-17901 M 14-17915 M 14-18650 M 14-18842 M 14-18842D M 14-19440 M 14-19854C B
14-19979 M 14-19979C M 14-20629 M 14-20636 M 14-21978AB B 14-21998AB B 14-21998CD B 14-21998EF B 14-22549AB B
14-22549CD B 14-22549G B 14-22704 B 14-23060AB B 14-23060CD B 14-23222AB B 14-25197 B 14-2523 M 14-2773 M
14-29315EF B 14-2980 M 14-2985 M 14-29960AB B 14-29960CD B 14-3411F B 14-3909 M 14-4364 M 14-4372 M
14-5287 M 14-5694 M 14-5695 M 14-6241 M 14-8168 M 14-9133 B 14-9146 M 14-9461 M 15-190EF M
""".split()
PATIENTS = list(zip(BREAKHIS_PATIENTS[::2], BREAKHIS_PATIENTS[1::2]))
LABELS = {"B": "benign", "M": "malignant"}


def patient_frame(patients=PATIENTS) -> pd.DataFrame:
    return pd.DataFrame({"patient": [patient for patient, _ in patients], "label": [LABELS[code] for _, code in patients]})


# --- BreakHis index and split -------------------------------------------------


def test_parses_patient_and_magnification_from_the_file_name():
    assert parse_breakhis_name("SOB_B_A-14-22549AB-40-001.png") == {
        "code": "B", "subtype": "A", "patient": "14-22549AB", "magnification": 40,
    }
    assert parse_breakhis_name("SOB_M_DC-14-2773-400-012.PNG")["patient"] == "14-2773"
    for name in ("SOB_B_A-14-22549AB-50-001.png", "SOB_B_A-14-22549AB-40-001.jpg", "Thumbs.db", "SOB_X_A-14-1-40-001.png"):
        assert parse_breakhis_name(name) is None


def test_the_label_comes_from_the_path_and_must_agree_with_the_name(tmp_path):
    benign = tmp_path / "breast" / "benign" / "SOB" / "SOB_B_A-14-22549AB-40-001.png"
    wrong = tmp_path / "breast" / "malignant" / "SOB" / "SOB_B_A-14-22549AB-40-002.png"
    ignored = tmp_path / "breast" / "benign" / "notes.png"
    assert label_from_path(benign) == "benign"
    assert label_from_path(tmp_path / "x.png") is None

    index, ignored_names, disagreeing = build_breakhis_index([benign, wrong, ignored])
    assert index["patient"].tolist() == ["14-22549AB"]
    assert ignored_names == ["notes.png"]
    assert disagreeing == [str(wrong)]


def test_the_patient_split_gives_the_notebooks_13_test_patients():
    assert notebook_test_patients(patient_frame()) == sorted(BREAKHIS_TEST_PATIENTS)


def test_another_patient_table_stops_breakhis():
    # One patient missing: the stratified split moves, training patients reach the test.
    index = patient_frame(PATIENTS[1:]).assign(path=lambda frame: frame["patient"], magnification=40)
    with pytest.raises(BreakhisSplitError, match="Découpage du notebook non reproduit"):
        plan_breakhis(index)


def test_the_right_patients_with_other_image_counts_stop_breakhis():
    # One image per patient: the 13 patients are found, but not 1,346 images.
    index = patient_frame().assign(path=lambda frame: frame["patient"], magnification=40)
    with pytest.raises(BreakhisSplitError, match="13 images de test"):
        plan_breakhis(index)


def test_a_patient_with_two_classes_stops_breakhis():
    index = pd.DataFrame({"patient": ["14-1", "14-1"], "label": ["benign", "malignant"], "path": ["a", "b"], "magnification": [40, 40]})
    with pytest.raises(BreakhisSplitError, match="deux classes"):
        plan_breakhis(index)


# --- Statistics -------------------------------------------------------------


def test_binary_metrics_at_the_threshold():
    y_true = [0, 0, 0, 1, 1, 1, 1]
    scores = [0.05, 0.13, 0.5, 0.2, 0.9, 0.12, 0.6]  # 0.13 counts as malignant
    metrics = binary_metrics(y_true, scores, 0.13)
    assert metrics["confusionMatrix"] == [[1, 2], [1, 3]]
    assert metrics["accuracy"] == pytest.approx(4 / 7)
    assert metrics["sensitivity"] == pytest.approx(3 / 4)
    assert metrics["specificity"] == pytest.approx(1 / 3)
    assert metrics["precision"] == pytest.approx(3 / 5)
    assert metrics["f1"] == pytest.approx(2 * 3 / (2 * 3 + 2 + 1))
    assert 0 <= metrics["aucRoc"] <= 1 and 0 <= metrics["aucPr"] <= 1


def test_metrics_undefined_without_both_classes():
    metrics = binary_metrics([1, 1], [0.9, 0.05], 0.13)
    assert metrics["specificity"] is None
    assert metrics["aucRoc"] is None and metrics["aucPr"] is None
    assert metrics["sensitivity"] == 0.5


def test_the_bootstrap_draws_whole_patients(monkeypatch):
    # Patient a: 2 malignant images, both missed; b: 2 malignant images, both found;
    # c: 2 benign images, both right. Drawing images could give 1/6 steps; drawing
    # patients only gives multiples of 1/3 (each patient weighs 2 images of 6).
    patients = ["a", "a", "b", "b", "c", "c"]
    y_true = [1, 1, 1, 1, 0, 0]
    scores = [0.01, 0.02, 0.9, 0.8, 0.01, 0.02]
    sampled = []

    def recording(y, s, threshold):
        metrics = binary_metrics(y, s, threshold)
        sampled.append((len(y), metrics["accuracy"]))
        return metrics

    monkeypatch.setattr(evaluation, "binary_metrics", recording)
    result = patient_bootstrap(patients, y_true, scores, 0.13, draws=200, seed=1)
    assert {size for size, _ in sampled} == {6}
    assert {round(accuracy * 3, 9) for _, accuracy in sampled} <= {0.0, 1.0, 2.0, 3.0}
    assert result["accuracy"]["draws"] == 200
    # No benign patient in some draws: specificity undefined there, left out.
    assert result["specificity"]["draws"] < 200


def test_patient_bootstrap_is_reproducible():
    args = (["a", "a", "b", "c"], [1, 1, 0, 1], [0.9, 0.1, 0.05, 0.6], 0.13)
    assert patient_bootstrap(*args, draws=100) == patient_bootstrap(*args, draws=100)


# --- PanNuke ------------------------------------------------------------------


def test_reference_mask_from_the_pannuke_channels():
    mask = np.zeros((2, 3, 6))
    mask[0, 0, 0] = 7  # neoplastic instance
    mask[0, 1, 4] = 3  # epithelial
    mask[0, 2, 1] = 1  # inflammatory and connective: overlap
    mask[0, 2, 2] = 2
    mask[1, :, 5] = 1  # the background channel is not read
    assert pannuke_reference(mask).tolist() == [[1, 5, 255], [0, 0, 0]]


def test_dice_and_iou_pool_pixel_counts_and_leave_ignored_pixels_out():
    truth_a = np.array([[1, 1, 0, 255]], dtype=np.uint8)
    pred_a = np.array([[1, 0, 0, 1]], dtype=np.uint8)
    truth_b = np.array([[1, 0, 0, 0]], dtype=np.uint8)
    pred_b = np.array([[0, 0, 0, 0]], dtype=np.uint8)
    pooled = dice_iou(confusion_counts(truth_a, pred_a) + confusion_counts(truth_b, pred_b))
    # neoplastic: 1 shared pixel, 3 true, 1 predicted (the 255 pixel is left out).
    assert pooled["neoplastic"]["dice"] == pytest.approx(2 * 1 / (3 + 1))
    assert pooled["neoplastic"]["iou"] == pytest.approx(1 / 3)
    # Not the mean of the per-image Dice (2/3 and 0).
    assert pooled["neoplastic"]["dice"] != pytest.approx(1 / 3)
    assert pooled["dead"]["dice"] is None


def test_mosaic_places_the_four_patches():
    tiles = [np.full((2, 2), value) for value in range(4)]
    assert mosaic(tiles).tolist() == [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3], [2, 2, 3, 3]]


# --- Reports --------------------------------------------------------------------


def stand_in_registry(classifier=None, segmenter=None) -> ModelRegistry:
    models = {}
    for spec, module in zip(PATHOLOGY_SPECS, (classifier, segmenter)):
        entry = LoadedModel(spec=spec, module=module, weights_sha256=("a" if spec.model_id == BREAST_CLASSIFIER_ID else "b") * 64,
                            config_file=spec.config_file)
        if spec.model_id == BREAST_CLASSIFIER_ID:
            entry.config = {"threshold": 0.13}
        models[spec.model_id] = entry
    return ModelRegistry(models=models)


def test_reports_are_never_overwritten_and_latest_only_follows_complete_runs(tmp_path):
    registry = stand_in_registry()
    moment = datetime.datetime(2026, 10, 11, 9, 30, 0)
    partial = {"breakhis": {"status": "ok"}, "pannuke": None}
    first, latest = write_report(dict(partial), tmp_path, registry, moment)
    second, _ = write_report(dict(partial), tmp_path, registry, moment)
    assert first.name == "pathology-2026-10-11-093000-aaaaaaaa-bbbbbbbb.json"
    assert second.name == "pathology-2026-10-11-093000-aaaaaaaa-bbbbbbbb-2.json"
    assert latest is False and not (tmp_path / "pathology-latest.json").exists()

    stopped = {"breakhis": {"status": "ok"}, "pannuke": {"status": "stopped", "reason": "x"}}
    assert write_report(stopped, tmp_path, registry, moment)[1] is False

    complete = {"breakhis": {"status": "ok"}, "pannuke": {"status": "ok", "tiling": {"mosaics": 3}}}
    path, latest = write_report(complete, tmp_path, registry, moment)
    assert latest is True
    assert json.loads((tmp_path / "pathology-latest.json").read_text(encoding="utf-8"))["file"] == path.name


# --- Whole runs on small stand-in datasets --------------------------------------

PATHOLOGY_TEST_PATIENTS = sorted(BREAKHIS_TEST_PATIENTS)
RED = {"benign": 20, "malignant": 200}  # TopLeftRed scores red / 255: 0.08 and 0.78


def write_breakhis_tree(root: Path, images_per_patient: int = 1) -> None:
    """BreaKHis_v1 laid out as the dataset, one small image per patient and magnification step."""
    for patient, code in PATIENTS:
        label = LABELS[code]
        folder = root / "BreaKHis_v1" / "histology_slides" / "breast" / label / "SOB" / "subtype" / f"SOB_{code}_A_{patient}" / "40X"
        folder.mkdir(parents=True)
        for number in range(1, images_per_patient + 1):
            image = np.full((60, 80, 3), 30, dtype=np.uint8)
            image[..., 2] = RED[label]  # BGR: red is the last channel
            cv2.imwrite(str(folder / f"SOB_{code}_A-{patient}-40-{number:03d}.png"), image)


def write_pannuke_fold(root: Path, count: int, tissue_names=("Breast", "Colon")) -> np.ndarray:
    """fold_3 in the Kaggle layout; images whose red channel carries the reference class."""
    rng = np.random.default_rng(0)
    folder = root / "fold_3" / "Fold 3"
    (folder / "images" / "fold3").mkdir(parents=True)
    (folder / "masks" / "fold3").mkdir(parents=True)
    masks = np.zeros((count, 256, 256, 6))
    images = np.zeros((count, 256, 256, 3))
    for index in range(count):
        channel = rng.integers(0, 5, size=(256, 256))
        nucleus = rng.random((256, 256)) < 0.3
        for c in range(5):
            masks[index, ..., c][nucleus & (channel == c)] = 1 + c
        masks[index, ..., 5][~nucleus] = 1
        labels = np.where(nucleus, channel + 1, 0)
        images[index, ..., 0] = labels * LABEL_STEP
        images[index, ..., 1] = 120
        images[index, ..., 2] = 60
    np.save(folder / "images" / "fold3" / "images.npy", images)
    np.save(folder / "masks" / "fold3" / "masks.npy", masks)
    np.save(folder / "images" / "fold3" / "types.npy", np.array([tissue_names[i % len(tissue_names)] for i in range(count)]))
    return masks


@pytest.fixture
def stand_in_models(monkeypatch):
    registry = stand_in_registry(TopLeftRed(), RedEncodesClass())
    monkeypatch.setattr(evaluation, "load_models", lambda models_dir: registry)
    return registry


def test_a_complete_run_on_stand_in_data(tmp_path, monkeypatch, stand_in_models, capsys):
    write_breakhis_tree(tmp_path / "breakhis")
    write_pannuke_fold(tmp_path / "pannuke", count=9)
    # Small datasets: the expected counts are those of the stand-ins.
    monkeypatch.setattr(evaluation, "BREAKHIS_TEST_IMAGES", {"total": 13, "benign": 4, "malignant": 9})
    monkeypatch.setattr(evaluation, "PANNUKE_TEST_IMAGES", 9)
    output = tmp_path / "out"

    code = evaluation.main([
        "--breakhis-root", str(tmp_path / "breakhis"), "--pannuke-root", str(tmp_path / "pannuke"),
        "--models-dir", str(tmp_path), "--output-dir", str(output),
    ])

    assert code == 0
    report = json.loads((output / "pathology-latest.json").read_text(encoding="utf-8"))
    breakhis = report["breakhis"]
    assert breakhis["status"] == "ok"
    assert breakhis["dataset"]["testPatients"] == PATHOLOGY_TEST_PATIENTS
    assert breakhis["accuracy"] == 1.0 and breakhis["confusionMatrix"] == [[4, 0], [0, 9]]
    assert breakhis["bootstrap"]["unit"] == "patient"
    assert set(breakhis["byMagnification"]) == {"40"}
    assert {row["patient"] for row in breakhis["byPatient"]} == set(PATHOLOGY_TEST_PATIENTS)

    pannuke = report["pannuke"]
    assert pannuke["status"] == "ok" and pannuke["dataset"]["images"] == 9
    for name in ("background", "neoplastic", "inflammatory", "connective", "dead", "epithelial"):
        assert pannuke["perClass"][name]["dice"] == 1.0
    assert set(pannuke["byTissue"]) == {"Breast", "Colon"}
    # 9 patches: 2 mosaics of 4, the last patch on its own.
    tiling = pannuke["tiling"]
    assert tiling["mosaics"] == 2 and tiling["tilesPerMosaic"] == [9]
    assert tiling["agreementWithPerPatch"]["pixelShare"] == 1.0
    assert "Fold 2" in pannuke["notebookReported"]["note"]
    assert "Rapport complet" in capsys.readouterr().out


def test_one_dataset_only_leaves_latest_unchanged(tmp_path, monkeypatch, stand_in_models):
    write_pannuke_fold(tmp_path / "pannuke", count=4)
    monkeypatch.setattr(evaluation, "PANNUKE_TEST_IMAGES", 4)
    output = tmp_path / "out"
    code = evaluation.main(["--pannuke-root", str(tmp_path / "pannuke"), "--models-dir", str(tmp_path), "--output-dir", str(output)])
    assert code == 0
    assert not (output / "pathology-latest.json").exists()
    assert len(list(output.glob("pathology-*.json"))) == 1


def test_a_split_that_differs_stops_breakhis_before_any_inference(tmp_path, stand_in_models, capsys):
    write_breakhis_tree(tmp_path / "breakhis")  # 13 test images, not 1,346
    output = tmp_path / "out"
    code = evaluation.main(["--breakhis-root", str(tmp_path / "breakhis"), "--models-dir", str(tmp_path), "--output-dir", str(output)])
    assert code == 2
    assert stand_in_models.get(BREAST_CLASSIFIER_ID).module.inputs == []
    report = json.loads(next(output.glob("pathology-*.json")).read_text(encoding="utf-8"))
    assert report["breakhis"]["status"] == "stopped"
    assert "ARRÊTÉE" in capsys.readouterr().out


def test_another_fold_size_stops_pannuke(tmp_path, stand_in_models):
    write_pannuke_fold(tmp_path / "pannuke", count=3)  # not 2,722 images
    output = tmp_path / "out"
    code = evaluation.main(["--pannuke-root", str(tmp_path / "pannuke"), "--models-dir", str(tmp_path), "--output-dir", str(output)])
    assert code == 2
    report = json.loads(next(output.glob("pathology-*.json")).read_text(encoding="utf-8"))
    assert report["pannuke"]["status"] == "stopped" and "2722" in report["pannuke"]["reason"]


def test_check_reports_without_inference(tmp_path, monkeypatch, stand_in_models, capsys):
    write_pannuke_fold(tmp_path / "pannuke", count=4)
    monkeypatch.setattr(evaluation, "PANNUKE_TEST_IMAGES", 4)
    assert evaluation.main(["--check", "--pannuke-root", str(tmp_path / "pannuke"), "--models-dir", str(tmp_path)]) == 0
    assert "Prêt : oui" in capsys.readouterr().out
    assert stand_in_models.get(NUCLEI_SEGMENTER_ID).module.batches == []

    assert evaluation.main(["--check", "--pannuke-root", str(tmp_path / "missing"), "--models-dir", str(tmp_path)]) == 1
    assert evaluation.main(["--check", "--breakhis-root", str(tmp_path), "--models-dir", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "Dossier introuvable" in out and "BreaKHis_v1 introuvable" in out


def test_breakhis_root_may_be_the_dataset_folder_itself(tmp_path):
    (tmp_path / "BreaKHis_v1").mkdir()
    assert evaluation.resolve_breakhis(tmp_path) == tmp_path / "BreaKHis_v1"
    assert evaluation.resolve_breakhis(tmp_path / "BreaKHis_v1") == tmp_path / "BreaKHis_v1"
