// Measured on the service itself by ai-service/scripts/evaluate_pathology.py:
// the service's own preprocessing and inference (app.pathology_pipeline), on
// CPU, from the image bytes. Copied from the most recent
// ai-service/evaluation/pathology-*.json whose breakhis part is "ok":
// pathology-evaluation.test.ts checks every value against that file. Figures
// shown in the interface come from here, never typed elsewhere.
//
// Source report: pathology-2026-10-11-183500-c8cbd905-8d05b1f0.json (2026-10-11T17:22:58+00:00)
// To update: rerun the script, then copy the values of the new report here;
// the test fails until they match.

import { type AiMagnification, type NucleusType } from "./ai-analyses.types";

export const pathologyEvaluationSource = {
  report: "pathology-2026-10-11-183500-c8cbd905-8d05b1f0.json",
  /** Local date of the run, from the report name. */
  date: "2026-10-11",
  generatedAt: "2026-10-11T17:22:58+00:00",
  weightsSha256: {
    "pathology-breakhis-classification": "c8cbd905cc039ed4775c98043e04d357bcfcaf971c4b9cc592a3600f97348e6b",
    "pathology-unet-pannuke-segmentation": "8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248",
  },
  /** breakhis_inference_config.json, which holds the decision threshold. */
  breakhisConfigSha256: "ea0646849ab49e9ce148f902895693f6a304f2e329d9cb2e591fe07c8025f552",
} as const;

/** 95 % interval, [lower, upper]: bootstrap over the test PATIENTS (1,000 draws). */
export type PatientInterval = readonly [number, number];
export type MeasuredValue = { value: number; ci95: PatientInterval };

/** [[TN, FP], [FN, TP]]: rows the true class (benign, malignant), columns the model's result. */
export type BinaryConfusionMatrix = readonly [readonly [number, number], readonly [number, number]];

export type MagnificationMetrics = {
  /** Test images at this magnification. */
  n: number;
  sensitivity: number;
  specificity: number;
  confusionMatrix: BinaryConfusionMatrix;
};

export type BreakhisEvaluation = {
  /** The threshold the figures are measured at (the service's). */
  threshold: number;
  /** Test images. */
  n: number;
  /** Test patients, and the benign ones among them (from byPatient). */
  testPatients: number;
  benignPatients: number;
  accuracy: MeasuredValue;
  sensitivity: MeasuredValue;
  specificity: MeasuredValue;
  precision: MeasuredValue;
  aucRoc: MeasuredValue;
  confusionMatrix: BinaryConfusionMatrix;
  byMagnification: Readonly<Record<`${AiMagnification}`, MagnificationMetrics>>;
};

/** BreakHis v1, the 13 test patients of the notebook's patient-level split. */
export const breakhisEvaluation: BreakhisEvaluation = {
  threshold: 0.13,
  n: 1346,
  testPatients: 13,
  benignPatients: 4,
  accuracy: { value: 0.8818722139673105, ci95: [0.8060840671657712, 0.9332104599873976] },
  sensitivity: { value: 0.9259259259259259, ci95: [0.8708844241922121, 0.9686133688340808] },
  specificity: { value: 0.7550432276657061, ci95: [0.5647058823529412, 0.9177215189873418] },
  precision: { value: 0.9158415841584159, ci95: [0.7740589720736779, 0.9868311095505619] },
  aucRoc: { value: 0.939152408893043, ci95: [0.8693445810480547, 0.9754124353271978] },
  confusionMatrix: [
    [262, 85],
    [74, 925],
  ],
  byMagnification: {
    "40": { n: 330, sensitivity: 0.9676113360323887, specificity: 0.7831325301204819, confusionMatrix: [[65, 18], [8, 239]] },
    "100": { n: 353, sensitivity: 0.9015151515151515, specificity: 0.7865168539325843, confusionMatrix: [[70, 19], [26, 238]] },
    "200": { n: 340, sensitivity: 0.9203187250996016, specificity: 0.7752808988764045, confusionMatrix: [[69, 20], [20, 231]] },
    "400": { n: 323, sensitivity: 0.9156118143459916, specificity: 0.6744186046511628, confusionMatrix: [[58, 28], [20, 217]] },
  },
};

export type PannukeEvaluation = {
  /** Dice and IoU per class, pooled over the pixels of the test fold. */
  perClass: Readonly<Record<"background" | NucleusType, { dice: number; iou: number }>>;
  nucleiMeanDice: number;
};

/**
 * The report PanNuke's figures come from: the most recent one whose pannuke
 * part is "ok" (it may differ from the BreakHis one, which it need not
 * re-measure).
 */
export const pannukeEvaluationSource = {
  report: "pathology-2026-10-12-132137-c8cbd905-8d05b1f0.json",
  /** Local date of the run, from the report name. */
  date: "2026-10-12",
  generatedAt: "2026-10-12T11:31:16+00:00",
  weightsSha256: "8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248",
  /** PanNuke Fold 3 (the notebook's test fold). */
  images: 2722,
} as const;

/**
 * PanNuke Fold 3 (test), through the service: pixel counts pooled over the
 * whole fold. null until a report has pannuke.status "ok" (the test then
 * fails until its figures are copied here).
 */
export const pannukeEvaluation: PannukeEvaluation | null = {
  perClass: {
    background: { dice: 0.724785541070474, iou: 0.5683636473812353 },
    neoplastic: { dice: 0.0003260775099373422, iou: 0.0001630653409388363 },
    inflammatory: { dice: 0.05828895758691243, iou: 0.03001937791653749 },
    connective: { dice: 0.0012590670753959783, iou: 0.0006299300998222327 },
    dead: { dice: 0, iou: 0 },
    epithelial: { dice: 7.468834903248621e-5, iou: 3.734556915569506e-5 },
  },
  nucleiMeanDice: 0.011989758104255647,
};

/**
 * Read in the training notebook (pannuke-segmentation (3).ipynb, cell 10):
 * measured on Fold 2, the VALIDATION fold the checkpoint was selected on, so
 * optimistic, and not a test measure. Shown only as such.
 */
export const pannukeNotebookValidation: PannukeEvaluation = {
  perClass: {
    background: { dice: 0.9625, iou: 0.927711 },
    neoplastic: { dice: 0.71192, iou: 0.552699 },
    inflammatory: { dice: 0.623947, iou: 0.453433 },
    connective: { dice: 0.559982, iou: 0.388871 },
    dead: { dice: 0.305563, iou: 0.180333 },
    epithelial: { dice: 0.623045, iou: 0.452481 },
  },
  nucleiMeanDice: 0.5649,
};
