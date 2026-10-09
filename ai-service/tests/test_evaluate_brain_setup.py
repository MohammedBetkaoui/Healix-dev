"""scripts/evaluate_brain.py setup: paths, dataset detection, --check (no weights needed)."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from scripts import evaluate_brain
from scripts.evaluate_brain import (
    BriscSplitError,
    SetupError,
    check_brisc_files,
    locate_brisc,
    main,
    missing_brisc_files,
    normalize_path,
    prepare_nickparvar,
    resolve_nickparvar,
)

from .conftest import fake_registry

CLASS_FOLDERS = ("glioma", "meningioma", "notumor", "pituitary")


def write_jpeg(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    assert cv2.imwrite(str(path), np.full((16, 16, 3), 90, np.uint8))


def make_nickparvar(folder: Path, classes=CLASS_FOLDERS, per_class: int = 2) -> Path:
    for name in classes:
        (folder / name).mkdir(parents=True, exist_ok=True)
        for index in range(per_class):
            write_jpeg(folder / name / f"{name}_{index}.jpg")
    return folder


def write_manifest(root: Path, rows: list[tuple[str, str, str, bool]]) -> None:
    root.mkdir(parents=True, exist_ok=True)
    lines = ["relative_path,tumor_label,task,is_mask"]
    lines += [f"{path},{label},{task},{is_mask}" for path, label, task, is_mask in rows]
    (root / "manifest.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def no_inference(monkeypatch):
    """Any inference fails the test."""

    def refuse(*args, **kwargs):
        raise AssertionError("inference was run")

    for name in ("analyze_brain", "_segment", "evaluate_classification", "evaluate_segmentation"):
        monkeypatch.setattr(evaluate_brain, name, refuse)


# --- Path normalization -------------------------------------------------------


@pytest.mark.parametrize(
    "typed",
    [
        '"{path}"',  # quoted, as pasted with "Copy as path"
        "'{path}'",
        "{path}\\",
        "{path}/",
        '"{path}\\"',
        '{path}"',  # what PowerShell passes for "C:\\data\\"
        "  {path}  ",
    ],
)
def test_paths_lose_quotes_and_trailing_separators(tmp_path: Path, typed: str):
    assert normalize_path(typed.format(path=tmp_path)) == tmp_path.resolve()


def test_paths_are_expanded_and_resolved(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    assert normalize_path("~/datasets") == (Path.home() / "datasets").resolve()
    assert normalize_path("data\\..\\Testing") == (tmp_path / "Testing").resolve()


def test_a_drive_root_keeps_its_separator(tmp_path: Path):
    root = Path(tmp_path.anchor)  # C:\ on Windows, / elsewhere

    assert normalize_path(str(root)) == root


# --- Nickparvar ---------------------------------------------------------------


@pytest.mark.parametrize("name", ["Testing", "testing"])
def test_the_testing_subfolder_is_used(tmp_path: Path, name: str):
    make_nickparvar(tmp_path / name)
    make_nickparvar(tmp_path / "Training")

    folder, note = resolve_nickparvar(tmp_path)

    assert folder == tmp_path / name
    assert note == f"Utilisation de {tmp_path / name}"


def test_the_testing_folder_itself_is_accepted(tmp_path: Path):
    testing = make_nickparvar(tmp_path / "Testing")

    assert resolve_nickparvar(testing) == (testing, None)


def test_a_missing_folder_says_where_to_copy_the_path_from(tmp_path: Path):
    missing = tmp_path / "Testting"

    with pytest.raises(SetupError) as error:
        resolve_nickparvar(missing)

    assert str(error.value) == (
        f"Dossier introuvable : {missing}. Copiez le chemin depuis la barre d'adresse de l'Explorateur."
    )


def test_a_folder_without_class_subfolders_lists_found_and_expected(tmp_path: Path):
    (tmp_path / "images").mkdir()
    (tmp_path / "docs").mkdir()

    with pytest.raises(SetupError) as error:
        resolve_nickparvar(tmp_path)

    message = str(error.value)
    assert "Trouvé : docs, images" in message
    assert "Attendu : glioma, meningioma, notumor, pituitary" in message
    assert "no_tumor ou normal" in message


def test_images_are_counted_per_class_with_the_notumor_aliases(tmp_path: Path):
    make_nickparvar(tmp_path, classes=("glioma", "meningioma", "pituitary"), per_class=2)
    make_nickparvar(tmp_path, classes=("no_tumor",), per_class=1)
    make_nickparvar(tmp_path, classes=("normal",), per_class=1)

    folder, counts, note = prepare_nickparvar(tmp_path)

    assert (folder, note) == (tmp_path, None)
    assert counts == {"glioma": 2, "meningioma": 2, "notumor": 2, "pituitary": 2}


def test_a_class_without_image_stops_before_any_inference(tmp_path: Path):
    make_nickparvar(tmp_path, classes=("glioma", "meningioma", "notumor"))
    (tmp_path / "pituitary").mkdir()

    with pytest.raises(SetupError, match="Aucune image pour pituitary"):
        prepare_nickparvar(tmp_path)


# --- BRISC manifest location --------------------------------------------------


def test_the_manifest_is_found_two_levels_below(tmp_path: Path):
    nested = tmp_path / "brisc2025" / "brisc2025"
    write_manifest(nested, [])

    root, note = locate_brisc(tmp_path)

    assert root == nested
    assert note == f"Utilisation de {nested / 'manifest.csv'}"
    assert locate_brisc(nested) == (nested, None)


def test_the_manifest_is_not_searched_three_levels_below(tmp_path: Path):
    write_manifest(tmp_path / "a" / "b" / "c", [])

    with pytest.raises(SetupError, match="manifest.csv introuvable"):
        locate_brisc(tmp_path)


def test_two_manifests_stop_and_are_listed(tmp_path: Path):
    write_manifest(tmp_path / "brisc2025", [])
    write_manifest(tmp_path / "copy" / "brisc2025", [])

    with pytest.raises(SetupError) as error:
        locate_brisc(tmp_path)

    message = str(error.value)
    assert str(tmp_path / "brisc2025" / "manifest.csv") in message
    assert str(tmp_path / "copy" / "brisc2025" / "manifest.csv") in message


# --- BRISC missing files ------------------------------------------------------


@pytest.fixture
def brisc_missing_files(tmp_path: Path) -> Path:
    root = tmp_path / "brisc2025" / "brisc2025"
    write_jpeg(root / "segmentation_task" / "train" / "images" / "me_ok.jpg")
    write_jpeg(root / "segmentation_task" / "train" / "masks" / "me_ok.png")
    write_manifest(root, [
        (r"segmentation_task\train\images\me_ok.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\masks\me_ok.png", "meningioma", "segmentation", True),
        (r"segmentation_task\train\images\me_1.jpg", "meningioma", "segmentation", False),
        (r"segmentation_task\train\masks\me_1.png", "meningioma", "segmentation", True),
        (r"segmentation_task\test\images\pi_1.jpg", "pituitary", "segmentation", False),
        (r"segmentation_task\test\masks\pi_1.png", "pituitary", "segmentation", True),
        # Not counted: another class, another task.
        (r"segmentation_task\train\images\gl_1.jpg", "glioma", "segmentation", False),
        (r"classification_task\train\meningioma\me_cls.jpg", "meningioma", "classification", False),
    ])
    return root


def test_missing_files_are_counted_per_manifest_row(brisc_missing_files: Path):
    missing = missing_brisc_files(brisc_missing_files)

    assert [path.relative_to(brisc_missing_files).as_posix() for path in missing] == [
        "segmentation_task/train/images/me_1.jpg",
        "segmentation_task/train/masks/me_1.png",
        "segmentation_task/test/images/pi_1.jpg",
        "segmentation_task/test/masks/pi_1.png",
    ]


def test_missing_files_stop_the_segmentation_with_three_examples(brisc_missing_files: Path):
    with pytest.raises(BriscSplitError) as error:
        check_brisc_files(brisc_missing_files)

    message = str(error.value)
    assert message.startswith("4 fichier(s) du manifeste")
    assert str(brisc_missing_files / "segmentation_task" / "test" / "images" / "pi_1.jpg") in message
    assert "pi_1.png" not in message  # three examples only
    assert message.endswith("Copiez le dossier segmentation_task à côté de manifest.csv.")


def test_a_complete_manifest_passes(tmp_path: Path):
    write_jpeg(tmp_path / "segmentation_task" / "train" / "images" / "me_ok.jpg")
    write_manifest(tmp_path, [(r"segmentation_task\train\images\me_ok.jpg", "meningioma", "segmentation", False)])

    check_brisc_files(tmp_path)


# --- --check and the run ------------------------------------------------------


def test_check_reports_ready_without_any_inference(tmp_path: Path, monkeypatch, capsys, no_inference):
    make_nickparvar(tmp_path / "data" / "Testing")
    monkeypatch.setattr(evaluate_brain, "load_registry", lambda models_dir: fake_registry("glioma"))
    output = tmp_path / "evaluation"

    code = main(["--check", "--nickparvar-test", f'{tmp_path / "data"}"', "--output-dir", str(output)])

    printed = capsys.readouterr().out
    assert code == 0
    assert f"Utilisation de {tmp_path / 'data' / 'Testing'}" in printed
    assert "glioma 2, meningioma 2, notumor 2, pituitary 2 — 8 images" in printed
    assert "— sha-brain-ef — chargé" in printed  # the weights hash, first 12 characters
    assert "Prêt : oui" in printed
    assert not output.exists()  # no report


def test_check_is_not_ready_without_the_weights(tmp_path: Path, monkeypatch, capsys, no_inference):
    make_nickparvar(tmp_path / "Testing")
    monkeypatch.setattr(evaluate_brain, "load_registry", lambda models_dir: fake_registry(None, segmenters_loaded=False))

    code = main(["--check", "--nickparvar-test", str(tmp_path), "--models-dir", str(tmp_path)])

    printed = capsys.readouterr().out
    assert code == 1
    assert "NON CHARGÉ (weights_missing)" in printed
    assert "fold_5_best.pth non chargé" in printed
    assert "Prêt : non" in printed


def test_check_reports_missing_brisc_files(tmp_path: Path, brisc_missing_files: Path, monkeypatch, capsys, no_inference):
    monkeypatch.setattr(evaluate_brain, "load_registry", lambda models_dir: fake_registry("glioma"))

    code = main(["--check", "--brisc-root", str(brisc_missing_files.parent)])

    printed = capsys.readouterr().out
    assert code == 1
    assert f"Utilisation de {brisc_missing_files / 'manifest.csv'}" in printed
    assert "Copiez le dossier segmentation_task à côté de manifest.csv." in printed


def test_a_path_problem_stops_before_loading_the_models(tmp_path: Path, monkeypatch, capsys, no_inference):
    def refuse(models_dir):
        raise AssertionError("models loaded")

    monkeypatch.setattr(evaluate_brain, "load_registry", refuse)

    assert main(["--nickparvar-test", str(tmp_path / "nowhere")]) == 1
    assert "Dossier introuvable" in capsys.readouterr().err


def test_the_classification_still_runs_when_the_segmentation_stops(tmp_path: Path, brisc_missing_files: Path, monkeypatch):
    make_nickparvar(tmp_path / "Testing")
    monkeypatch.setattr(evaluate_brain, "load_registry", lambda models_dir: fake_registry("glioma"))
    output = tmp_path / "evaluation"

    code = main([
        "--nickparvar-test", str(tmp_path / "Testing"),
        "--brisc-root", str(brisc_missing_files),
        "--output-dir", str(output),
    ])

    report = json.loads(next(output.glob("brain-*.json")).read_text(encoding="utf-8"))
    assert code == 2
    assert report["classification"]["status"] == "ok"
    assert report["classification"]["n"] == 8
    assert report["segmentation"]["status"] == "stopped"
    assert "Copiez le dossier segmentation_task" in report["segmentation"]["reason"]
