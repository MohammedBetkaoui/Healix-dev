import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readCardioSegPredictions } from './ai-analysis-reports.service';
import { buildReportDocument, type ReportInput } from './ai-report-template';
import {
  type CardioSegEvaluation,
  parseModelCardEvaluation,
  parseServiceEvaluation,
} from './cardio-seg-evaluation';
import { CARDIO_SEG_PALETTE } from './cardio-seg-palette';
import { findEvaluation } from './model-evaluation';

const REPO = join(__dirname, '../../../..');
// The card committed with the ai-service tests: the deployed one (checked there).
const CARD = JSON.parse(
  readFileSync(
    join(REPO, 'ai-service/tests/fixtures/cardio-seg/model-card.json'),
    'utf8',
  ),
) as Record<string, unknown> & { sha256: string };
const SHA = CARD.sha256;
const OTHER_SHA = 'f'.repeat(64);

describe('the cardiac MRI palette', () => {
  it('is the one the ai-service draws the overlay with', () => {
    expect(CARDIO_SEG_PALETTE).toEqual(
      JSON.parse(
        readFileSync(
          join(REPO, 'ai-service/app/cardio_seg_palette.json'),
          'utf8',
        ),
      ),
    );
  });
});

describe('cardiac MRI evaluation', () => {
  const serviceReport = (sha = SHA) => ({
    dataset: {
      nVolumes: 44,
      testPatients: Array.from({ length: 22 }, (_, i) => i),
    },
    file: 'cardio-seg-2026-10-19-252fb672.json',
    generatedAt: '2026-10-19T12:00:00+00:00',
    metrics: {
      mean: 0.9012,
      perClass: {
        LV: { mean: 0.934, n: 44, std: 0.05 },
        MYO: { mean: 0.879, n: 44, std: 0.03 },
        RV: { mean: 0.891, n: 44, std: 0.08 },
      },
    },
    pipeline: 'cardio-seg-mri',
    weights: { 'cardio-seg-acdc-unet-effb4': { sha256: sha } },
  });

  it("reads the card's test: 44 volumes of 22 patients", () => {
    const card = parseModelCardEvaluation(
      CARD,
      'cardio-seg-acdc-unet-effb4.json',
    );
    expect(card).toMatchObject({
      nVolumes: 44,
      source: 'notebook',
      testPatients: 22,
      weightsSha256: SHA,
    });
    expect(card?.meanDice).toBeCloseTo(0.903, 3);
    expect(card?.perClass.LV.std).not.toBeNull();
  });

  it("prefers the service's evaluation of these weights, else the card's, else nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'healix-mri-eval-'));
    const paths = {
      evaluation: join(dir, 'cardio-seg-latest.json'),
      modelCard: join(dir, 'card.json'),
    };
    const find = (sha: string | null) =>
      findEvaluation(
        paths,
        sha,
        parseServiceEvaluation,
        parseModelCardEvaluation,
      );
    try {
      writeFileSync(paths.modelCard, JSON.stringify(CARD));
      writeFileSync(paths.evaluation, JSON.stringify(serviceReport()));
      await expect(find(SHA)).resolves.toMatchObject({
        meanDice: 0.9012,
        source: 'service',
      });
      writeFileSync(paths.evaluation, JSON.stringify(serviceReport(OTHER_SHA)));
      await expect(find(SHA)).resolves.toMatchObject({
        file: 'card.json',
        source: 'notebook',
      });
      await expect(find(OTHER_SHA)).resolves.toMatchObject({
        source: 'service',
      });
      await expect(find('a'.repeat(64))).resolves.toBeNull();
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe('the stored cardiac MRI result, read for the report', () => {
  it('reads the areas of a cardio-seg-mri run only', () => {
    const structures = {
      LV: { areaMm2: null, pixels: 10 },
      MYO: { areaMm2: null, pixels: 30 },
      RV: { areaMm2: null, pixels: 20 },
    };
    expect(
      readCardioSegPredictions({
        pipeline: 'cardio-seg-mri',
        predictions: {
          configSha256: 'c'.repeat(64),
          noStructureFound: false,
          pixelSpacingMm: null,
          source: 'image',
          structures,
        },
      }),
    ).toMatchObject({ pixelSpacingMm: null, structures });
    expect(
      readCardioSegPredictions({ pipeline: 'brain', predictions: [] }),
    ).toBeNull();
  });
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
  'base64',
);

function mriInput(
  seg: NonNullable<ReportInput['run']['cardioSeg']>,
  evaluation: CardioSegEvaluation | null,
): ReportInput {
  return {
    breakhisEvaluation: null,
    cardioEvaluation: null,
    cardioSegEvaluation: evaluation,
    decidedBy: {
      fullName: 'Samir Ouali',
      role: 'physician',
      speciality: 'Cardiologie',
    },
    ecgTrace: null,
    editedAt: new Date('2026-10-19T11:00:00Z'),
    evaluation: null,
    fonts: {
      bold: Buffer.from('b'),
      regular: Buffer.from('r'),
      semibold: Buffer.from('s'),
    },
    mask: { data: PNG, sha256: '1'.repeat(64) },
    overlay: { data: PNG, sha256: '2'.repeat(64) },
    pannukeEvaluation: null,
    patient: {
      birthDate: new Date('1961-01-15T00:00:00Z'),
      firstName: 'Rachid',
      gender: 'MALE',
      hospitalRecordNumber: null,
      id: 'patient-c',
      lastName: 'Benali',
    },
    reportNumber: 'CR-IA-2026-000120',
    requestedBy: {
      fullName: 'Samir Ouali',
      role: 'physician',
      speciality: 'Cardiologie',
    },
    run: {
      cardioSeg: seg,
      classificationModelId: null,
      classificationWeightsSha256: null,
      clinicianImpression: null,
      createdAt: new Date('2026-10-19T10:00:00Z'),
      decidedAt: new Date('2026-10-19T10:30:00Z'),
      decisionLabel: null,
      decisionLabels: null,
      decisionReason: null,
      decisionStatus: 'VALIDATED',
      decisionThreshold: null,
      durationMs: 310,
      ecg: null,
      id: 'run-mri',
      magnification: null,
      malignancyScore: null,
      maskAreaPx: 2990,
      maskAreaRatio: 0.054,
      modelDecision: null,
      nucleiFractions: null,
      pipeline: 'cardio-seg-mri',
      predictions: [],
      segmentationModelId: 'cardio-seg-acdc-unet-effb4',
      segmentationSkippedReason: null,
      segmentationWeightsSha256: SHA,
      tileCount: null,
      ttaScores: null,
    },
    slice: { data: PNG, sha256: '3'.repeat(64) },
    sourceDocument: {
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-10-19T09:50:00Z'),
      data: Buffer.from('dicom'),
      height: 256,
      mimeType: 'application/dicom',
      originalName: 'petit-axe.dcm',
      width: 216,
    },
    structure: { kind: 'unknown' },
  };
}

const pixelsOnly: NonNullable<ReportInput['run']['cardioSeg']> = {
  configSha256: 'c'.repeat(64),
  noStructureFound: false,
  pixelSpacingMm: null,
  source: 'image',
  structures: {
    LV: { areaMm2: null, pixels: 1611 },
    MYO: { areaMm2: null, pixels: 881 },
    RV: { areaMm2: null, pixels: 498 },
  },
};
const withMm2: NonNullable<ReportInput['run']['cardioSeg']> = {
  ...pixelsOnly,
  pixelSpacingMm: [1.5, 1.5],
  source: 'dicom',
  structures: {
    LV: { areaMm2: 3624.75, pixels: 1611 },
    MYO: { areaMm2: 1982.25, pixels: 881 },
    RV: { areaMm2: 1120.5, pixels: 498 },
  },
};
const notebook = parseModelCardEvaluation(
  CARD,
  'cardio-seg-acdc-unet-effb4.json',
);
const textOf = (input: ReportInput) =>
  buildReportDocument(input).html.replace(/\s+/g, ' ');

describe('the cardiac MRI report', () => {
  it('prints the slice with its overlay and legend, the areas and the decision', () => {
    const html = textOf(mriInput(withMm2, notebook));

    expect(html).toContain("Compte rendu d'IRM cardiaque analysée par IA");
    expect(html).toContain('Carte de segmentation relue et acceptée');
    expect(html).toContain(
      '<td class="num">1 611</td><td class="num">3 624,8 mm²</td>',
    );
    expect(html).toContain('1,500 × 1,500 mm (DICOM)');
    expect(html).toContain(`Poids SHA-256 : ${SHA}`);
    for (const colour of Object.values(CARDIO_SEG_PALETTE))
      expect(html).toContain(`background:${colour}`);
    expect(html).toContain(
      'Figure 2</strong> — Même coupe, structures segmentées',
    );
    expect(html).toContain('Coupe isolée : pas de fraction d’éjection');
  });

  it('gives pixels only without a spacing, and says when nothing was found', () => {
    const pixels = textOf(mriInput(pixelsOnly, notebook));
    expect(pixels).toContain('Surfaces en pixels');
    expect(pixels).not.toContain('mm²</td>');

    const empty = textOf(
      mriInput(
        {
          ...pixelsOnly,
          noStructureFound: true,
          structures: {
            LV: { areaMm2: null, pixels: 0 },
            MYO: { areaMm2: null, pixels: 0 },
            RV: { areaMm2: null, pixels: 0 },
          },
        },
        notebook,
      ),
    );
    expect(empty).toContain('Aucune structure trouvée');
  });

  it("prints the notebook's figures marked as such, and none for other weights", () => {
    expect(textOf(mriInput(withMm2, notebook))).toContain(
      "Mesures du notebook d'entraînement sur 44 volumes de 22 patients ACDC",
    );
    expect(
      textOf(
        mriInput(withMm2, {
          ...(notebook as CardioSegEvaluation),
          weightsSha256: OTHER_SHA,
        }),
      ),
    ).toContain('Performances non mesurées pour ces poids');
  });

  it('never prints a diagnosis nor a course of action', () => {
    const html = textOf(mriInput(withMm2, notebook)).toLowerCase();
    for (const word of [
      'urgence',
      'urgent',
      'recommand',
      'diagnostic de',
      'insuffisance',
    ]) {
      expect(html).not.toContain(word);
    }
  });
});

describe('the cardiac MRI report on a slice of a DICOM study', () => {
  it('names the series and the slice, and certifies them', () => {
    const plain = mriInput(withMm2, notebook);
    const sliced: ReportInput = {
      ...plain,
      sourceDocument: {
        ...plain.sourceDocument,
        dicomSlice: { instanceNumber: 8, seriesNumber: 2 },
      },
    };

    expect(textOf(sliced)).toContain(
      '<tr><th scope="row">Coupe source</th><td>Série 2, coupe n° 8</td></tr>',
    );
    expect(textOf(plain)).not.toContain('Coupe source');
    expect(buildReportDocument(sliced).contentSha256).not.toBe(
      buildReportDocument(plain).contentSha256,
    );
  });
});
