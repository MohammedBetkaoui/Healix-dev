"""Cardiology ECG: the service reproduces the training notebook.

These tests check that the service gives the notebook's probabilities on
PTB-XL fixtures (tests/fixtures/ecg, exported by cell 16), not that the model
is right: some fixtures are model errors (STTC at 0.213 for ECG 116, whose
label is STTC). Tests that need the weights are skipped without them.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pytest

from app.ecg_input import (
    MAX_ARCHIVE_BYTES,
    EcgInputError,
    read_ecg,
)
from app.ecg_models import ECG_MODEL_ID, ECG_SPEC, HealixDzECGNet, load_ecg_model, read_model_card
from app.ecg_pipeline import analyze_ecg, window_starts
from app.models import LoadedModel, ModelRegistry

from .conftest import MODELS_DIR, TOKEN, make_client

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "ecg"
FIXTURES = json.loads((FIXTURES_DIR / "fixtures.json").read_text(encoding="utf-8"))
LEADS: list[str] = FIXTURES["leads"]
AUTH = {"X-Service-Token": TOKEN}
URL = "/analyze/cardio/ecg"

ECG_WEIGHTS_PRESENT = (MODELS_DIR / ECG_SPEC.file_name).is_file() and (MODELS_DIR / ECG_SPEC.config_file).is_file()
requires_ecg_weights = pytest.mark.skipif(not ECG_WEIGHTS_PRESENT, reason=f"ECG weights not found in {MODELS_DIR}")


@pytest.fixture(scope="module")
def ecg_registry() -> ModelRegistry:
    if not ECG_WEIGHTS_PRESENT:
        pytest.skip(f"ECG weights not found in {MODELS_DIR}")
    entry = load_ecg_model(MODELS_DIR)
    assert entry.loaded, entry.error
    return ModelRegistry(models={ECG_MODEL_ID: entry})


@pytest.fixture(scope="module")
def card() -> dict:
    if not (MODELS_DIR / ECG_SPEC.config_file).is_file():
        pytest.skip("model card not found")
    return read_model_card(MODELS_DIR / ECG_SPEC.config_file)


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


def fixture_signal(name: str, rate: int) -> np.ndarray:
    """(12, T) in mV, from a fixture CSV."""
    return read_ecg(fixture_bytes(name), LEADS, rate).signal


def to_csv(signal: np.ndarray, names: list[str], delimiter: str = ",", decimal: str = ".", time_rate: int | None = None) -> bytes:
    header = (["time"] if time_rate else []) + names
    lines = [delimiter.join(header)]
    for index in range(signal.shape[1]):
        cells = [f"{value:.4f}".replace(".", decimal) for value in signal[:, index]]
        if time_rate:
            cells.insert(0, f"{index / time_rate:.3f}".replace(".", decimal))
        lines.append(delimiter.join(cells))
    return ("\n".join(lines) + "\n").encode("utf-8")


def code_of(call) -> tuple[str, dict]:
    with pytest.raises(EcgInputError) as raised:
        call()
    return raised.value.code, raised.value.details


SAMPLE_100HZ = FIXTURES["fixtures"][0]["csv_100hz"]


# --- Fidelity to the notebook ----------------------------------------------------


@requires_ecg_weights
@pytest.mark.parametrize("fixture", FIXTURES["fixtures"], ids=lambda f: f"ecg-{f['ecg_id']}")
def test_reproduces_the_notebook_at_100_hz(fixture, ecg_registry):
    result = analyze_ecg(fixture_bytes(fixture["csv_100hz"]), "100", None, ecg_registry)

    for label, expected in fixture["expected_probs_100hz"].items():
        # CPU/GPU differences only.
        assert result["probabilities"][label] == pytest.approx(expected, abs=1e-3), label
    assert result["windows"] == 1
    assert result["inputSamplingRate"] == 100


@requires_ecg_weights
@pytest.mark.parametrize("fixture", FIXTURES["fixtures"], ids=lambda f: f"ecg-{f['ecg_id']}")
def test_resampling_500_hz_stays_close_to_the_100_hz_reference(fixture, ecg_registry, card):
    result = analyze_ecg(fixture_bytes(fixture["csv_500hz"]), "500", None, ecg_registry)
    thresholds = card["thresholds"]

    for label, expected in fixture["expected_probs_100hz"].items():
        borderline = abs(expected - thresholds[label]) <= 0.05
        # PTB-XL's own 100 Hz records were downsampled their own way: a
        # class near its threshold is where the model is steepest (MI of
        # ECG 162: 0.557 at 100 Hz, about 0.48 from 500 Hz, threshold 0.579).
        assert result["probabilities"][label] == pytest.approx(expected, abs=0.1 if borderline else 0.05), label
        if not borderline:
            assert (label in result["positive"]) == (expected >= thresholds[label]), label
    assert result["inputSamplingRate"] == 500


@requires_ecg_weights
def test_result_holds_thresholds_sorted_positives_and_an_unnormalized_trace(ecg_registry, card):
    fixture = next(f for f in FIXTURES["fixtures"] if f["ecg_id"] == 271)
    result = analyze_ecg(fixture_bytes(fixture["csv_100hz"]), "100", "mV", ecg_registry)

    assert result["thresholds"] == card["thresholds"]
    probabilities = [result["probabilities"][label] for label in result["positive"]]
    assert probabilities == sorted(probabilities, reverse=True)
    assert all(result["probabilities"][label] >= card["thresholds"][label] for label in result["positive"])
    assert result["modelId"] == ECG_MODEL_ID
    assert result["weightsSha256"] == card["sha256"]
    assert result["configSha256"]
    assert result["durationSeconds"] == 10.0

    trace = result["trace"]
    assert list(trace) == LEADS
    assert all(len(values) == 1000 for values in trace.values())
    # Filtered, in mV (not z-scored): amplitudes of a real ECG, rounded to the µV.
    lead_ii = np.array(trace["II"])
    assert 0.3 < np.ptp(lead_ii) < 10
    assert np.allclose(lead_ii, np.round(lead_ii, 3))
    # Decision support only: no course of action anywhere.
    assert "urgence" not in json.dumps(result).lower()


@requires_ecg_weights
def test_a_30_second_signal_gives_5_windows(ecg_registry):
    signal = np.tile(fixture_signal(SAMPLE_100HZ, 100), 3)
    result = analyze_ecg(to_csv(signal, LEADS), "100", None, ecg_registry)
    assert result["windows"] == 5
    assert result["durationSeconds"] == 30.0


def test_windows_every_5_s_the_last_one_on_the_end():
    assert window_starts(1000, 1000, 500) == [0]
    assert window_starts(3000, 1000, 500) == [0, 500, 1000, 1500, 2000]
    assert window_starts(1250, 1000, 500) == [0, 250]
    assert window_starts(999, 1000, 500) == []


# --- Formats ---------------------------------------------------------------------------


def test_reads_a_french_excel_csv_semicolons_and_decimal_commas():
    reference = fixture_signal(SAMPLE_100HZ, 100)
    signal = read_ecg(to_csv(reference, LEADS, ";", ","), LEADS, "100").signal
    assert np.allclose(signal, reference, atol=1e-4)


def test_ignores_a_time_column_and_lead_name_case():
    reference = fixture_signal(SAMPLE_100HZ, 100)
    data = to_csv(reference, [lead.lower() for lead in LEADS], time_rate=100)
    signal = read_ecg(data, LEADS, "100")
    assert np.allclose(signal.signal, reference, atol=1e-4)
    # Upper case too ("AVR").
    upper = read_ecg(to_csv(reference, [lead.upper() for lead in LEADS]), LEADS, 100)
    assert np.allclose(upper.signal, reference, atol=1e-4)


def test_puts_the_leads_in_the_card_order_whatever_the_file_order():
    reference = fixture_signal(SAMPLE_100HZ, 100)
    order = list(reversed(range(12)))
    data = to_csv(reference[order], [LEADS[index] for index in order])
    assert np.allclose(read_ecg(data, LEADS, "100").signal, reference, atol=1e-4)


def wfdb_zip(signal: np.ndarray, rate: int, folder: Path, name: str = "ecg01") -> bytes:
    import wfdb

    wfdb.wrsamp(
        name,
        fs=rate,
        units=["mV"] * len(LEADS),
        sig_name=LEADS,
        p_signal=signal.T,
        fmt=["16"] * len(LEADS),
        adc_gain=[1000.0] * len(LEADS),
        baseline=[0] * len(LEADS),
        write_dir=str(folder),
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for suffix in (".hea", ".dat"):
            archive.write(folder / f"{name}{suffix}", f"records/{name}{suffix}")
    return buffer.getvalue()


def test_reads_a_wfdb_record_in_a_zip_rate_and_leads_from_its_header(tmp_path):
    reference = fixture_signal(FIXTURES["fixtures"][1]["csv_500hz"], 500)
    data = wfdb_zip(reference, 500, tmp_path)

    # No samplingRate field: the header gives it.
    signal = read_ecg(data, LEADS)
    assert signal.sampling_rate == 500
    assert signal.signal.shape == (12, 5000)
    assert np.allclose(signal.signal, reference, atol=2e-3)


@requires_ecg_weights
def test_a_wfdb_zip_gives_the_same_probabilities_as_its_csv(tmp_path, ecg_registry):
    fixture = FIXTURES["fixtures"][0]
    reference = fixture_signal(fixture["csv_100hz"], 100)
    result = analyze_ecg(wfdb_zip(reference, 100, tmp_path), None, None, ecg_registry)
    for label, expected in fixture["expected_probs_100hz"].items():
        assert result["probabilities"][label] == pytest.approx(expected, abs=1e-2), label


# --- Refusals ---------------------------------------------------------------------------


def test_refuses_11_leads_and_names_the_missing_one():
    reference = fixture_signal(SAMPLE_100HZ, 100)
    code, details = code_of(lambda: read_ecg(to_csv(reference[:11], LEADS[:11]), LEADS, "100"))
    assert code == "ecg_missing_leads"
    assert details["missing"] == ["V6"]


def test_refuses_a_flat_lead():
    signal = fixture_signal(SAMPLE_100HZ, 100)
    signal[8] = 0.25
    code, details = code_of(lambda: read_ecg(to_csv(signal, LEADS), LEADS, "100"))
    assert (code, details["leads"]) == ("ecg_flat_lead", ["V3"])


def test_a_csv_needs_its_sampling_rate_within_100_to_1000_hz():
    data = fixture_bytes(SAMPLE_100HZ)
    assert code_of(lambda: read_ecg(data, LEADS))[0] == "ecg_sampling_rate_required"
    assert code_of(lambda: read_ecg(data, LEADS, ""))[0] == "ecg_sampling_rate_required"
    for invalid in ("50", "1500", "250.5", "abc"):
        assert code_of(lambda: read_ecg(data, LEADS, invalid))[0] == "ecg_sampling_rate_invalid", invalid


def test_refuses_5_s_and_70_s_never_pads():
    signal = fixture_signal(SAMPLE_100HZ, 100)
    assert code_of(lambda: read_ecg(to_csv(signal[:, :500], LEADS), LEADS, "100"))[0] == "ecg_too_short"
    long = np.tile(signal, 7)
    assert code_of(lambda: read_ecg(to_csv(long, LEADS), LEADS, "100"))[0] == "ecg_too_long"


def test_refuses_more_than_1_percent_non_finite_values_and_zeroes_fewer():
    signal = fixture_signal(SAMPLE_100HZ, 100)
    sparse = signal.copy()
    sparse[0, :50] = np.nan  # 50 / 12 000: under 1 %
    read = read_ecg(to_csv(sparse, LEADS).replace(b"nan", b""), LEADS, "100")
    assert np.all(read.signal[0, :50] == 0.0)

    dense = signal.copy()
    dense[:2, :] = np.nan  # 2 000 / 12 000
    assert code_of(lambda: read_ecg(to_csv(dense, LEADS), LEADS, "100"))[0] == "ecg_non_finite"


def test_refuses_microvolts_unless_the_unit_says_so():
    microvolts = fixture_signal(SAMPLE_100HZ, 100) * 1000
    data = to_csv(microvolts, LEADS)
    assert code_of(lambda: read_ecg(data, LEADS, "100"))[0] == "ecg_amplitude_out_of_range"
    converted = read_ecg(data, LEADS, "100", "uV")
    assert np.allclose(converted.signal, microvolts / 1000)
    assert code_of(lambda: read_ecg(data, LEADS, "100", "volts"))[0] == "ecg_unit_invalid"


def test_refuses_a_zip_with_a_parent_path():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("ecg.hea", "ecg 12 100 1000\n")
        archive.writestr("../x.dat", b"\x00" * 10)
    code, details = code_of(lambda: read_ecg(buffer.getvalue(), LEADS))
    assert (code, details["reason"]) == ("ecg_unsafe_archive", "unsafe_path")


def test_refuses_a_zip_over_50_mb_once_decompressed():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("ecg.hea", "ecg 12 100 1000\n")
        archive.writestr("ecg.dat", b"\x00" * (MAX_ARCHIVE_BYTES + 1))
    data = buffer.getvalue()
    assert len(data) < 1024 * 1024  # a sparse file: tiny once compressed
    code, details = code_of(lambda: read_ecg(data, LEADS))
    assert (code, details["reason"]) == ("ecg_unsafe_archive", "too_large")


def test_refuses_a_zip_with_too_many_entries_or_no_header():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for index in range(5):
            archive.writestr(f"part{index}.dat", b"0")
    assert code_of(lambda: read_ecg(buffer.getvalue(), LEADS))[1]["reason"] == "too_many_entries"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("ecg.dat", b"0")
    assert code_of(lambda: read_ecg(buffer.getvalue(), LEADS))[0] == "ecg_unsupported_format"


def test_refuses_what_is_not_a_signal():
    assert code_of(lambda: read_ecg(b"\x89PNG\r\n\x1a\n\x00\x00\x00", LEADS, "100"))[0] == "ecg_unsupported_format"
    assert code_of(lambda: read_ecg(b"", LEADS, "100"))[0] == "ecg_unsupported_format"


# --- Model loading --------------------------------------------------------------------------


def test_the_architecture_keys_are_the_checkpoint_keys():
    keys = set(HealixDzECGNet().state_dict())
    assert {"stem.0.weight", "layer1.0.conv1.weight", "layer2.0.shortcut.0.weight", "head.5.bias"} <= keys
    assert len(keys) == 225


@requires_ecg_weights
def test_refuses_weights_whose_sha256_is_not_the_cards(tmp_path):
    (tmp_path / ECG_SPEC.file_name).write_bytes((MODELS_DIR / ECG_SPEC.file_name).read_bytes() + b"x")
    (tmp_path / ECG_SPEC.config_file).write_bytes((MODELS_DIR / ECG_SPEC.config_file).read_bytes())
    entry = load_ecg_model(tmp_path)
    assert (entry.loaded, entry.error) == (False, "weights_sha256_mismatch")
    assert entry.config_sha256  # the card's digest is kept


def test_a_missing_model_is_reported_not_loaded(tmp_path):
    entry = load_ecg_model(tmp_path)
    assert (entry.loaded, entry.error) == (False, "weights_missing")


# --- Service ----------------------------------------------------------------------------------


def unloaded_registry() -> ModelRegistry:
    return ModelRegistry(models={ECG_MODEL_ID: LoadedModel(spec=ECG_SPEC, error="weights_missing")})


def test_the_endpoint_refuses_a_request_without_token():
    with make_client(unloaded_registry()) as client:
        response = client.post(URL, files={"file": ("ecg.csv", fixture_bytes(SAMPLE_100HZ), "text/csv")})
    assert response.status_code == 401


def test_the_endpoint_answers_503_without_the_model():
    with make_client(unloaded_registry()) as client:
        response = client.post(
            URL,
            headers=AUTH,
            files={"file": ("ecg.csv", fixture_bytes(SAMPLE_100HZ), "text/csv")},
            data={"samplingRate": "100"},
        )
    assert (response.status_code, response.json()["detail"]["code"]) == (503, "model_not_loaded")


@requires_ecg_weights
def test_models_lists_the_ecg_model_with_its_sha256_and_the_endpoint_answers(ecg_registry, card):
    with make_client(ecg_registry) as client:
        models = client.get("/models", headers=AUTH).json()["models"]
        response = client.post(
            URL,
            headers=AUTH,
            files={"file": ("ecg.csv", fixture_bytes(SAMPLE_100HZ), "text/csv")},
            data={"samplingRate": "100"},
        )
        refused = client.post(
            URL,
            headers=AUTH,
            files={"file": ("ecg.csv", to_csv(fixture_signal(SAMPLE_100HZ, 100)[:11], LEADS[:11]), "text/csv")},
            data={"samplingRate": "100"},
        )
    status = next(model for model in models if model["modelId"] == ECG_MODEL_ID)
    assert status["loaded"] is True
    assert status["weightsSha256"] == card["sha256"]
    assert status["config"]["file"] == ECG_SPEC.config_file
    assert response.status_code == 200
    assert response.json()["positive"] == ["NORM"]
    assert refused.status_code == 422
    assert refused.json()["detail"] == {"code": "ecg_missing_leads", "missing": ["V6"]}
