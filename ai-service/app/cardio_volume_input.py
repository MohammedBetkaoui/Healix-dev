"""Reading a short-axis cine stack: a ZIP of single-frame DICOM files.

The images are grouped by position in space (their ImagePositionPatient
projected on the normal of the slice plane) and, within a position, ordered by
phase (TriggerTime when every image of the position has one, else
InstanceNumber). Nothing relies on the series: both usual organisations give
the same stack, one series per position with N phases, or a single series
holding everything.

Refusals (HTTP 422, code cardio_volume_*), each with what is needed to fix it:
- cardio_volume_unsupported_format: not a ZIP; cardio_volume_no_dicom: no DICOM file in it;
- cardio_volume_unsafe_archive: an absolute path or "..", more than 600 files,
  more than 300 MiB once unpacked;
- cardio_volume_not_mr, _multiframe, _not_grayscale, _undecodable: an image that is not
  a single-frame grey MR image (cardio_volume_missing_geometry: no position, no
  orientation or no pixel spacing);
- cardio_volume_mixed_orientation: a slice normal more than 5° from the first;
- cardio_volume_mixed_geometry: another pixel spacing or another image size;
- cardio_volume_unequal_phases: not the same number of phases at every position;
- cardio_volume_too_few_slices (under 6 positions), _too_few_phases (under 2),
  _too_many_phases (over 30).

An uneven step between slices (more than 20 % from the median) is a warning,
not a refusal. The positions come out sorted along the normal; which end is the
base is for the pipeline to say (it needs the segmentation).
"""

from __future__ import annotations

import io
import math
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath

import numpy as np

from .cardio_seg_input import (
    MAX_SIDE,
    MIN_SIDE,
    CardioSegInputError,
    is_dicom,
    slice_from_dataset,
)
from .label_maps import ImageDimensionsTooLarge, ImageTooSmall, check_sides
from .preprocess import InvalidImage

MAX_FILES = 600
MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024
MIN_SLICES = 6
MIN_PHASES = 2
MAX_PHASES = 30
MAX_NORMAL_ANGLE_DEG = 5.0
# A step between slices more than this fraction away from the median one is irregular.
GAP_TOLERANCE = 0.20
# Two images this close along the normal (mm) are at the same position.
POSITION_TOLERANCE_MM = 0.5
# Spacing of two pixel spacings (mm) told apart.
PIXEL_SPACING_TOLERANCE_MM = 1e-3
# A phase whose trigger time differs from the first position's by more than this
# fraction of the phase interval is out of step.
PHASE_TIMING_TOLERANCE = 0.5
# What a height, a weight and a heart rate must look like to be believed.
SIZE_RANGE_M = (0.3, 2.5)
WEIGHT_RANGE_KG = (1.0, 500.0)
HEART_RATE_RANGE_BPM = (20.0, 300.0)
ZIP_SIGNATURE = b"PK\x03\x04"


class CardioVolumeInputError(Exception):
    """A refused stack (HTTP 422): code cardio_volume_*."""

    def __init__(self, code: str, **details) -> None:
        super().__init__(code)
        self.code = code
        self.details = details


@dataclass(frozen=True)
class CineStack:
    # images[phase][position]: (H, W) float32, positions sorted along the normal.
    images: list[list[np.ndarray]]
    pixel_spacing_mm: tuple[float, float]
    # Position of each slice along the normal, mm, from the first one (0.0).
    positions_mm: list[float]
    # The step between slices used for volumes, mm: the mean of the gaps.
    slice_gap_mm: float
    # Median trigger time of each phase, ms; None when the images do not all have one.
    phase_times_ms: list[float] | None
    normal: tuple[float, float, float]
    # DICOM PatientSize (m), PatientWeight (kg), HeartRate (bpm; or from NominalInterval).
    patient_size_m: float | None
    patient_weight_kg: float | None
    heart_rate_bpm: float | None
    warnings: list[dict] = field(default_factory=list)

    @property
    def phases(self) -> int:
        return len(self.images)

    @property
    def slices(self) -> int:
        return len(self.positions_mm)


