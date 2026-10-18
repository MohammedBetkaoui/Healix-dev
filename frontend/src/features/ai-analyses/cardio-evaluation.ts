// The test figures of the ECG model, as its training notebook measured them
// (PTB-XL 1.0.1, strat_fold 10), copied from its model card, the single
// source of truth: ai-service/tests/fixtures/ecg/model-card.json, the very
// file next to the weights (ai-service test_cardio.py checks it is).
// cardio-evaluation.test.ts checks every value against it. Shown on the hub
// as "notebook" figures: they were not measured on the service itself. The
// result page asks the backend instead (GET /ai-models/cardio-ecg/evaluation),
// which prefers the service's own evaluation (evaluate_cardio.py) when one
// exists for the weights.

import { type EcgClass } from "./ai-analyses.types";

export const cardioEvaluationSource = {
  modelCard: "cardio-ecg-resnet1d-ptbxl.json",
  weightsSha256: "258e4e4de3c5b876b71bf172d335666ee75b3f5f0cae9806b1a71096e5a7b55a",
} as const;

export type CardioClassFigures = {
  auc: number;
  /** At the card's threshold. */
  sensitivity: number;
  specificity: number;
  ppv: number;
  f1: number;
};

export const cardioNotebookEvaluation: {
  nEcg: number;
  aucMacro: number;
  perClass: Record<EcgClass, CardioClassFigures>;
} = {
  nEcg: 2055,
  aucMacro: 0.9209861989546606,
  perClass: {
    NORM: { auc: 0.9564545454545454, sensitivity: 0.9246, specificity: 0.8564, ppv: 0.8482, f1: 0.8848 },
    MI: { auc: 0.9386395645388452, sensitivity: 0.7722, specificity: 0.9231, ppv: 0.7188, f1: 0.7445 },
    STTC: { auc: 0.9363538268123724, sensitivity: 0.8287, specificity: 0.8966, ppv: 0.7246, f1: 0.7732 },
    CD: { auc: 0.9282576677938473, sensitivity: 0.7088, specificity: 0.9518, ppv: 0.8248, f1: 0.7624 },
    HYP: { auc: 0.8452253901736934, sensitivity: 0.4933, specificity: 0.9367, ppv: 0.4867, f1: 0.49 },
  },
};
