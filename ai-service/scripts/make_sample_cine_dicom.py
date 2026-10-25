"""A short-axis cine DICOM stack, as a .zip ready to import into HealixDZ, made
locally from one ACDC patient in NIfTI (patientXXX_4d.nii.gz + Info.cfg).

    .venv/Scripts/python -m scripts.make_sample_cine_dicom \\
        --acdc-patient <database>/training/patient001 --output cine-patient001.zip

All the phases, every position, as an MR image series would be exported by a
scanner: one series per position (or a single series with --organisation
single-series), ImagePositionPatient and ImageOrientationPatient, PixelSpacing,
SliceThickness, TriggerTime, PatientSize and PatientWeight (from Info.cfg), new
UIDs and a made-up patient name. The pixel data is ACDC's: the licence of the
database forbids sharing it, so the archive stays on your machine and must not
be committed. The geometry is the database's spacing laid on an axial grid (the
original orientation is not kept): enough for the volumetry, not a copy of an
acquisition.

Needs nibabel (development dependency). ACDC gives neither the heart rate nor
the RR interval: TriggerTime assumes a nominal RR of 1000 ms (--rr-interval-ms),
HeartRate is only written with --heart-rate.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.filewriter import dcmwrite
from pydicom.uid import ExplicitVRLittleEndian, MRImageStorage, generate_uid

AXIAL = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)


def write_dicom(
    pixels: np.ndarray,
    *,
    study_uid: str,
    series_uid: str,
    position: tuple[float, float, float],
    pixel_spacing: tuple[float, float],
    slice_thickness: float,
    instance_number: int,
    series_number: int = 1,
    trigger_time_ms: float | None = None,
    orientation: tuple[float, ...] = AXIAL,
    patient_name: str = "Test^Cine",
    patient_id: str = "SAMPLE",
    patient_size_m: float | None = None,
    patient_weight_kg: float | None = None,
    heart_rate_bpm: float | None = None,
    nominal_interval_ms: float | None = None,
    modality: str = "MR",
) -> bytes:
    """One single-frame 16-bit MR image; a tag left at None is not written."""
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = MRImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    dataset = Dataset()
    dataset.file_meta = meta
    dataset.SOPClassUID = MRImageStorage
    dataset.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    dataset.StudyInstanceUID = study_uid
    dataset.SeriesInstanceUID = series_uid
    dataset.Modality = modality
    dataset.PatientName = patient_name
    dataset.PatientID = patient_id
    dataset.SeriesNumber = series_number
    dataset.InstanceNumber = instance_number
    dataset.SeriesDescription = "cine short axis"
    dataset.Rows, dataset.Columns = pixels.shape
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.PixelSpacing = list(pixel_spacing)
    dataset.SliceThickness = slice_thickness
    dataset.ImagePositionPatient = list(position)
    dataset.ImageOrientationPatient = list(orientation)
    if trigger_time_ms is not None:
        dataset.TriggerTime = trigger_time_ms
    if patient_size_m is not None:
        dataset.PatientSize = patient_size_m
    if patient_weight_kg is not None:
        dataset.PatientWeight = patient_weight_kg
    if heart_rate_bpm is not None:
        dataset.HeartRate = int(round(heart_rate_bpm))
    if nominal_interval_ms is not None:
        dataset.NominalInterval = int(round(nominal_interval_ms))
    dataset.PixelData = pixels.astype("<u2").tobytes()
    buffer = io.BytesIO()
    dcmwrite(buffer, dataset, enforce_file_format=True)
    return buffer.getvalue()


def parse_info_cfg(text: str) -> dict[str, str]:
    """ACDC's Info.cfg: "Key: value" lines (ED, ES, Group, Height, NbFrame, Weight)."""
    values = {}
    for line in text.splitlines():
        match = re.match(r"\s*([A-Za-z]+)\s*:\s*(.+?)\s*$", line)
        if match:
            values[match.group(1)] = match.group(2)
    return values