@dataclass
class _Image:
    pixels: np.ndarray
    position: np.ndarray
    normal: np.ndarray
    spacing: tuple[float, float]
    trigger_ms: float | None
    instance_number: int | None
    sop_uid: str | None
    order: int
    size: float | None = None
    weight: float | None = None
    heart_rate: float | None = None
    interval_ms: float | None = None


def _safe_name(name: str) -> str:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if normalized.startswith("/") or (len(normalized) > 1 and normalized[1] == ":") or ".." in path.parts:
        raise CardioVolumeInputError("cardio_volume_unsafe_archive", reason="unsafe_path")
    return normalized


def _members(data: bytes) -> list[tuple[str, bytes]]:
    """(name, bytes) of every file of the archive, with the limits checked on what
    is really read, not on the sizes the archive announces."""
    if data[:4] != ZIP_SIGNATURE:
        raise CardioVolumeInputError("cardio_volume_unsupported_format")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise CardioVolumeInputError("cardio_volume_unsupported_format") from error

    files: list[tuple[str, bytes]] = []
    with archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        if len(infos) > MAX_FILES:
            raise CardioVolumeInputError("cardio_volume_unsafe_archive", reason="too_many_files", max=MAX_FILES)
        names = [_safe_name(info.filename) for info in infos]
        if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
            raise CardioVolumeInputError("cardio_volume_unsafe_archive", reason="too_large", maxBytes=MAX_UNCOMPRESSED_BYTES)
        written = 0
        for info, name in zip(infos, names, strict=True):
            try:
                content = archive.read(info)
            except (zipfile.BadZipFile, OSError, NotImplementedError, RuntimeError) as error:
                raise CardioVolumeInputError("cardio_volume_unsupported_format") from error
            written += len(content)
            if written > MAX_UNCOMPRESSED_BYTES:
                raise CardioVolumeInputError(
                    "cardio_volume_unsafe_archive", reason="too_large", maxBytes=MAX_UNCOMPRESSED_BYTES
                )
            files.append((name, content))
    return files


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _in_range(value: float | None, bounds: tuple[float, float]) -> float | None:
    return value if value is not None and bounds[0] <= value <= bounds[1] else None


def _vector(dataset, name: str, length: int) -> np.ndarray | None:
    try:
        values = np.array([float(value) for value in getattr(dataset, name)], dtype=np.float64)
    except (AttributeError, TypeError, ValueError):
        return None
    return values if values.shape == (length,) and np.isfinite(values).all() else None


