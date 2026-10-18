import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ECG_CLASSES } from '../ai-service.client';
import { readEcgPredictions, readLeadII } from './ai-analysis-reports.service';
import {
  buildReportDocument,
  ecgStripSvg,
  type ReportInput,
} from './ai-report-template';
import {
  type CardioEvaluation,
  findCardioEvaluation,
  parseModelCardEvaluation,
} from './cardio-evaluation';

const SHA = '258e4e4de3c5b876b71bf172d335666ee75b3f5f0cae9806b1a71096e5a7b55a';
const OTHER_SHA = 'f'.repeat(64);
const THRESHOLDS = {
  CD: 0.8063817024230957,
  HYP: 0.8121039867401123,
  MI: 0.5788002014160156,
  NORM: 0.6407597661018372,
  STTC: 0.5284830927848816,
};

const classMetrics = (auc: number, sensitivity: number) => ({
  auc,
  f1: 0.7,
  ppv: 0.7,
  sensitivity,
  specificity: 0.9,
});

// The shape of models/cardio-ecg-resnet1d-ptbxl.json (its test part).
const modelCard = (sha = SHA) => ({
  classes: [...ECG_CLASSES],
  id: 'cardio-ecg-resnet1d-ptbxl-superdiagnostic',
  sha256: sha,
  test: {
    auc_macro: 0.9209861989546606,
    n_ecg: 2055,
    per_class: {
      CD: { ...classMetrics(0.928, 0.7088), threshold: THRESHOLDS.CD },
      HYP: { ...classMetrics(0.845, 0.4933), threshold: THRESHOLDS.HYP },
      MI: { ...classMetrics(0.939, 0.7722), threshold: THRESHOLDS.MI },
      NORM: { ...classMetrics(0.956, 0.9246), threshold: THRESHOLDS.NORM },
      STTC: { ...classMetrics(0.936, 0.8287), threshold: THRESHOLDS.STTC },
    },
  },
  weights_file: 'cardio-ecg-resnet1d-ptbxl.pt',
});

// The shape of evaluation/cardio-*.json (scripts/evaluate_cardio.py).
const serviceReport = (sha = SHA) => ({
  dataset: { fold: 10, nEcg: 2055 },
  file: 'cardio-2026-10-18-258e4e4d.json',
  generatedAt: '2026-10-18T12:00:00+00:00',
  metrics: { auc_macro: 0.9207, per_class: modelCard().test.per_class },
  pipeline: 'cardio-ecg',
  weights: {
    'cardio-ecg-resnet1d-ptbxl-superdiagnostic': { sha256: sha },
  },
});

describe('findCardioEvaluation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'healix-cardio-'));
  const paths = {
    evaluation: join(dir, 'cardio-latest.json'),
    modelCard: join(dir, 'cardio-ecg-resnet1d-ptbxl.json'),
  };
  const write = (path: string, json: unknown) =>
    writeFileSync(path, JSON.stringify(json));

  afterEach(() => {
    rmSync(paths.evaluation, { force: true });
    rmSync(paths.modelCard, { force: true });
  });
  afterAll(() => rmSync(dir, { force: true, recursive: true }));

  it("takes the service's evaluation of these weights first", async () => {
    write(paths.evaluation, serviceReport());
    write(paths.modelCard, modelCard());

    const evaluation = await findCardioEvaluation(paths, SHA);

    expect(evaluation).toMatchObject({
      aucMacro: 0.9207,
      file: 'cardio-2026-10-18-258e4e4d.json',
      nEcg: 2055,
      source: 'service',
      weightsSha256: SHA,
    });
  });

  it("falls back to the notebook's figures of the model card, marked as such", async () => {
    write(paths.evaluation, serviceReport(OTHER_SHA));
    write(paths.modelCard, modelCard());

    const evaluation = await findCardioEvaluation(paths, SHA);

    expect(evaluation).toMatchObject({
      aucMacro: 0.9209861989546606,
      file: 'cardio-ecg-resnet1d-ptbxl.json',
      generatedAt: null,
      source: 'notebook',
    });
    expect(evaluation?.perClass.HYP.sensitivity).toBe(0.4933);
  });

  it('describes no other weights, and survives missing or broken files', async () => {
    write(paths.modelCard, modelCard());
    await expect(findCardioEvaluation(paths, OTHER_SHA)).resolves.toBeNull();
    await expect(findCardioEvaluation(paths, null)).resolves.toBeNull();

    writeFileSync(paths.evaluation, '{ not json');
    rmSync(paths.modelCard);
    await expect(findCardioEvaluation(paths, SHA)).resolves.toBeNull();
  });

  it('refuses an incomplete card', () => {
    const card = modelCard();
    delete (card.test.per_class as Record<string, unknown>).HYP;
    expect(parseModelCardEvaluation(card, 'card.json')).toBeNull();
    expect(
      parseModelCardEvaluation({ ...modelCard(), id: 'other' }, 'card.json'),
    ).toBeNull();
  });
});

