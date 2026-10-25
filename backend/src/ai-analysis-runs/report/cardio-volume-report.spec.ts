import { type ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSha256Checksum } from '../../common/utils/checksum.util';
import { type PatientFileStorageService } from '../../patients/documents/patient-file-storage.service';
import { type PatientAuditService } from '../../patients/patient-audit.service';
import { type PatientsService } from '../../patients/patients.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { LVEF_CLASS_SOURCE } from '../volumetry/volumetry-measures';
import {
  CARDIO_VOLUME_WEIGHTS,
  cardioVolumeResult,
  PNG,
} from '../volumetry/cardio-volume.fixtures';
import { applyCorrection, buildVolumetry } from '../volumetry/volumetry';
import {
  AiAnalysisReportsService,
  pickFigureSlices,
  readDicomSeries,
} from './ai-analysis-reports.service';
import { type AiReportRenderer } from './ai-report-renderer';
import {
  buildReportDocument,
  type ReportInput,
  type ReportVolumetry,
  volumeCurveSvg,
} from './ai-report-template';
import {
  type CardioVolumeEvaluation,
  parseServiceEvaluation,
} from './cardio-volume-evaluation';
import { findEvaluation } from './model-evaluation';

const OVERLAY = Buffer.concat([PNG, Buffer.from('overlay')]);

const evaluation: CardioVolumeEvaluation = {
  file: 'cardio-volume-2026-10-25-aaaaaaaa.json',
  generatedAt: '2026-10-25T10:00:00+00:00',
  lvef: {
    bias: -0.4,
    limitsOfAgreement: [-7.5, 6.7],
    mae: 3.1,
    n: 22,
    pearsonR: 0.95,
  },
  nPatients: 22,
  rvef: {
    bias: 1.2,
    limitsOfAgreement: [-10.1, 12.5],
    mae: 5.4,
    n: 21,
    pearsonR: 0.83,
  },
  source: 'service',
  weightsSha256: CARDIO_VOLUME_WEIGHTS,
};

function stack(options: {
  bsaM2?: number | null;
  correction?: Parameters<typeof applyCorrection>[1];
  evaluation?: CardioVolumeEvaluation | null;
  heartRateBpm?: number | null;
  series?: ReportVolumetry['series'];
  warnings?: { code: string }[];
}): ReportVolumetry {
  const base = buildVolumetry(
    cardioVolumeResult({
      bsaM2: options.bsaM2,
      heartRateBpm: options.heartRateBpm,
      warnings: options.warnings,
    }),
  );
  return {
    configSha256: 'b'.repeat(64),
    evaluation:
      options.evaluation === undefined ? evaluation : options.evaluation,
    figures: (['ed', 'es'] as const).flatMap((phase) =>
      [0, 3, 5].map((slice) => ({
        height: 256,
        image: { data: PNG, sha256: '1'.repeat(64) },
        overlay: { data: OVERLAY, sha256: '2'.repeat(64) },
        phase,
        slice,
        width: 216,
      })),
    ),
    series: options.series === undefined ? null : options.series,
    volumetry: options.correction
      ? applyCorrection(base, options.correction)
      : base,
  };
}

