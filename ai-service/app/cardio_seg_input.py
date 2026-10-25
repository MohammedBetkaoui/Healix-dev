"""Reading one short-axis cine MRI slice: a PNG/JPEG image or a single-frame
DICOM file.

The result is a 2D float32 array of intensities and, for a DICOM that gives
it, the pixel spacing in mm (row, column). Refusals:
- not a PNG, JPEG or DICOM, or undecodable: InvalidImage (invalid_image);
- a clearly coloured image (mean spread between R, G and B over 10): not an
  MRI slice (cardio_seg_not_grayscale);
- a multi-frame DICOM (cardio_seg_multiframe): a later version;
- a side under 64 or over 1024 pixels: image_too_small / image_dimensions_too_large.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import cv2
import numpy as np

from .label_maps import check_sides
from .preprocess import JPEG_SIGNATURE, PNG_SIGNATURE, InvalidImage

MIN_SIDE = 64
MAX_SIDE = 1024
# Mean, over the pixels, of max(R, G, B) - min(R, G, B) above which an image
# is in colour: a photograph or a screenshot, not an MRI slice.
MAX_CHANNEL_SPREAD = 10.0
# "DICM" after the 128-byte preamble of a DICOM file (Part 10).
DICOM_MAGIC_OFFSET = 128
DICOM_MAGIC = b"DICM"


class CardioSegInputError(Exception):
    """A refused slice (HTTP 422): code cardio_seg_*."""

    def __init__(self, code: str, **details) -> None:
        super().__init__(code)
        self.code = code
        self.details = details


@dataclass(frozen=True)
class MriSlice:
    pixels: np.ndarray  # (H, W) float32
    # (row, column) in mm; None for an image, or a DICOM without PixelSpacing.
    pixel_spacing_mm: tuple[float, float] | None
    source: str  # "image" or "dicom"


def is_dicom(data: bytes) -> bool:
    return data[DICOM_MAGIC_OFFSET : DICOM_MAGIC_OFFSET + len(DICOM_MAGIC)] == DICOM_MAGIC


def channel_spread(image: np.ndarray) -> float:
    """Mean of max(R, G, B) - min(R, G, B): 0 for a grey image."""
    channels = image[..., :3].astype(np.float32)
    return float((channels.max(axis=-1) - channels.min(axis=-1)).mean())


def _read_image(data: bytes, max_pixels: int) -> MriSlice:
    # IMREAD_UNCHANGED: a grey PNG is read as it is (8 or 16 bits); a colour
    # one is checked, then converted to grey.
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None or image.ndim not in (2, 3) or image.size == 0:
        raise InvalidImage("undecodable")
    if image.shape[0] * image.shape[1] > max_pixels:
        raise InvalidImage("too_many_pixels")

    if image.ndim == 3:
        if image.shape[2] == 1:
            image = image[..., 0]
        elif image.shape[2] in (3, 4):
            spread = channel_spread(image)
            if spread > MAX_CHANNEL_SPREAD:
                raise CardioSegInputError("cardio_seg_not_grayscale", channelSpread=round(spread, 1))
            code = cv2.COLOR_BGRA2GRAY if image.shape[2] == 4 else cv2.COLOR_BGR2GRAY
            image = cv2.cvtColor(image, code)
        else:
            raise InvalidImage("undecodable")
    return MriSlice(image.astype(np.float32), None, "image")


def _pixel_spacing(dataset) -> tuple[float, float] | None:
    try:
        row, column = (float(value) for value in dataset.PixelSpacing)
    except (AttributeError, TypeError, ValueError):
        return None
    return (row, column) if row > 0 and column > 0 and np.isfinite([row, column]).all() else None


def slice_from_dataset(dataset, max_pixels: int) -> MriSlice:
    """The slice of a parsed single-frame DICOM dataset (also what cardio_volume_input
    reads for each file of a cine stack): same refusals as a single slice."""
    try:
        frames = int(getattr(dataset, "NumberOfFrames", 1) or 1)
        samples = int(getattr(dataset, "SamplesPerPixel", 1) or 1)
        rows, columns = int(dataset.Rows), int(dataset.Columns)
    except (AttributeError, TypeError, ValueError) as error:
        raise InvalidImage("undecodable") from error

    if frames > 1:
        raise CardioSegInputError("cardio_seg_multiframe", frames=frames)
    if samples != 1:
        raise CardioSegInputError("cardio_seg_not_grayscale")
    if rows * columns > max_pixels:
        raise InvalidImage("too_many_pixels")

    try:
        pixels = np.asarray(dataset.pixel_array, dtype=np.float32)
    except Exception as error:  # noqa: BLE001 - any decoder failure: corrupt or unsupported pixel data
        raise InvalidImage("undecodable") from error
    if pixels.ndim != 2:
        raise InvalidImage("undecodable")

    # MONOCHROME1: the lowest value is white. Inverted over the stored range,
    # so that an image saved inverted reads back as it was.
    if str(getattr(dataset, "PhotometricInterpretation", "")).upper() == "MONOCHROME1":
        if int(getattr(dataset, "PixelRepresentation", 0)) == 0:
            pixels = np.float32(2 ** int(getattr(dataset, "BitsStored", 16)) - 1) - pixels
        else:
            pixels = pixels.max() + pixels.min() - pixels
    return MriSlice(pixels, _pixel_spacing(dataset), "dicom")


def _read_dicom(data: bytes, max_pixels: int) -> MriSlice:
    import pydicom
    from pydicom.errors import InvalidDicomError

    try:
        dataset = pydicom.dcmread(io.BytesIO(data))
    except (InvalidDicomError, AttributeError, TypeError, ValueError, EOFError, OSError) as error:
        raise InvalidImage("undecodable") from error
    return slice_from_dataset(dataset, max_pixels)


def read_slice(data: bytes, max_pixels: int) -> MriSlice:
    if data.startswith(PNG_SIGNATURE) or data.startswith(JPEG_SIGNATURE):
        slice_ = _read_image(data, max_pixels)
    elif is_dicom(data):
        slice_ = _read_dicom(data, max_pixels)
    else:
        raise InvalidImage("unsupported_format")
    height, width = slice_.pixels.shape
    check_sides(height, width, MIN_SIDE, MAX_SIDE)
    return slice_
