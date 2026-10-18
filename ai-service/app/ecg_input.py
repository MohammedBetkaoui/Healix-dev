"""Reading a 12-lead ECG signal: a CSV/TXT table or a WFDB record in a .zip.

The result is always a (12, T) float64 array in mV, in the lead order of the
model card, with its sampling rate. Every refusal is an EcgInputError with a
stable code, sent back as HTTP 422; nothing is ever padded nor guessed.

Formats: see read_ecg. A future one (DICOM waveform, for instance) is a new
reader in _READERS, returning a RawEcg; the checks after it stay the same.
"""

from __future__ import annotations

import csv
import io
import math
import re
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

import numpy as np

# Accepted sampling rates of a CSV (form field samplingRate) or a WFDB header.
MIN_SAMPLING_RATE = 100
MAX_SAMPLING_RATE = 1000
# The model only ever saw 10 s windows: never padded with zeros.
MIN_DURATION_S = 10.0
MAX_DURATION_S = 60.0
# Share of NaN or infinite values above which the signal is refused; below,
# they become 0, as in training (np.nan_to_num).
MAX_NON_FINITE_SHARE = 0.01
# A lead flatter than this (standard deviation, mV) would only be noise once
# z-scored.
MIN_LEAD_STD_MV = 0.01
# Peak-to-peak above this, the signal is most likely in µV.
MAX_PEAK_TO_PEAK_MV = 30.0

# WFDB archive: a .hea and its .dat (plus at most two more files).
MAX_ARCHIVE_ENTRIES = 4
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024

# Columns of time, ignored wherever they are.
TIME_COLUMNS = {"time", "t", "temps", "ms", "s"}
UNITS = {"mv": 1.0, "uv": 1e-3, "µv": 1e-3, "μv": 1e-3}


class EcgInputError(Exception):
    """A refused signal: code (ecg_*) and, sometimes, details for the user."""

    def __init__(self, code: str, **details) -> None:
        super().__init__(code)
        self.code = code
        self.details = details


@dataclass
class RawEcg:
    # Column name -> samples, as found in the file (before any check).
    columns: dict[str, np.ndarray]
    sampling_rate: float | None
    # From the file itself (a WFDB header), else None: the form's unit applies.
    unit_factor: float | None = None
    extra: dict = field(default_factory=dict)


@dataclass(frozen=True)
class EcgSignal:
    signal: np.ndarray  # (12, T), float64, mV
    sampling_rate: int
    duration_s: float


def lead_key(name: str) -> str:
    """Case-insensitive lead name: "AVR", "aVR" and "avr" are the same lead."""
    return re.sub(r"[^0-9a-z]", "", name.strip().strip('"').strip("'").casefold())


# --- Form fields ----------------------------------------------------------------


def parse_sampling_rate(value) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        number = float(str(value).strip().replace(",", "."))
    except ValueError as error:
        raise EcgInputError("ecg_sampling_rate_invalid") from error
    if not math.isfinite(number) or number != int(number):
        raise EcgInputError("ecg_sampling_rate_invalid")
    rate = int(number)
    if not MIN_SAMPLING_RATE <= rate <= MAX_SAMPLING_RATE:
        raise EcgInputError("ecg_sampling_rate_invalid", min=MIN_SAMPLING_RATE, max=MAX_SAMPLING_RATE)
    return rate


def parse_unit(value) -> float:
    if value is None or (isinstance(value, str) and not value.strip()):
        return 1.0
    factor = UNITS.get(str(value).strip().casefold())
    if factor is None:
        raise EcgInputError("ecg_unit_invalid", accepted=["mV", "uV"])
    return factor


# --- CSV / TXT --------------------------------------------------------------------


def _decode_text(data: bytes) -> str:
    if b"\x00" in data[:4096]:
        raise EcgInputError("ecg_unsupported_format")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise EcgInputError("ecg_unsupported_format")