function volumeInput(
  volumetry: ReportVolumetry,
  overrides: Partial<ReportInput['run']> = {},
): ReportInput {
  return {
    breakhisEvaluation: null,
    cardioEvaluation: null,
    decidedBy: {
      fullName: 'Samir Ouali',
      role: 'physician',
      speciality: 'Cardiologie',
    },
    ecgTrace: null,
    editedAt: new Date('2026-10-25T11:00:00Z'),
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
      hospitalRecordNumber: null,
      id: 'patient-c',
      lastName: 'Benali',
    },
    reportNumber: 'CR-IA-2026-000130',
    requestedBy: {
      fullName: 'Samir Ouali',
      role: 'physician',
      speciality: 'Cardiologie',
    },
    run: {
      classificationModelId: null,
      classificationWeightsSha256: null,
      clinicianImpression: null,
      createdAt: new Date('2026-10-25T10:00:00Z'),
      decidedAt: new Date('2026-10-25T10:30:00Z'),
      decisionLabel: null,
      decisionLabels: null,
      decisionReason: null,
      decisionStatus: 'VALIDATED',
      decisionThreshold: null,
      durationMs: 31_000,
      ecg: null,
      id: 'run-cine',
      magnification: null,
      malignancyScore: null,
      maskAreaPx: null,
      maskAreaRatio: null,
      modelDecision: null,
      nucleiFractions: null,
      pipeline: 'cardio-volume-mri',
      predictions: [],
      segmentationModelId: 'cardio-seg-acdc-unet-effb4',
      segmentationSkippedReason: null,
      segmentationWeightsSha256: CARDIO_VOLUME_WEIGHTS,
      tileCount: null,
      ttaScores: null,
      ...overrides,
    },
    slice: null,
    sourceDocument: {
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-10-25T09:50:00Z'),
      data: Buffer.alloc(0),
      height: null,
      mimeType: 'application/zip',
      originalName: 'serie-5-cine.zip',
      width: null,
    },
    structure: { kind: 'unknown' },
    volumetry,
  };
}

// The text as read: spaces collapsed, the escaped apostrophes read back.
const htmlOf = (input: ReportInput) =>
  buildReportDocument(input).html.replace(/\s+/g, ' ').replaceAll('&#39;', "'");

