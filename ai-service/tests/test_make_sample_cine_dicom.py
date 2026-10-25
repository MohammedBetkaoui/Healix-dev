"""scripts/make_sample_cine_dicom.py: a made-up 4D NIfTI in ACDC's layout becomes a cine
DICOM stack that cardio_volume_input reads back as it was.

The volume is random numbers written to a temporary folder: no image of ACDC.
"""

from __future__ import annotations

import io
import zipfile

import nibabel
import numpy as np
import pytest

from app.cardio_volume_input import read_cine_stack
from scripts.make_sample_cine_dicom import cine_files, main, parse_info_cfg, write_dicom, zip_bytes

MAX_PIXELS = 50_000_000
X, Y, SLICES, PHASES = 72, 64, 7, 5
SPACING = (1.25, 1.5, 9.5)  # x, y, z of the pixdim


def make_patient(folder, *, info: str | None = None):
    folder.mkdir(parents=True)
    rng = np.random.default_rng(3)
    volume = rng.integers(100, 3000, (X, Y, SLICES, PHASES)).astype(np.float32)
    nibabel.save(nibabel.Nifti1Image(volume, np.diag([*SPACING, 1.0])), str(folder / "patient001_4d.nii.gz"))
    (folder / "Info.cfg").write_text(
        info if info is not None else "ED: 1\nES: 3\nGroup: NOR\nHeight: 172.0\nNbFrame: 5\nWeight: 68.5\n", encoding="utf-8"
    )
    return volume


def read_back(path):
    return read_cine_stack(path.read_bytes(), MAX_PIXELS)


def test_info_cfg_is_read_as_key_value_lines():
    values = parse_info_cfg("ED: 1\nES: 12\nGroup: DCM\nHeight: 184.0\nNbFrame: 30\nWeight: 95.0\n\nnot a pair\n")

    assert values == {"ED": "1", "ES": "12", "Group": "DCM", "Height": "184.0", "NbFrame": "30", "Weight": "95.0"}


def test_an_acdc_patient_becomes_a_stack_that_reads_back_as_it_was(tmp_path):
    volume = make_patient(tmp_path / "patient001")
    output = tmp_path / "cine.zip"

    assert main(["--acdc-patient", str(tmp_path / "patient001"), "--output", str(output)]) == 0

    stack = read_back(output)
    assert (stack.phases, stack.slices) == (PHASES, SLICES)
    # DICOM's PixelSpacing is (row, column): rows are y.
    assert stack.pixel_spacing_mm == (SPACING[1], SPACING[0])
    assert stack.images[0][0].shape == (Y, X)
    assert stack.slice_gap_mm == pytest.approx(SPACING[2])
    assert stack.positions_mm == pytest.approx([z * SPACING[2] for z in range(SLICES)])
    assert stack.phase_times_ms == pytest.approx([t * 1000.0 / PHASES for t in range(PHASES)])
    assert stack.warnings == []
    assert (stack.patient_size_m, stack.patient_weight_kg) == (pytest.approx(1.72), pytest.approx(68.5))
    assert stack.heart_rate_bpm is None
    # The pixels: slice (z, t) is volume[:, :, z, t] transposed, the minimum taken off.
    shifted = volume - volume.min()
    for phase, position in ((0, 0), (2, 4), (4, 6)):
        assert np.array_equal(stack.images[phase][position], shifted[:, :, position, phase].T)


