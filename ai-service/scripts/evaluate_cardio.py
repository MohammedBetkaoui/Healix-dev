"""Offline evaluation of the cardiology ECG pipeline, as the service runs it.

Replays the service's own code (app.ecg_pipeline: windows, band-pass,
z-score, inference, mean of the sigmoid outputs; app.ecg_input's checks) on
the test fold of the training notebook (notebooks/module-cardiologie.ipynb):
PTB-XL 1.0.1, records100, strat_fold 10, the diagnostic SCP statements of
likelihood >= 50 mapped to their superclass, records without any left out.

    .venv/Scripts/python -m scripts.evaluate_cardio --ptbxl <PTB-XL 1.0.1 folder>

The folder holds ptbxl_database.csv, scp_statements.csv and records100/.
Writes evaluation/cardio-<date>-<sha256[:8] of the weights>.json and copies it
to evaluation/cardio-latest.json, with the AUC per class, the macro AUC, and
the sensitivity, specificity, PPV and F1 at the card's thresholds. Fails
(exit code 1) when the macro AUC differs from the card's test figure by more
than 0.005. No signal is written.
"""

from __future__ import annotations

import argparse
import ast
import datetime
import json
import platform
import shutil
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import scipy  # noqa: E402
import torch  # noqa: E402
import wfdb  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402

from app.config import DEFAULT_MODELS_DIR  # noqa: E402
from app.ecg_input import EcgInputError, validate_signal  # noqa: E402
from app.ecg_models import ECG_MODEL_ID, load_ecg_model  # noqa: E402
from app.ecg_pipeline import predict  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "evaluation"
LATEST_REPORT_NAME = "cardio-latest.json"
TEST_FOLD = 10
MIN_LIKELIHOOD = 50
MAX_MACRO_AUC_GAP = 0.005


def superclass_labels(database: pd.DataFrame, statements: pd.DataFrame, classes: list[str]) -> pd.Series:
    """Superclasses per ECG, as the notebook (get_superclasses): likelihood >= 50, diagnostic statements only."""
    to_super = statements[statements["diagnostic"] == 1.0]["diagnostic_class"].to_dict()

    def labels(codes) -> list[str]:
        codes = ast.literal_eval(codes) if isinstance(codes, str) else (codes or {})
        found = {to_super[code] for code, likelihood in codes.items() if likelihood >= MIN_LIKELIHOOD and code in to_super}
        return [label for label in classes if label in found]

    return database["scp_codes"].apply(labels)