describe('the cardiac cine volumetry report', () => {
  it('prints the measures in force, the ESC class with its source, the curve and the images', () => {
    const html = htmlOf(volumeInput(stack({ series: null })));

    expect(html).toContain(
      'Compte rendu de volumétrie cardiaque (IRM ciné) analysée par IA',
    );
    // 5 phases of 6 slices, 8 mm apart; ED and ES chosen by the model.
    expect(html).toContain('5 phases × 6 coupes');
    expect(html).toContain('8,00 mm (distance entre les positions successives');
    // LV: 43.2 / 26.784 / 16.416 ml, 38 %, 34 g (rounded when shown).
    for (const cell of [
      '<td class="num">43 ml</td>',
      '<td class="num">27 ml</td>',
      '<td class="num">16 ml</td>',
      '<td class="num">38 %</td>',
      '<td class="num">34 g</td>',
      '<td class="num">1,1 L/min</td>',
      // RV.
      '<td class="num">49 ml</td>',
      '<td class="num">19 %</td>',
    ]) {
      expect(html).toContain(cell);
    }
    // Indexed with the body surface of the DICOM (1.9 m²).
    expect(html).toContain('Indexée (par m² de surface corporelle)');
    expect(html).toContain('<td class="num">23 ml/m²</td>');
    expect(html).toContain('1,90 m² (Mosteller, taille et poids du DICOM)');
    expect(html).toContain('70 bpm (DICOM)');
    expect(html).toContain(
      'Télédiastole : phase 1 ; télésystole : phase 4 (sur 5), choisies par le modèle',
    );

    // The class, named as the guidelines do, with the guidelines.
    expect(html).toContain(
      "FEVG 38 % — classe ESC 2021 : fraction d'éjection réduite (≤ 40 %).",
    );
    expect(html).toContain('McDonagh');
    expect(html).toContain('doi:10.1093/eurheartj/ehab368');
    expect(html).toContain('ne constitue pas un diagnostic');

    // The curve: 5 points, ED and ES marked.
    expect(html).toContain('<svg class="curve"');
    expect(
      html.match(/<polyline class="line" points="([^"]+)"/)?.[1].split(' '),
    ).toHaveLength(5);
    expect(html).toContain('>TD</text>');
    expect(html).toContain('>TS</text>');
    // Six thumbnails: ED and ES, three slices each, numbered from the base.
    expect(html.match(/<figure class="thumb">/g)).toHaveLength(6);
    expect(html).toContain('Télédiastole, phase 1, coupe 1/6');
    expect(html).toContain('Télésystole, phase 4, coupe 6/6');
    expect(html).toContain('Mesures validées');
    expect(html).toContain('Aide à la mesure');
  });

  it('shows the proposal of the model next to the measures the physician corrected', () => {
    const html = htmlOf(
      volumeInput(stack({ correction: { esPhase: 1, excludedSlices: [0] } }), {
        decisionReason: 'Télésystole décalée, coupe basale exclue.',
        decisionStatus: 'CORRECTED',
      }),
    );

    expect(html).toContain('Mesures corrigées par le médecin');
    expect(html).toContain('Télésystole décalée, coupe basale exclue.');
    expect(html).toContain('Proposition du modèle');
    // Retained: ED 31.2 ml; the model proposed 43.2 ml.
    expect(html).toContain('<td class="num">31 ml</td><td');
    expect(html).toContain('<td class="num">43 ml</td></tr>');
    expect(html).toContain(
      "Le modèle proposait les phases 1 et 4 ; les mesures ont été corrigées par le médecin, sans nouvelle analyse d'image.",
    );
    expect(html).toContain(
      'Coupes exclues du calcul (numérotées depuis la base) : 1.',
    );
    // The images are the model's phases, not the retained ones.
    expect(html).toContain(
      'Les images montrent les phases proposées par le modèle (télédiastole : phase 1, télésystole : phase 4)',
    );
    expect(html).toContain('Mesures retenues');
  });

  it('prints neither the indexed values nor the cardiac output when their data is missing', () => {
    const html = htmlOf(
      volumeInput(stack({ bsaM2: null, heartRateBpm: null })),
    );

    expect(html).not.toContain('Indexée');
    expect(html).not.toContain('Débit cardiaque</td>');
    expect(html).toContain('Non renseignée : valeurs non indexées');
    expect(html).toContain('Non renseignée : pas de débit cardiaque');
  });

  it('says that a height and a weight typed by the physician were not kept', () => {
    const html = htmlOf(
      volumeInput(
        stack({ bsaM2: null, correction: { heightCm: 171, weightKg: 73 } }),
      ),
    );
    expect(html).toContain(
      'taille et poids saisis par le médecin, non conservés',
    );
    expect(html).not.toContain('171');
    expect(html).not.toContain(' 73 ');
    // A body surface alone is no correction.
    expect(html).toContain('Mesures validées');
    expect(html).not.toContain('Proposition du modèle');
  });

  it('lists what is to be checked: the order of the slices, the service warnings, ES above ED', () => {
    const warnings = htmlOf(
      volumeInput(
        stack({
          warnings: [
            {
              code: 'irregular_slice_spacing',
              maxMm: 10,
              medianMm: 8,
              minMm: 6,
            } as never,
            { code: 'slice_order_uncertain' },
            { code: 'a_future_warning' },
          ],
        }),
      ),
    );
    expect(warnings).toContain('<strong>À vérifier</strong>');
    expect(warnings).toContain('ne disent pas dans quel sens vont les coupes');
    expect(warnings).toContain(
      'Pas entre les coupes irrégulier (de 6 à 10 mm, médiane 8 mm)',
    );
    expect(warnings).toContain(
      'déduit de la taille de la cavité du VG, sans certitude',
    );
    expect(warnings).toContain('Avertissement du service : a_future_warning.');

    // ED and ES swapped by the physician: the volume at ES exceeds the one at ED.
    const swapped = htmlOf(
      volumeInput(stack({ correction: { edPhase: 3, esPhase: 0 } })),
    );
    expect(swapped).toContain(
      'Le volume télésystolique dépasse le volume télédiastolique',
    );
  });

  it('prints the performances measured on the test patients for these weights only', () => {
    const html = htmlOf(volumeInput(stack({})));
    expect(html).toContain('Mesurées le');
    expect(html).toContain(
      "sur 22 patients ACDC jamais vus à l'entraînement (rapport cardio-volume-2026-10-25-aaaaaaaa.json)",
    );
    expect(html).toContain('FEVG : erreur absolue moyenne 3,1 point');
    expect(html).toContain("limites d'accord à 95 %");
    expect(html).toContain('r de Pearson 0,95 (n = 22)');
    expect(html).toContain('FEVD : erreur absolue moyenne 5,4 point');

    const other = htmlOf(
      volumeInput(
        stack({ evaluation: { ...evaluation, weightsSha256: 'f'.repeat(64) } }),
      ),
    );
    expect(other).toContain('Performances non mesurées pour ces poids');
    expect(other).not.toContain('erreur absolue moyenne');

    const none = htmlOf(volumeInput(stack({ evaluation: null })));
    expect(none).toContain('Performances non mesurées pour ces poids');
  });

  it('states its limits, and gives no diagnosis nor course of action', () => {
    const html = htmlOf(volumeInput(stack({})));
    expect(html).toContain('Segmentation 2D, coupe par coupe');
    expect(html).toContain('aucune validation sur des IRM algériennes');
    expect(html).toContain('Modèle non certifié comme dispositif médical');

    // Apart from the title of the guidelines the class is read from.
    const lowered = html
      .toLowerCase()
      .replaceAll(LVEF_CLASS_SOURCE.toLowerCase(), '');
    for (const word of [
      'urgence',
      'urgent',
      'recommand',
      'diagnostic de',
      'cardiomyopathie',
      'insuffisance',
      'thérap',
      'prise en charge',
      'pronostic',
    ]) {
      expect(lowered).not.toContain(word);
    }
  });

  it('names the series the archive was made from, escaped', () => {
    const html = htmlOf(
      volumeInput(
        stack({
          series: {
            description: 'SA <script>alert(1)</script>',
            instances: 250,
            number: 5,
          },
        }),
      ),
    );
    expect(html).toContain(
      'Série 5 (SA &lt;script&gt;alert(1)&lt;/script&gt;) — 250 images',
    );
    expect(html).not.toContain('<script>');
  });

  it('is certified by a fingerprint of the measures and the images', () => {
    const fingerprint = (input: ReportInput) =>
      buildReportDocument(input).contentSha256;
    const plain = volumeInput(stack({}));

    expect(fingerprint(plain)).toBe(fingerprint(volumeInput(stack({}))));
    expect(fingerprint(plain)).not.toBe(
      fingerprint(volumeInput(stack({ correction: { esPhase: 1 } }))),
    );
    const otherImage = stack({});
    otherImage.figures[0].image.sha256 = '9'.repeat(64);
    expect(fingerprint(plain)).not.toBe(fingerprint(volumeInput(otherImage)));
    expect(fingerprint(plain)).not.toBe(
      fingerprint(volumeInput(stack({ evaluation: null }))),
    );
  });
});