def test_one_series_per_position_or_a_single_series_read_back_the_same(tmp_path):
    make_patient(tmp_path / "patient001")
    for organisation in ("per-position", "single-series"):
        assert main(["--acdc-patient", str(tmp_path / "patient001"), "--output", str(tmp_path / f"{organisation}.zip"), "--organisation", organisation]) == 0

    per_position, single = read_back(tmp_path / "per-position.zip"), read_back(tmp_path / "single-series.zip")

    for phase in range(PHASES):
        for position in range(SLICES):
            assert np.array_equal(per_position.images[phase][position], single.images[phase][position])
    assert per_position.phase_times_ms == single.phase_times_ms
    # The series: one per position, or one in all.
    with zipfile.ZipFile(tmp_path / "per-position.zip") as archive:
        assert {name.split("/")[0] for name in archive.namelist()} == {f"SE{index:02d}" for index in range(1, SLICES + 1)}
        assert len(archive.namelist()) == SLICES * PHASES
    with zipfile.ZipFile(tmp_path / "single-series.zip") as archive:
        assert {name.split("/")[0] for name in archive.namelist()} == {"SE01"}


def test_the_heart_rate_and_the_rr_interval_are_written_only_when_given(tmp_path):
    make_patient(tmp_path / "patient001")
    output = tmp_path / "cine.zip"

    assert main(["--acdc-patient", str(tmp_path / "patient001"), "--output", str(output), "--heart-rate", "75", "--rr-interval-ms", "800"]) == 0

    stack = read_back(output)
    assert stack.heart_rate_bpm == 75
    assert stack.phase_times_ms == pytest.approx([t * 800.0 / PHASES for t in range(PHASES)])


def test_the_patient_is_made_up_and_the_archive_holds_no_acdc_identifier(tmp_path):
    make_patient(tmp_path / "patient001")
    output = tmp_path / "cine.zip"
    main(["--acdc-patient", str(tmp_path / "patient001"), "--output", str(output)])

    import pydicom

    with zipfile.ZipFile(output) as archive:
        dataset = pydicom.dcmread(io.BytesIO(archive.read(archive.namelist()[0])))
    assert str(dataset.PatientName) == "Test^Cine" and dataset.PatientID == "SAMPLE-patient001"
    assert dataset.Modality == "MR" and dataset.StudyInstanceUID and dataset.SeriesInstanceUID
    assert dataset.ImagePositionPatient is not None and list(dataset.ImageOrientationPatient) == [1, 0, 0, 0, 1, 0]


def test_without_info_cfg_nothing_is_indexed(tmp_path):
    make_patient(tmp_path / "patient001")
    (tmp_path / "patient001" / "Info.cfg").unlink()
    output = tmp_path / "cine.zip"

    assert main(["--acdc-patient", str(tmp_path / "patient001"), "--output", str(output)]) == 0

    stack = read_back(output)
    assert (stack.patient_size_m, stack.patient_weight_kg) == (None, None)


def test_a_missing_folder_or_a_folder_without_the_4d_volume_is_exit_code_2(tmp_path, capsys):
    assert main(["--acdc-patient", str(tmp_path / "missing"), "--output", str(tmp_path / "x.zip")]) == 2
    (tmp_path / "empty").mkdir()
    assert main(["--acdc-patient", str(tmp_path / "empty"), "--output", str(tmp_path / "x.zip")]) == 2
    assert not (tmp_path / "x.zip").exists()
    assert "patientXXX_4d.nii.gz" in capsys.readouterr().err


def test_the_writer_refuses_an_unknown_organisation_and_writes_only_the_tags_it_is_given():
    with pytest.raises(ValueError):
        cine_files(np.zeros((4, 4, 2, 2), dtype=np.float32), (1, 1, 1), height_cm=None, weight_kg=None, organisation="by-phase")

    import pydicom

    content = write_dicom(
        np.zeros((8, 8), dtype=np.uint16), study_uid="1.2.3", series_uid="1.2.3.4", position=(0, 0, 0),
        pixel_spacing=(1, 1), slice_thickness=5, instance_number=1,
    )
    dataset = pydicom.dcmread(io.BytesIO(content))
    for tag in ("TriggerTime", "PatientSize", "PatientWeight", "HeartRate", "NominalInterval"):
        assert tag not in dataset
    assert zipfile.ZipFile(io.BytesIO(zip_bytes({"a.dcm": content}))).namelist() == ["a.dcm"]