describe('the stored ECG, read for the report', () => {
  it('reads the predictions of a cardio run, in class order', () => {
    expect(
      readEcgPredictions({
        pipeline: 'cardio-ecg',
        predictions: {
          configSha256: 'd'.repeat(64),
          durationSeconds: 10,
          inputSamplingRate: 500,
          positive: ['STTC', 'MI'],
          probabilities: { CD: 0.1, HYP: 0.1, MI: 0.6, NORM: 0.1, STTC: 0.7 },
          thresholds: THRESHOLDS,
          windows: 1,
        },
      })?.positive,
    ).toEqual(['MI', 'STTC']);
    expect(
      readEcgPredictions({ pipeline: 'brain', predictions: [] }),
    ).toBeNull();
  });

  it('reads lead II of a trace file, null for anything else', () => {
    expect(
      readLeadII(
        Buffer.from(
          JSON.stringify({ leads: { II: [0.1, 0.2] }, samplingRate: 100 }),
        ),
      ),
    ).toEqual({ leadII: [0.1, 0.2], samplingRate: 100 });
    expect(readLeadII(Buffer.from('not json'))).toBeNull();
    expect(readLeadII(Buffer.from('{"leads":{}}'))).toBeNull();
  });
});

describe('ecgStripSvg (25 mm/s, 10 mm/mV)', () => {
  it('draws 5 s at 100 Hz on 125 mm after the calibration, with the 1 mV pulse 10 mm high', () => {
    const samples = Array.from({ length: 500 }, () => 0);
    const svg = ecgStripSvg(samples, 100, 0);

    // 10 mm of calibration + 125 mm of trace.
    expect(svg).toContain('width="135mm"');
    // Baseline and 1 mV, 10 mm apart.
    const pulse = /d="M1,([\d.]+) H2 V([\d.]+) H7/.exec(svg);
    expect(pulse).not.toBeNull();
    expect(Number(pulse?.[1]) - Number(pulse?.[2])).toBeCloseTo(10);
    // The last sample at 10 + 499 × 0.25 mm.
    expect(svg).toContain(`134.75,${pulse?.[1]}`);
  });
});

const ecgTrace = Array.from({ length: 1000 }, (_, sample) =>
  Number((Math.sin(sample / 6) * 0.9).toFixed(3)),
);

function cardioInput(
  evaluation: CardioEvaluation | null,
  run: Partial<ReportInput['run']> = {},
): ReportInput {
  return {
    breakhisEvaluation: null,
    cardioEvaluation: evaluation,
    decidedBy: {
      fullName: 'Samir Ouali',
      role: 'physician',
      speciality: 'Cardiologie',
    },
    ecgTrace: { leadII: ecgTrace, samplingRate: 100, sha256: '3'.repeat(64) },
    editedAt: new Date('2026-10-18T11:00:00Z'),
    evaluation: null,
    fonts: {
      bold: Buffer.from('b'),
      regular: Buffer.from('r'),
      semibold: Buffer.from('s'),
    },
    mask: null,
    overlay: null,
    pannukeEvaluation: null,
    patient: {
      birthDate: new Date('1961-01-15T00:00:00Z'),
      firstName: 'Rachid',
      gender: 'MALE',
      hospitalRecordNumber: 'HC-2026-01200',
      id: 'patient-c',
      lastName: 'Benali',
    },
    reportNumber: 'CR-IA-2026-000099',
    requestedBy: {
      fullName: 'Samir Ouali',
      role: 'physician',
      speciality: 'Cardiologie',
    },
    run: {
      classificationModelId: 'cardio-ecg-resnet1d-ptbxl-superdiagnostic',
      classificationWeightsSha256: SHA,
      clinicianImpression: 'Douleur thoracique atypique.',
      createdAt: new Date('2026-10-18T10:00:00Z'),
      decidedAt: new Date('2026-10-18T10:30:00Z'),
      decisionLabel: null,
      decisionLabels: ['MI', 'STTC'],
      decisionReason: null,
      decisionStatus: 'VALIDATED',
      decisionThreshold: null,
      durationMs: 140,
      ecg: {
        configSha256: 'd'.repeat(64),
        durationSeconds: 30,
        inputSamplingRate: 500,
        positive: ['MI', 'STTC'],
        probabilities: { CD: 0.1, HYP: 0.05, MI: 0.83, NORM: 0.04, STTC: 0.61 },
        thresholds: THRESHOLDS,
        windows: 5,
      },
      id: 'run-ecg',
      magnification: null,
      malignancyScore: null,
      maskAreaPx: null,
      maskAreaRatio: null,
      modelDecision: null,
      nucleiFractions: null,
      pipeline: 'cardio-ecg',
      predictions: [],
      segmentationModelId: null,
      segmentationSkippedReason: null,
      segmentationWeightsSha256: null,
      tileCount: null,
      ttaScores: null,
      ...run,
    },
    sourceDocument: {
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-10-18T09:50:00Z'),
      data: Buffer.from('I,II\n'),
      height: null,
      mimeType: 'text/csv',
      originalName: 'ecg-repos.csv',
      width: null,
    },
    structure: { kind: 'unknown' },
  };
}