def _read_image(name: str, content: bytes, order: int, max_pixels: int) -> _Image | None:
    """The image of one file, or None when it is not a DICOM file at all."""
    import pydicom
    from pydicom.errors import InvalidDicomError

    if not is_dicom(content):
        return None
    try:
        dataset = pydicom.dcmread(io.BytesIO(content))
    except (InvalidDicomError, AttributeError, TypeError, ValueError, EOFError, OSError):
        return None
    # A DICOMDIR, a report, a localizer without pixel data: not part of the stack.
    if "PixelData" not in dataset:
        return None
    if str(getattr(dataset, "Modality", "")).upper() != "MR":
        raise CardioVolumeInputError("cardio_volume_not_mr", file=name, modality=str(getattr(dataset, "Modality", "")))

    try:
        slice_ = slice_from_dataset(dataset, max_pixels)
        check_sides(*slice_.pixels.shape, MIN_SIDE, MAX_SIDE)
    except CardioSegInputError as error:
        raise CardioVolumeInputError(error.code.replace("cardio_seg_", "cardio_volume_", 1), file=name, **error.details) from error
    except InvalidImage as error:
        raise CardioVolumeInputError("cardio_volume_undecodable", file=name, reason=error.reason) from error
    except ImageTooSmall as error:
        raise CardioVolumeInputError("cardio_volume_undecodable", file=name, reason="image_too_small", minSide=error.min_side) from error
    except ImageDimensionsTooLarge as error:
        raise CardioVolumeInputError(
            "cardio_volume_undecodable", file=name, reason="image_dimensions_too_large", maxSide=error.max_side
        ) from error

    position = _vector(dataset, "ImagePositionPatient", 3)
    orientation = _vector(dataset, "ImageOrientationPatient", 6)
    if position is None or orientation is None or slice_.pixel_spacing_mm is None:
        missing = [
            label
            for label, value in (
                ("ImagePositionPatient", position),
                ("ImageOrientationPatient", orientation),
                ("PixelSpacing", slice_.pixel_spacing_mm),
            )
            if value is None
        ]
        raise CardioVolumeInputError("cardio_volume_missing_geometry", file=name, missing=missing)
    row, column = orientation[:3], orientation[3:]
    normal = np.cross(row, column)
    length = float(np.linalg.norm(normal))
    if abs(np.linalg.norm(row) - 1) > 0.05 or abs(np.linalg.norm(column) - 1) > 0.05 or abs(length - 1) > 0.05:
        raise CardioVolumeInputError("cardio_volume_missing_geometry", file=name, missing=["ImageOrientationPatient"])

    trigger = _number(getattr(dataset, "TriggerTime", None))
    instance = getattr(dataset, "InstanceNumber", None)
    try:
        instance_number = int(instance) if instance is not None else None
    except (TypeError, ValueError):
        instance_number = None
    return _Image(
        pixels=slice_.pixels,
        position=position,
        normal=normal / length,
        spacing=slice_.pixel_spacing_mm,
        trigger_ms=trigger,
        instance_number=instance_number,
        sop_uid=str(dataset.SOPInstanceUID) if "SOPInstanceUID" in dataset else None,
        order=order,
        size=_in_range(_number(getattr(dataset, "PatientSize", None)), SIZE_RANGE_M),
        weight=_in_range(_number(getattr(dataset, "PatientWeight", None)), WEIGHT_RANGE_KG),
        heart_rate=_in_range(_number(getattr(dataset, "HeartRate", None)), HEART_RATE_RANGE_BPM),
        interval_ms=_number(getattr(dataset, "NominalInterval", None)),
    )


def _positions(images: list[_Image], normal: np.ndarray) -> list[list[_Image]]:
    """The images grouped by position along `normal`, sorted along it."""
    keyed = sorted(((float(np.dot(image.position, normal)), image) for image in images), key=lambda pair: pair[0])
    groups: list[list[tuple[float, _Image]]] = []
    for coordinate, image in keyed:
        if groups and coordinate - groups[-1][0][0] <= POSITION_TOLERANCE_MM:
            groups[-1].append((coordinate, image))
        else:
            groups.append([(coordinate, image)])
    return [[image for _, image in group] for group in groups]


def _phase_order(group: list[_Image]) -> list[_Image]:
    """The images of one position in cardiac order: by TriggerTime when all have one."""
    if all(image.trigger_ms is not None for image in group):
        return sorted(group, key=lambda image: (image.trigger_ms, image.instance_number or 0, image.order))
    return sorted(
        group,
        key=lambda image: (image.instance_number if image.instance_number is not None else math.inf, image.order),
    )