def binary_metrics(truth: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    predicted = scores >= threshold
    tp = int(np.sum(predicted & (truth == 1)))
    fp = int(np.sum(predicted & (truth == 0)))
    fn = int(np.sum(~predicted & (truth == 1)))
    tn = int(np.sum(~predicted & (truth == 0)))

    def ratio(numerator: int, denominator: int) -> float | None:
        return numerator / denominator if denominator else None

    sensitivity, ppv = ratio(tp, tp + fn), ratio(tp, tp + fp)
    f1 = 2 * sensitivity * ppv / (sensitivity + ppv) if sensitivity and ppv else 0.0
    return {
        "threshold": threshold,
        "sensitivity": sensitivity,
        "specificity": ratio(tn, tn + fp),
        "ppv": ppv,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
    }


def metrics(truth: np.ndarray, scores: np.ndarray, classes: list[str], thresholds: dict[str, float]) -> dict:
    per_class = {}
    for index, label in enumerate(classes):
        per_class[label] = {
            "auc": float(roc_auc_score(truth[:, index], scores[:, index])),
            **binary_metrics(truth[:, index], scores[:, index], thresholds[label]),
        }
    return {
        "auc_macro": float(np.mean([entry["auc"] for entry in per_class.values()])),
        "per_class": per_class,
    }


def compare(measured: dict, card_test: dict) -> dict:
    gap = measured["auc_macro"] - float(card_test["auc_macro"])
    return {
        "notebookAucMacro": float(card_test["auc_macro"]),
        "serviceAucMacro": measured["auc_macro"],
        "difference": gap,
        "tolerance": MAX_MACRO_AUC_GAP,
        "ok": abs(gap) <= MAX_MACRO_AUC_GAP,
    }


def load_test_fold(ptbxl: Path, classes: list[str]) -> pd.DataFrame:
    database = pd.read_csv(ptbxl / "ptbxl_database.csv", index_col="ecg_id")
    statements = pd.read_csv(ptbxl / "scp_statements.csv", index_col=0)
    database["superclasses"] = superclass_labels(database, statements, classes)
    database = database[database["superclasses"].map(len) > 0]
    return database[database["strat_fold"] == TEST_FOLD]


def evaluate(ptbxl: Path, entry, limit: int | None = None) -> dict:
    config = entry.config
    classes, leads = config["classes"], config["leads"]
    test = load_test_fold(ptbxl, classes)
    if limit:
        test = test.head(limit)

    truth = np.zeros((len(test), len(classes)), dtype=np.int64)
    scores = np.zeros((len(test), len(classes)), dtype=np.float64)
    refused: dict[str, int] = {}
    for row, (ecg_id, record) in enumerate(test.iterrows()):
        sample = wfdb.rdrecord(str(ptbxl / record["filename_lr"]))
        names = list(sample.sig_name)
        signal = np.nan_to_num(sample.p_signal.T[[names.index(lead) for lead in leads]].astype(np.float64), nan=0.0)
        try:
            validate_signal(signal, int(sample.fs), leads)
        except EcgInputError as error:
            # Still scored, as in the notebook; counted apart.
            refused[error.code] = refused.get(error.code, 0) + 1
        probabilities, _ = predict(signal, entry)
        scores[row] = [probabilities[label] for label in classes]
        truth[row] = [label in record["superclasses"] for label in classes]
        if (row + 1) % 200 == 0:
            print(f"  {row + 1} / {len(test)}", file=sys.stderr)

    measured = metrics(truth, scores, classes, config["thresholds"])
    return {
        "dataset": {
            "name": "PTB-XL 1.0.1, records100",
            "fold": TEST_FOLD,
            "labels": f"diagnostic SCP statements of likelihood >= {MIN_LIKELIHOOD}, mapped to their superclass",
            "nEcg": len(test),
            "refusedByServiceChecks": refused,
        },
        "metrics": measured,
        "comparison": compare(measured, config["card"]["test"]),
    }


def build_report(entry, results: dict) -> dict:
    status = entry.status()
    return {
        "schemaVersion": 1,
        "pipeline": "cardio-ecg",
        "generatedAt": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
        "method": {
            "inference": "app.ecg_pipeline.predict: 10 s windows every 5 s, Butterworth band-pass and z-score of the card, mean of the sigmoid outputs; CPU",
            "thresholds": "the model card's, per class",
        },
        "weights": {
            ECG_MODEL_ID: {
                "file": status["file"],
                "sha256": status["weightsSha256"],
                "loaded": status["loaded"],
                "config": status.get("config"),
            }
        },
        "versions": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "wfdb": wfdb.__version__,
        },
        **results,
    }


def write_report(
    report: dict, output_dir: Path, sha256: str, complete: bool = True, now: datetime.date | None = None
) -> Path:
    """cardio-<date>-<sha8>.json; copied to cardio-latest.json only for a complete run."""
    output_dir.mkdir(parents=True, exist_ok=True)
    day = (now or datetime.date.today()).isoformat()
    suffix = "" if complete else "-partial"
    path = output_dir / f"cardio-{day}-{sha256[:8]}{suffix}.json"
    # Named inside, as the pathology reports: cardio-latest.json is a copy.
    report = {"file": path.name, **report}
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if complete:
        shutil.copyfile(path, output_dir / LATEST_REPORT_NAME)
    return path


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ptbxl", type=Path, required=True, help="PTB-XL 1.0.1 folder (ptbxl_database.csv, records100/)")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODELS_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--limit", type=int, default=None, help="first N records only (a quick check, never committed)")
    args = parser.parse_args(argv)

    if not (args.ptbxl / "ptbxl_database.csv").is_file() or not (args.ptbxl / "records100").is_dir():
        print(f"PTB-XL not found in {args.ptbxl} (ptbxl_database.csv, records100/).", file=sys.stderr)
        return 2
    entry = load_ecg_model(args.models_dir)
    if not entry.loaded:
        print(f"Model {ECG_MODEL_ID} not loaded: {entry.error}.", file=sys.stderr)
        return 2

    report = build_report(entry, evaluate(args.ptbxl, entry, args.limit))
    path = write_report(report, args.output_dir, entry.weights_sha256, complete=args.limit is None)
    comparison = report["comparison"]
    print(f"{report['dataset']['nEcg']} ECG, macro AUC {comparison['serviceAucMacro']:.4f} "
          f"(notebook {comparison['notebookAucMacro']:.4f}, difference {comparison['difference']:+.4f}).")
    for label, entry_metrics in report["metrics"]["per_class"].items():
        print(f"  {label:5s} AUC {entry_metrics['auc']:.4f}  sens {entry_metrics['sensitivity']:.3f}  "
              f"spec {entry_metrics['specificity']:.3f}  PPV {entry_metrics['ppv']:.3f}  F1 {entry_metrics['f1']:.3f}")
    print(f"Written: {path}")
    if not comparison["ok"]:
        print(f"Macro AUC differs from the notebook's by more than {MAX_MACRO_AUC_GAP}.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