const notebookEvaluation = parseModelCardEvaluation(
  modelCard(),
  'cardio-ecg-resnet1d-ptbxl.json',
) as CardioEvaluation;
const textOf = (input: ReportInput) =>
  buildReportDocument(input).html.replace(/\s+/g, ' ');

describe('the cardiology report', () => {
  it('prints the 5 classes with probability, threshold and result, and the kept classes', () => {
    const html = textOf(cardioInput(notebookEvaluation));

    expect(html).toContain("Compte rendu d'électrocardiogramme analysé par IA");
    for (const name of [
      'ECG normal (NORM)',
      'Infarctus du myocarde (MI)',
      'Trouble ST/T (STTC)',
      'Trouble de la conduction (CD)',
      'Hypertrophie (HYP)',
    ]) {
      expect(html).toContain(name);
    }
    expect(html).toContain(
      '<td class="num">83,0 %</td><td class="num">57,9 %</td><td>Positif</td>',
    );
    expect(html).toContain(
      '<td class="num">5,0 %</td><td class="num">81,2 %</td><td>Négatif</td>',
    );
    expect(html).toMatch(
      /Classes retenues.*Infarctus du myocarde \(MI\).*Trouble ST\/T \(STTC\)/,
    );
    expect(html).toContain('12 dérivations, 30,0 s à 500 Hz');
    expect(html).toContain(`Poids SHA-256 : ${SHA}`);
  });

  it('draws lead II as vectors on ECG paper, in two strips of 5 s', () => {
    const html = buildReportDocument(cardioInput(notebookEvaluation)).html;

    expect(html.match(/<svg class="ecg-strip"/g)).toHaveLength(2);
    expect(html.match(/<polyline class="trace"/g)).toHaveLength(2);
    expect(html).toContain('25 mm/s, 10 mm/mV');
    // No raster image of the signal.
    expect(html).not.toContain('data:text/csv');
  });

  it("marks the notebook's figures as such, and the service's with their date", () => {
    expect(textOf(cardioInput(notebookEvaluation))).toContain(
      "Mesures du notebook d'entraînement sur le pli 10 de PTB-XL (2 055 ECG)",
    );
    const service: CardioEvaluation = {
      ...notebookEvaluation,
      file: 'cardio-2026-10-18-258e4e4d.json',
      generatedAt: '2026-10-18T12:00:00+00:00',
      source: 'service',
    };
    expect(textOf(cardioInput(service))).toContain(
      "par le service d'analyse lui-même",
    );
    expect(textOf(cardioInput(null))).toContain(
      'Performances non mesurées pour ces poids (empreinte 258e4e4d).',
    );
    // Figures of other weights are never printed.
    expect(
      textOf(cardioInput({ ...notebookEvaluation, weightsSha256: OTHER_SHA })),
    ).toContain('Performances non mesurées');
  });

  it('prints a correction to no class, and never an urgency nor a course of action', () => {
    const html = textOf(
      cardioInput(notebookEvaluation, {
        decisionLabels: ['NORM'],
        decisionReason: 'Tracé normal à la relecture.',
        decisionStatus: 'CORRECTED',
      }),
    );

    expect(html).toContain('Résultat corrigé');
    expect(html).toContain('ECG normal (NORM)');
    expect(html).toContain('Aide à la décision');
    for (const word of [
      'urgence',
      'urgent',
      'consulter',
      'orienter',
      'recommand',
    ]) {
      expect(html.toLowerCase()).not.toContain(word);
    }
  });

  it('fingerprints the trace it drew', () => {
    const first = buildReportDocument(cardioInput(notebookEvaluation));
    const other = cardioInput(notebookEvaluation);
    other.ecgTrace = {
      ...(other.ecgTrace as NonNullable<ReportInput['ecgTrace']>),
      sha256: '4'.repeat(64),
    };
    expect(buildReportDocument(other).contentSha256).not.toBe(
      first.contentSha256,
    );
  });
});