def read_cine_stack(data: bytes, max_pixels: int) -> CineStack:
    images: list[_Image] = []
    for order, (name, content) in enumerate(_members(data)):
        image = _read_image(name, content, order, max_pixels)
        if image is not None:
            images.append(image)
    if not images:
        raise CardioVolumeInputError("cardio_volume_no_dicom")

    warnings: list[dict] = []
    # The same instance twice (a series packed twice): kept once.
    seen: set[str] = set()
    unique: list[_Image] = []
    for image in images:
        if image.sop_uid is not None and image.sop_uid in seen:
            continue
        if image.sop_uid is not None:
            seen.add(image.sop_uid)
        unique.append(image)
    if len(unique) != len(images):
        warnings.append({"code": "duplicate_images_ignored", "count": len(images) - len(unique)})
    images = unique

    reference = images[0]
    sizes = {image.pixels.shape for image in images}
    if len(sizes) != 1:
        raise CardioVolumeInputError("cardio_volume_mixed_geometry", reason="image_size", sizes=sorted(list(size) for size in sizes))
    if any(
        abs(image.spacing[0] - reference.spacing[0]) > PIXEL_SPACING_TOLERANCE_MM
        or abs(image.spacing[1] - reference.spacing[1]) > PIXEL_SPACING_TOLERANCE_MM
        for image in images
    ):
        raise CardioVolumeInputError("cardio_volume_mixed_geometry", reason="pixel_spacing")

    cosine = math.cos(math.radians(MAX_NORMAL_ANGLE_DEG))
    worst = min(float(np.clip(np.dot(image.normal, reference.normal), -1.0, 1.0)) for image in images)
    if worst < cosine:
        raise CardioVolumeInputError(
            "cardio_volume_mixed_orientation",
            maxAngleDeg=round(math.degrees(math.acos(worst)), 1),
            toleranceDeg=MAX_NORMAL_ANGLE_DEG,
        )

    normal = reference.normal
    groups = [_phase_order(group) for group in _positions(images, normal)]
    counts = [len(group) for group in groups]
    if len(set(counts)) != 1:
        raise CardioVolumeInputError("cardio_volume_unequal_phases", phasesPerPosition=counts)
    if len(groups) < MIN_SLICES:
        raise CardioVolumeInputError("cardio_volume_too_few_slices", min=MIN_SLICES, found=len(groups))
    phases = counts[0]
    if phases < MIN_PHASES:
        raise CardioVolumeInputError("cardio_volume_too_few_phases", min=MIN_PHASES, found=phases)
    if phases > MAX_PHASES:
        raise CardioVolumeInputError("cardio_volume_too_many_phases", max=MAX_PHASES, found=phases)

    coordinates = [float(np.mean([np.dot(image.position, normal) for image in group])) for group in groups]
    gaps = np.diff(coordinates)
    median_gap = float(np.median(gaps))
    if float(np.max(np.abs(gaps - median_gap))) > GAP_TOLERANCE * median_gap:
        warnings.append(
            {
                "code": "irregular_slice_spacing",
                "minMm": round(float(gaps.min()), 2),
                "maxMm": round(float(gaps.max()), 2),
                "medianMm": round(median_gap, 2),
            }
        )

    phase_times: list[float] | None = None
    if all(image.trigger_ms is not None for group in groups for image in group):
        times = np.array([[image.trigger_ms for image in group] for group in groups], dtype=np.float64)  # (positions, phases)
        phase_times = [float(np.median(times[:, phase])) for phase in range(phases)]
        interval = float(np.median(np.diff(phase_times))) if phases > 1 else 0.0
        if interval > 0 and float(np.max(np.abs(times - times[0]))) > PHASE_TIMING_TOLERANCE * interval:
            warnings.append({"code": "phase_timing_differs", "intervalMs": round(interval, 1)})

    def first(attribute: str) -> float | None:
        return next((value for image in images if (value := getattr(image, attribute)) is not None), None)

    heart_rate = first("heart_rate")
    if heart_rate is None and (interval := first("interval_ms")) is not None and interval > 0:
        heart_rate = _in_range(60000.0 / interval, HEART_RATE_RANGE_BPM)

    return CineStack(
        images=[[groups[position][phase].pixels for position in range(len(groups))] for phase in range(phases)],
        pixel_spacing_mm=reference.spacing,
        positions_mm=[round(coordinate - coordinates[0], 4) for coordinate in coordinates],
        slice_gap_mm=float(np.mean(gaps)),
        phase_times_ms=phase_times,
        normal=(float(normal[0]), float(normal[1]), float(normal[2])),
        patient_size_m=first("size"),
        patient_weight_kg=first("weight"),
        heart_rate_bpm=heart_rate,
        warnings=warnings,
    )
