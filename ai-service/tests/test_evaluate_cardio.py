"""The cardiology evaluation's own logic (labels, metrics, report files), without PTB-XL."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from scripts.evaluate_cardio import (
    LATEST_REPORT_NAME,
    binary_metrics,
    compare,
    metrics,
    superclass_labels,
    write_report,
)

CLASSES = ["NORM", "MI", "STTC", "CD", "HYP"]


def test_superclasses_as_the_notebook_likelihood_50_diagnostic_only():
    statements = pd.DataFrame(
        {"diagnostic": [1.0, 1.0, 1.0, float("nan")], "diagnostic_class": ["NORM", "MI", "STTC", None]},
        index=["NORM", "IMI", "NDT", "SR"],
    )
    database = pd.DataFrame(
        {"scp_codes": ["{'NORM': 100.0, 'SR': 0.0}", "{'IMI': 35.0, 'NDT': 50.0}", "{'SR': 100.0}"]},
        index=[1, 2, 3],
    )
    labels = superclass_labels(database, statements, CLASSES)
    assert labels.tolist() == [["NORM"], ["STTC"], []]


def test_binary_metrics_at_a_threshold():
    truth = np.array([1, 1, 0, 0, 1])
    scores = np.array([0.9, 0.4, 0.6, 0.1, 0.7])
    result = binary_metrics(truth, scores, 0.5)
    assert (result["tp"], result["fp"], result["fn"], result["tn"]) == (2, 1, 1, 1)
    assert result["sensitivity"] == pytest.approx(2 / 3)
    assert result["specificity"] == pytest.approx(0.5)
    assert result["ppv"] == pytest.approx(2 / 3)
    assert result["f1"] == pytest.approx(2 / 3)


def test_macro_auc_and_the_comparison_with_the_card():
    rng = np.random.default_rng(0)
    truth = rng.integers(0, 2, size=(40, 5))
    scores = np.clip(truth * 0.6 + rng.random((40, 5)) * 0.5, 0, 1)
    measured = metrics(truth, scores, CLASSES, dict.fromkeys(CLASSES, 0.5))
    assert measured["auc_macro"] == pytest.approx(np.mean([measured["per_class"][c]["auc"] for c in CLASSES]))

    assert compare({"auc_macro": 0.9200}, {"auc_macro": 0.9210})["ok"] is True
    assert compare({"auc_macro": 0.9100}, {"auc_macro": 0.9210})["ok"] is False


def test_a_partial_run_never_replaces_the_latest_report(tmp_path):
    complete = write_report({"run": "full"}, tmp_path, "258e4e4de3c5", complete=True)
    partial = write_report({"run": "partial"}, tmp_path, "258e4e4de3c5", complete=False)
    assert complete.name.endswith("-258e4e4d.json")
    assert partial.name.endswith("-partial.json")
    assert json.loads((tmp_path / LATEST_REPORT_NAME).read_text(encoding="utf-8")) == {"file": complete.name, "run": "full"}