describe('volumeCurveSvg', () => {
  it('draws every phase and marks ED and ES on the curve', () => {
    const svg = volumeCurveSvg([120, 100, 70, 60, 90], 0, 3);
    const points = svg.match(/points="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(points).toHaveLength(5);
    // The volume falls from ED (first point, highest on the page: smallest y).
    const y = points.map((point) => Number(point.split(',')[1]));
    expect(y[0]).toBeLessThan(y[3]);
    expect(svg.match(/class="marker"/g)).toHaveLength(2);
    expect(svg).not.toContain('NaN');
  });

  it('copes with a flat curve and a very long cine', () => {
    expect(volumeCurveSvg([0, 0, 0], 0, 1)).not.toContain('NaN');
    const long = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 20);
    const svg = volumeCurveSvg(long, 0, 12);
    expect(svg).not.toContain('NaN');
    // Not a label per phase when there are so many.
    expect(svg.match(/class="tick" x="[\d.]+" y="56.5"/g)?.length).toBeLessThan(
      30,
    );
  });
});

describe('the figures of the report', () => {
  it('shows the basal, the middle and the apical slices of those kept', () => {
    expect(pickFigureSlices(6, [])).toEqual([0, 3, 5]);
    expect(pickFigureSlices(12, [])).toEqual([0, 6, 11]);
    expect(pickFigureSlices(6, [0])).toEqual([1, 3, 5]);
    expect(pickFigureSlices(3, [])).toEqual([0, 1, 2]);
    expect(pickFigureSlices(4, [])).toEqual([0, 2, 3]);
    expect(pickFigureSlices(6, [0, 1, 2])).toEqual([3, 4, 5]);
  });

  it('reads the series of the document, defensively', () => {
    expect(
      readDicomSeries({ description: 'SA', instances: 250, seriesNumber: 5 }),
    ).toEqual({ description: 'SA', instances: 250, number: 5 });
    expect(readDicomSeries({ instances: 10 })).toEqual({
      description: null,
      instances: 10,
      number: null,
    });
    for (const value of [null, undefined, 'x', [], {}, { instances: 'many' }]) {
      expect(readDicomSeries(value)).toBeNull();
    }
  });
});