def _read_table(data: bytes) -> RawEcg:
    text = _decode_text(data)
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise EcgInputError("ecg_unsupported_format")

    header = lines[0]
    delimiter = ";" if ";" in header else "\t" if "\t" in header else ","
    # "-0,145;0,021": a French Excel export, decimal comma.
    decimal_comma = delimiter != "," and any("," in line for line in lines[1:50])

    rows = list(csv.reader(lines, delimiter=delimiter))
    names = [cell.strip() for cell in rows[0]]
    if len(names) < 2:
        raise EcgInputError("ecg_unsupported_format")

    values = np.empty((len(rows) - 1, len(names)), dtype=np.float64)
    for row_index, row in enumerate(rows[1:]):
        if len(row) != len(names):
            raise EcgInputError("ecg_unsupported_format", line=row_index + 2)
        for column, cell in enumerate(row):
            cell = cell.strip()
            if decimal_comma:
                cell = cell.replace(",", ".")
            if cell == "" or cell.casefold() in {"nan", "na"}:
                values[row_index, column] = np.nan
                continue
            try:
                values[row_index, column] = float(cell)
            except ValueError as error:
                raise EcgInputError("ecg_unsupported_format", line=row_index + 2) from error

    columns: dict[str, np.ndarray] = {}
    for column, name in enumerate(names):
        key = lead_key(name)
        if key in TIME_COLUMNS or not key:
            continue
        if key in columns:
            raise EcgInputError("ecg_unsupported_format", duplicateLead=name)
        columns[key] = values[:, column]
    return RawEcg(columns=columns, sampling_rate=None)


# --- WFDB in a .zip -----------------------------------------------------------------


def _safe_member_name(name: str) -> str:
    """The member's file name; ecg_unsafe_archive for an absolute path or ".."."""
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized) or ".." in path.parts:
        raise EcgInputError("ecg_unsafe_archive", reason="unsafe_path")
    return path.name


def _read_wfdb_zip(data: bytes) -> RawEcg:
    import wfdb  # noqa: PLC0415  (only for archives)

    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise EcgInputError("ecg_unsupported_format") from error

    with archive:
        members = [info for info in archive.infolist() if not info.is_dir()]
        if len(members) > MAX_ARCHIVE_ENTRIES:
            raise EcgInputError("ecg_unsafe_archive", reason="too_many_entries", max=MAX_ARCHIVE_ENTRIES)
        names = [_safe_member_name(info.filename) for info in members]
        if len(set(names)) != len(names):
            raise EcgInputError("ecg_unsafe_archive", reason="duplicate_names")
        if sum(info.file_size for info in members) > MAX_ARCHIVE_BYTES:
            raise EcgInputError("ecg_unsafe_archive", reason="too_large", maxBytes=MAX_ARCHIVE_BYTES)
        headers = [name for name in names if name.lower().endswith(".hea")]
        if len(headers) != 1:
            raise EcgInputError("ecg_unsupported_format", reason="one_hea_expected")

        with tempfile.TemporaryDirectory(prefix="healixdz-ecg-") as folder:
            # Extracted by hand, flat, counting the bytes actually written: the
            # sizes announced by the archive are not trusted.
            written = 0
            for info, name in zip(members, names):
                target = Path(folder) / name
                with archive.open(info) as source, target.open("wb") as sink:
                    while chunk := source.read(1024 * 1024):
                        written += len(chunk)
                        if written > MAX_ARCHIVE_BYTES:
                            raise EcgInputError("ecg_unsafe_archive", reason="too_large", maxBytes=MAX_ARCHIVE_BYTES)
                        sink.write(chunk)

            record_path = str(Path(folder) / headers[0][: -len(".hea")])
            try:
                header = wfdb.rdheader(record_path)
                files = {name for name in (header.file_name or []) if name}
                if not files or any(_safe_member_name(name) not in names for name in files):
                    raise EcgInputError("ecg_unsupported_format", reason="dat_missing")
                record = wfdb.rdrecord(record_path, physical=True)
            except EcgInputError:
                raise
            except Exception as error:  # noqa: BLE001  (wfdb raises many kinds)
                raise EcgInputError("ecg_unsupported_format", reason="unreadable_record") from error

    signal = record.p_signal
    if signal is None or signal.ndim != 2 or record.fs is None:
        raise EcgInputError("ecg_unsupported_format", reason="unreadable_record")

    units = {str(unit).strip().casefold() for unit in (record.units or [])}
    unit_factor = None
    if units and units <= set(UNITS):
        factors = {UNITS[unit] for unit in units}
        if len(factors) == 1:
            unit_factor = factors.pop()

    columns: dict[str, np.ndarray] = {}
    for index, name in enumerate(record.sig_name or []):
        key = lead_key(name)
        if key in columns:
            raise EcgInputError("ecg_unsupported_format", duplicateLead=name)
        columns[key] = np.asarray(signal[:, index], dtype=np.float64)

    rate = float(record.fs)
    if not math.isfinite(rate) or rate != int(rate) or not MIN_SAMPLING_RATE <= rate <= MAX_SAMPLING_RATE:
        raise EcgInputError("ecg_sampling_rate_invalid", min=MIN_SAMPLING_RATE, max=MAX_SAMPLING_RATE)
    return RawEcg(columns=columns, sampling_rate=rate, unit_factor=unit_factor)


