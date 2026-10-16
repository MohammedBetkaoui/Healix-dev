// Measured on the service itself by ai-service/scripts/evaluate_pathology.py:
// the service's own preprocessing and inference (app.pathology_pipeline), on
// CPU, from the image bytes. Copied from the most recent
// ai-service/evaluation/pathology-*.json whose breakhis part is "ok":
// pathology-evaluation.test.ts checks every value against that file. Figures
// shown in the interface come from here, never typed elsewhere.
//
// Source report: pathology-2026-10-12-184302-c8cbd905-02b26d77.json (2026-10-12T16:51:28+00:00)
// To update: rerun the script, then copy the values of the new report here;
// the test fails until they match.
//
// The PanNuke weights 8d05b1f0… were the wrong model (nuclei mean Dice 0.012):
// their reports stay in ai-service/evaluation as history, never shown here.

import { type AiMagnification, type NucleusType } from "./ai-analyses.types";

export const pathologyEvaluationSource = {
  report: "pathology-2026-10-12-184302-c8cbd905-02b26d77.json",
  /** Local date of the run, from the report name. */
  date: "2026-10-12",
  generatedAt: "2026-10-12T16:51:28+00:00",
  weightsSha256: {
    "pathology-breakhis-classification": "c8cbd905cc039ed4775c98043e04d357bcfcaf971c4b9cc592a3600f97348e6b",
    "pathology-unet-pannuke-segmentation": "02b26d77988f7aa38a15f39e7ba9a7a8946380563e26d1ca705c805d688bbf3c",
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
  report: "pathology-2026-10-12-184302-c8cbd905-02b26d77.json",
  /** Local date of the run, from the report name. */
  date: "2026-10-12",
  generatedAt: "2026-10-12T16:51:28+00:00",
  weightsSha256: "02b26d77988f7aa38a15f39e7ba9a7a8946380563e26d1ca705c805d688bbf3c",
  /** PanNuke Fold 3 (the notebook's test fold). */
  images: 2722,
} as const;

/**
 * PanNuke Fold 3 (test), through the service: pixel counts pooled over the
 * whole fold.
 */
export const pannukeEvaluation: PannukeEvaluation = {
  perClass: {
    background: { dice: 0.9600117123444347, iou: 0.9230985807624613 },
    neoplastic: { dice: 0.7227128048868326, iou: 0.5658185626943519 },
    inflammatory: { dice: 0.6133714159194066, iou: 0.4423473040735733 },
    connective: { dice: 0.560473263166882, iou: 0.3893455042036199 },
    dead: { dice: 0.27993363777527164, iou: 0.16274583581368707 },
    epithelial: { dice: 0.6300699753692117, iou: 0.4599285832420694 },
  },
  nucleiMeanDice: 0.5613122194235209,
};

/** One organ of Fold 3 (pannuke.byTissue): its test patches and the mean Dice of the five nucleus types. */
export type PannukeTissueMeasure = { images: number; nucleiMeanDice: number };

/** PanNuke Fold 3 per organ, as named in types.npy. */
export const pannukeByTissue: Readonly<Record<string, PannukeTissueMeasure>> = {
  Adrenal_gland: { images: 155, nucleiMeanDice: 0.4146249861460688 },
  "Bile-duct": { images: 158, nucleiMeanDice: 0.3972454178750193 },
  Bladder: { images: 64, nucleiMeanDice: 0.3856296453674533 },
  Breast: { images: 775, nucleiMeanDice: 0.4967650019964644 },
  Cervix: { images: 86, nucleiMeanDice: 0.42087408471393717 },
  Colon: { images: 494, nucleiMeanDice: 0.572432473460055 },
  Esophagus: { images: 141, nucleiMeanDice: 0.4758134352571514 },
  HeadNeck: { images: 145, nucleiMeanDice: 0.4104930152317583 },
  Kidney: { images: 41, nucleiMeanDice: 0.37689442325348954 },
  Liver: { images: 93, nucleiMeanDice: 0.4919077867658686 },
  Lung: { images: 51, nucleiMeanDice: 0.3684674370851006 },
  Ovarian: { images: 52, nucleiMeanDice: 0.503756652561546 },
  Pancreatic: { images: 28, nucleiMeanDice: 0.4262234770018193 },
  Prostate: { images: 68, nucleiMeanDice: 0.3461850998957473 },
  Skin: { images: 41, nucleiMeanDice: 0.3896298240123516 },
  Stomach: { images: 48, nucleiMeanDice: 0.4651515477878353 },
  Testis: { images: 57, nucleiMeanDice: 0.5001160254854946 },
  Thyroid: { images: 62, nucleiMeanDice: 0.42428603476796295 },
  Uterus: { images: 163, nucleiMeanDice: 0.4089920858781794 },
};

/**
 * The lowest and highest mean nuclei Dice among the organs of the test fold:
 * the spread the "tissueDependent" limitation quotes.
 */
export function nucleiDiceRangeByTissue(
  byTissue: Readonly<Record<string, PannukeTissueMeasure>> = pannukeByTissue,
): { min: number; max: number } {
  const values = Object.values(byTissue).map((tissue) => tissue.nucleiMeanDice);
  if (values.length === 0) throw new Error("No organ in the PanNuke evaluation.");
  return { max: Math.max(...values), min: Math.min(...values) };
}

/**
 * Read in the training notebook (notebooks/pannuke-segmentation.ipynb, cell 10):
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