describe('the evaluation of the volumetry', () => {
  const report = (sha = CARDIO_VOLUME_WEIGHTS) => ({
    dataset: { nPatients: 22, testPatients: [1, 2, 3] },
    file: evaluation.file,
    generatedAt: '2026-10-25T10:00:00+00:00',
    metrics: {
      lvef: {
        bias: -0.4,
        limitsOfAgreement: [-7.5, 6.7],
        mae: 3.1,
        n: 22,
        pearsonR: 0.95,
        sdOfDifferences: 3.6,
        undefined: 0,
        unit: 'percentage points',
      },
      rvef: {
        bias: 1.2,
        limitsOfAgreement: [-10.1, 12.5],
        mae: 5.4,
        n: 21,
        pearsonR: null,
        undefined: 1,
        unit: 'percentage points',
      },
    },
    pipeline: 'cardio-volume-mri',
    weights: { 'cardio-seg-acdc-unet-effb4': { sha256: sha } },
  });

  it('reads the report evaluate_cardio_volume.py writes', () => {
    expect(parseServiceEvaluation(report())).toMatchObject({
      lvef: { bias: -0.4, limitsOfAgreement: [-7.5, 6.7], mae: 3.1, n: 22 },
      nPatients: 22,
      rvef: { n: 21, pearsonR: null },
      source: 'service',
      weightsSha256: CARDIO_VOLUME_WEIGHTS,
    });
  });

  it('reads nothing from an incomplete or foreign report', () => {
    const complete = report();
    for (const broken of [
      null,
      {},
      { ...complete, pipeline: 'cardio-seg-mri' },
      { ...complete, file: undefined },
      { ...complete, generatedAt: 'yesterday' },
      { ...complete, weights: {} },
      {
        ...complete,
        weights: { 'cardio-seg-acdc-unet-effb4': { sha256: 'x' } },
      },
      { ...complete, metrics: { lvef: complete.metrics.lvef } },
      {
        ...complete,
        metrics: {
          ...complete.metrics,
          rvef: { ...complete.metrics.rvef, n: 0 },
        },
      },
      { ...complete, dataset: {} },
    ]) {
      expect(parseServiceEvaluation(broken)).toBeNull();
    }
  });

  it('is found for its own weights only, and the model card has no figure for it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'healix-volume-eval-'));
    const paths = {
      evaluation: join(dir, 'cardio-volume-latest.json'),
      modelCard: join(dir, 'card.json'),
    };
    const find = (sha: string | null) =>
      findEvaluation(paths, sha, parseServiceEvaluation, () => null);
    try {
      // No file yet: no figure.
      await expect(find(CARDIO_VOLUME_WEIGHTS)).resolves.toBeNull();
      writeFileSync(paths.evaluation, JSON.stringify(report()));
      await expect(find(CARDIO_VOLUME_WEIGHTS)).resolves.toMatchObject({
        nPatients: 22,
      });
      await expect(find('f'.repeat(64))).resolves.toBeNull();
      await expect(find(null)).resolves.toBeNull();
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe('AiAnalysisReportsService, the report of a cine volumetry run', () => {
  const runFindFirst = jest.fn();
  const readStoredFile = jest.fn();
  const readAiVolumetryImage = jest.fn();
  const storeAiReport = jest.fn();
  const render = jest.fn();
  const reportCreate = jest.fn();
  const clinicalReportCreate = jest.fn();

  const prisma = {
    $transaction: (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        aiAnalysisReport: { create: reportCreate },
        clinicalReport: { create: clinicalReportCreate },
      }),
    aiAnalysisReport: {
      create: reportCreate,
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    aiAnalysisRun: { findFirst: runFindFirst },
  };
  const evaluationDir = mkdtempSync(join(tmpdir(), 'healix-volume-report-'));
  const evaluationPath = join(evaluationDir, 'cardio-volume-latest.json');
  const service = new AiAnalysisReportsService(
    prisma as unknown as PrismaService,
    {
      getPatientInScope: jest.fn().mockResolvedValue({}),
    } as unknown as PatientsService,
    {
      deleteLocalFile: jest.fn(),
      readAiVolumetryImage,
      readStoredFile,
      storeAiReport,
    } as unknown as PatientFileStorageService,
    {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PatientAuditService,
    { render } as unknown as AiReportRenderer,
    {
      get: (key: string) =>
        key === 'AI_CARDIO_VOLUME_EVALUATION_PATH' ? evaluationPath : undefined,
    } as unknown as ConfigService,
  );

  afterAll(() => rmSync(evaluationDir, { force: true, recursive: true }));

  const volumetryJson = (
    correction?: Parameters<typeof applyCorrection>[1],
  ) => {
    const volumetry = buildVolumetry(cardioVolumeResult());
    return JSON.parse(
      JSON.stringify(
        correction ? applyCorrection(volumetry, correction) : volumetry,
      ),
    ) as unknown;
  };

  const volumeRun = (overrides: Record<string, unknown> = {}) => ({
    classificationModelId: null,
    classificationWeightsSha256: null,
    clinicianImpression: null,
    createdAt: new Date('2026-10-25T10:00:00Z'),
    decidedAt: new Date('2026-10-25T10:30:00Z'),
    decidedBy: {
      doctorProfile: { speciality: 'Cardiologie' },
      fullName: 'Samir Ouali',
      id: 'doctor-a',
      role: 'INDEPENDENT_DOCTOR',
    },
    decidedById: 'doctor-a',
    decisionLabel: null,
    decisionLabels: null,
    decisionReason: null,
    decisionStatus: 'VALIDATED',
    durationMs: 31_000,
    id: 'run-cine',
    maskPath: '/uploads/patients/patient-a/ai-masks/run-cine-volumetry',
    overlayPath: null,
    patient: {
      birthDate: new Date('1961-01-15T00:00:00Z'),
      doctorProfile: null,
      establishment: null,
      firstName: 'Rachid',
      gender: 'MALE',
      hospitalRecordNumber: null,
      id: 'patient-a',
      lastName: 'Benali',
      workspace: null,
      workspaceId: 'workspace-a',
    },
    patientId: 'patient-a',
    pipeline: 'cardio-volume-mri',
    predictions: { configSha256: 'b'.repeat(64) },
    requestedBy: {
      doctorProfile: null,
      fullName: 'Samir Ouali',
      id: 'doctor-a',
      role: 'INDEPENDENT_DOCTOR',
    },
    segmentationModelId: 'cardio-seg-acdc-unet-effb4',
    segmentationWeightsSha256: CARDIO_VOLUME_WEIGHTS,
    slicePath: null,
    sourceDocument: {
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-10-25T09:50:00Z'),
      dicomSeries: { description: 'SA cine', instances: 30, seriesNumber: 5 },
      dicomStudyId: 'study-a',
      instanceNumber: null,
      localPath: '/uploads/patients/patient-a/documents/stack.zip',
      mimeType: 'application/zip',
      originalName: 'serie-5-cine.zip',
      seriesNumber: 5,
      sopInstanceUid: null,
    },
    status: 'SUCCEEDED',
    volumetry: volumetryJson(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    render.mockImplementation(({ html }: { html: string }) =>
      Promise.resolve(
        Buffer.from(`%PDF-1.7 ${createSha256Checksum(Buffer.from(html))}`),
      ),
    );
    readAiVolumetryImage.mockResolvedValue(PNG);
    storeAiReport.mockImplementation(({ pdf }: { pdf: Buffer }) =>
      Promise.resolve({
        checksum: createSha256Checksum(pdf),
        localPath: '/uploads/report.pdf',
      }),
    );
    reportCreate.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ createdAt: new Date(), id: 'report-1', ...data }),
    );
    clinicalReportCreate.mockResolvedValue(undefined);
  });

  it('is made without reading the archive nor a folder as a file, from 3 slices at ED and ES', async () => {
    runFindFirst.mockResolvedValue(volumeRun());

    const served = await service.getReport(
      {
        email: 'a@b.dz',
        role: 'INDEPENDENT_DOCTOR',
        sub: 'doctor-a',
        tokenType: 'access',
      } as never,
      'patient-a',
      'run-cine',
    );

    expect(served.pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Neither the archive (large, not an image) nor the folder of the images.
    expect(readStoredFile).not.toHaveBeenCalled();
    const names = readAiVolumetryImage.mock.calls.map(
      (call: unknown[]) => call[1],
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'slice-ed-000.png',
        'label-ed-003.png',
        'slice-es-005.png',
      ]),
    );
    expect(names).toHaveLength(12);
    const html = (render.mock.lastCall as [{ html: string }])[0].html;
    expect(html).toContain('Série 5 (SA cine) — 30 images');
    expect(html.match(/<figure class="thumb">/g)).toHaveLength(6);
    // The row of the clinical reports center: the cardiac MRI category.
    expect(clinicalReportCreate.mock.lastCall).toMatchObject([
      {
        data: {
          category: 'AI_CARDIAC_MRI',
          title: 'Compte rendu IA — Volumétrie cardiaque (IRM ciné)',
        },
      },
    ]);
  });

  it('prints the corrected measures and the evaluation of these weights when the file exists', async () => {
    writeFileSync(
      evaluationPath,
      JSON.stringify({
        dataset: { nPatients: 22, testPatients: [] },
        file: evaluation.file,
        generatedAt: '2026-10-25T10:00:00+00:00',
        metrics: { lvef: evaluation.lvef, rvef: evaluation.rvef },
        pipeline: 'cardio-volume-mri',
        weights: {
          'cardio-seg-acdc-unet-effb4': { sha256: CARDIO_VOLUME_WEIGHTS },
        },
      }),
    );
    runFindFirst.mockResolvedValue(
      volumeRun({
        decisionReason: 'Télésystole décalée.',
        decisionStatus: 'CORRECTED',
        volumetry: volumetryJson({ esPhase: 1 }),
      }),
    );

    await service.getReport(
      {
        email: 'a@b.dz',
        role: 'INDEPENDENT_DOCTOR',
        sub: 'doctor-a',
        tokenType: 'access',
      } as never,
      'patient-a',
      'run-cine',
    );

    const html = (render.mock.lastCall as [{ html: string }])[0].html;
    expect(html).toContain('Mesures corrigées par le médecin');
    expect(html).toContain('Proposition du modèle');
    expect(html).toContain('erreur absolue moyenne');
  });

  it('fails cleanly, storing nothing, for a run without volumetry', async () => {
    runFindFirst.mockResolvedValue(volumeRun({ volumetry: null }));
    await expect(
      service.getReport(
        {
          email: 'a@b.dz',
          role: 'INDEPENDENT_DOCTOR',
          sub: 'doctor-a',
          tokenType: 'access',
        } as never,
        'patient-a',
        'run-cine',
      ),
    ).rejects.toMatchObject({
      response: { code: 'AI_REPORT_RENDER_FAILED' },
    });
    expect(storeAiReport).not.toHaveBeenCalled();
  });
});