# --- Entry point -----------------------------------------------------------------------

ZIP_SIGNATURE = b"PK\x03\x04"


def _is_zip(data: bytes) -> bool:
    return data[:4] == ZIP_SIGNATURE


# (detector, reader) in order. A future format (DICOM waveform, scanned
# paper ECG: out of scope today) is one more entry here.
_READERS = (
    (_is_zip, _read_wfdb_zip),
    (lambda data: True, _read_table),
)


def read_ecg(data: bytes, leads: list[str], sampling_rate=None, unit=None) -> EcgSignal:
    """The 12 leads in mV, in the card's order; EcgInputError otherwise."""
    if not data:
        raise EcgInputError("ecg_unsupported_format")
    reader = next(reader for detect, reader in _READERS if detect(data))
    raw = reader(data)
    form_rate = parse_sampling_rate(sampling_rate)
    form_factor = parse_unit(unit)

    missing = [lead for lead in leads if lead_key(lead) not in raw.columns]
    if missing:
        raise EcgInputError("ecg_missing_leads", missing=missing)

    if raw.sampling_rate is not None:
        rate = int(raw.sampling_rate)
    elif form_rate is None:
        raise EcgInputError("ecg_sampling_rate_required")
    else:
        rate = form_rate

    signal = np.stack([raw.columns[lead_key(lead)] for lead in leads]).astype(np.float64)
    # The header's unit (WFDB) wins over the form's.
    return validate_signal(signal, rate, leads, raw.unit_factor if raw.unit_factor is not None else form_factor)


def validate_signal(signal: np.ndarray, rate: int, leads: list[str], unit_factor: float = 1.0) -> EcgSignal:
    """The checks of every signal, whatever its format (also used by the evaluation)."""
    samples = signal.shape[1]
    duration = samples / rate
    if duration < MIN_DURATION_S:
        raise EcgInputError("ecg_too_short", durationSeconds=round(duration, 2), minSeconds=MIN_DURATION_S)
    if duration > MAX_DURATION_S:
        raise EcgInputError("ecg_too_long", durationSeconds=round(duration, 2), maxSeconds=MAX_DURATION_S)

    finite = np.isfinite(signal)
    if 1.0 - finite.mean() > MAX_NON_FINITE_SHARE:
        raise EcgInputError("ecg_non_finite", maxShare=MAX_NON_FINITE_SHARE)
    signal = np.where(finite, signal, 0.0) * unit_factor

    peak_to_peak = np.ptp(signal, axis=1)
    if np.any(peak_to_peak > MAX_PEAK_TO_PEAK_MV):
        too_large = [lead for lead, value in zip(leads, peak_to_peak) if value > MAX_PEAK_TO_PEAK_MV]
        raise EcgInputError("ecg_amplitude_out_of_range", leads=too_large, maxMillivolts=MAX_PEAK_TO_PEAK_MV)

    deviation = signal.std(axis=1)
    flat = [lead for lead, value in zip(leads, deviation) if value < MIN_LEAD_STD_MV]
    if flat:
        raise EcgInputError("ecg_flat_lead", leads=flat)

    return EcgSignal(signal=signal, sampling_rate=rate, duration_s=duration)