def cine_files(
    volume: np.ndarray,
    spacing: tuple[float, float, float],
    *,
    height_cm: float | None,
    weight_kg: float | None,
    organisation: str = "per-position",
    rr_interval_ms: float = 1000.0,
    heart_rate_bpm: float | None = None,
    patient_name: str = "Test^Cine",
    patient_id: str = "SAMPLE",
) -> dict[str, bytes]:
    """{path in the archive: DICOM file} of a (X, Y, slices, phases) volume.

    spacing: (x, y, z) in mm, z being the step between slices. A slice is
    volume[:, :, z, t].T, the rows being y (the order of the preprocessed ACDC
    slices of the evaluation).
    """
    if organisation not in ("per-position", "single-series"):
        raise ValueError("organisation must be per-position or single-series.")
    columns, rows, slices, phases = volume.shape
    data = np.clip(volume - volume.min(), 0, 65535)
    study_uid = generate_uid()
    series_uids = [generate_uid() for _ in range(slices)] if organisation == "per-position" else [generate_uid()]
    files: dict[str, bytes] = {}
    for z in range(slices):
        for t in range(phases):
            if organisation == "per-position":
                series_index, instance = z, t + 1
            else:
                # Phase by phase, then position: an instance number that says nothing
                # on its own about the position.
                series_index, instance = 0, t * slices + z + 1
            name = f"SE{series_index + 1:02d}/IM{instance:04d}.dcm"
            files[name] = write_dicom(
                data[:, :, z, t].T,
                study_uid=study_uid,
                series_uid=series_uids[series_index],
                position=(0.0, 0.0, z * spacing[2]),
                pixel_spacing=(spacing[1], spacing[0]),
                slice_thickness=spacing[2],
                instance_number=instance,
                series_number=series_index + 1,
                trigger_time_ms=t * rr_interval_ms / phases,
                patient_name=patient_name,
                patient_id=patient_id,
                patient_size_m=height_cm / 100.0 if height_cm else None,
                patient_weight_kg=weight_kg,
                heart_rate_bpm=heart_rate_bpm,
                nominal_interval_ms=60000.0 / heart_rate_bpm if heart_rate_bpm else None,
            )
    return files


def zip_bytes(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def read_acdc_patient(folder: Path) -> tuple[np.ndarray, tuple[float, float, float], dict[str, str]]:
    """(volume (X, Y, Z, T), spacing, Info.cfg) of a patientXXX folder of ACDC."""
    import nibabel

    four_d = sorted(folder.glob("patient*_4d.nii*"))
    if len(four_d) != 1:
        raise FileNotFoundError(f"one patientXXX_4d.nii.gz expected in {folder}, found {len(four_d)}.")
    image = nibabel.load(str(four_d[0]))
    volume = np.asarray(image.dataobj, dtype=np.float32)
    if volume.ndim != 4:
        raise ValueError(f"{four_d[0].name} is not a 4D volume.")
    zooms = image.header.get_zooms()
    info_path = folder / "Info.cfg"
    info = parse_info_cfg(info_path.read_text(encoding="utf-8")) if info_path.is_file() else {}
    return volume, (float(zooms[0]), float(zooms[1]), float(zooms[2])), info


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--acdc-patient", type=Path, required=True, help="a patientXXX folder of ACDC (the 4D NIfTI and Info.cfg)")
    parser.add_argument("--output", type=Path, required=True, help="the .zip to write")
    parser.add_argument("--organisation", choices=("per-position", "single-series"), default="per-position")
    parser.add_argument("--rr-interval-ms", type=float, default=1000.0)
    parser.add_argument("--heart-rate", type=float, default=None, help="written as HeartRate and NominalInterval; none by default")
    args = parser.parse_args(argv)

    if not args.acdc_patient.is_dir():
        print(f"Folder not found: {args.acdc_patient}.", file=sys.stderr)
        return 2
    try:
        volume, spacing, info = read_acdc_patient(args.acdc_patient)
    except (FileNotFoundError, ValueError) as error:
        print(error, file=sys.stderr)
        return 2

    def number(key: str) -> float | None:
        try:
            return float(info[key])
        except (KeyError, ValueError):
            return None

    files = cine_files(
        volume,
        spacing,
        height_cm=number("Height"),
        weight_kg=number("Weight"),
        organisation=args.organisation,
        rr_interval_ms=args.rr_interval_ms,
        heart_rate_bpm=args.heart_rate,
        patient_id=f"SAMPLE-{args.acdc_patient.name}",
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(zip_bytes(files))
    print(f"{len(files)} images ({volume.shape[3]} phases x {volume.shape[2]} positions) in {args.output}.")
    print("Made from ACDC: for your machine only, never to be committed (the licence forbids sharing the data).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
