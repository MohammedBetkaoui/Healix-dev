import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  breastConfusionWarning,
  buildReportDocument,
  escapeHtml,
  formatScore,
  type ReportInput,
} from './ai-report-template';
import { NUCLEI_PALETTE } from './nuclei-palette';
import {
  type BreakhisEvaluation,
  findPathologyEvaluation,
  type PannukeEvaluation,
} from './pathology-evaluation';

// The evaluation reports and the palette of the repository, as committed.
const EVALUATION_DIR = join(__dirname, '../../../../ai-service/evaluation');
const PALETTE_FILE = join(
  __dirname,
  '../../../../ai-service/app/nuclei_palette.json',
);
// The deployed weights, measured by pathology-2026-10-12-184302-c8cbd905-02b26d77.json.
const BREAKHIS_SHA =
  'c8cbd905cc039ed4775c98043e04d357bcfcaf971c4b9cc592a3600f97348e6b';
const PANNUKE_SHA =
  '02b26d77988f7aa38a15f39e7ba9a7a8946380563e26d1ca705c805d688bbf3c';
// The discarded PanNuke file (the wrong model); its reports stay as history.
const DISCARDED_PANNUKE_SHA =
  '8d05b1f068d4fa9f25ed3ed9f05027d7fd68ef74af0bab15e798e6f324a5a248';

describe('findPathologyEvaluation, on the reports of the repository', () => {
  it('finds the BreakHis evaluation of the deployed weights', async () => {
    const evaluation = await findPathologyEvaluation(
      EVALUATION_DIR,
      'breakhis',
      BREAKHIS_SHA,
    );

    expect(evaluation).not.toBeNull();
    expect(evaluation?.weightsSha256).toBe(BREAKHIS_SHA);
    expect(evaluation?.confusionMatrix).toEqual([
      [262, 85],
      [74, 925],
    ]);
    expect(evaluation?.testPatients).toBe(13);
    expect(evaluation?.benignPatients).toBe(4);
    expect(evaluation?.n).toBe(1346);
    expect(evaluation?.threshold).toBe(0.13);
    expect(evaluation?.sensitivity.ci95).toHaveLength(2);
    expect(Object.keys(evaluation?.byMagnification ?? {}).sort()).toEqual([
      '100',
      '200',
      '40',
      '400',
    ]);
  });

  it('finds the PanNuke evaluation of the deployed weights 02b26d77', async () => {
    const evaluation = await findPathologyEvaluation(
      EVALUATION_DIR,
      'pannuke',
      PANNUKE_SHA,
    );

    expect(evaluation?.file).toBe(
      'pathology-2026-10-12-184302-c8cbd905-02b26d77.json',
    );
    expect(evaluation?.weightsSha256).toBe(PANNUKE_SHA);
    expect(evaluation?.nucleiMeanDice).toBeCloseTo(0.5613, 4);
  });

  it('gives the discarded weights 8d05b1f0 their own 0.012 report, never the one of 02b26d77', async () => {
    const evaluation = await findPathologyEvaluation(
      EVALUATION_DIR,
      'pannuke',
      DISCARDED_PANNUKE_SHA,
    );

    expect(evaluation?.file).toBe(
      'pathology-2026-10-12-132137-c8cbd905-8d05b1f0.json',
    );
    expect(evaluation?.weightsSha256).toBe(DISCARDED_PANNUKE_SHA);
    expect(evaluation?.nucleiMeanDice).toBeCloseTo(0.012, 3);
    expect(evaluation?.file).not.toContain('02b26d77');
  });

  it('finds nothing for other weights, or without weights', async () => {
    await expect(
      findPathologyEvaluation(EVALUATION_DIR, 'breakhis', 'a'.repeat(64)),
    ).resolves.toBeNull();
    await expect(
      findPathologyEvaluation(EVALUATION_DIR, 'breakhis', null),
    ).resolves.toBeNull();
    await expect(
      findPathologyEvaluation(
        join(EVALUATION_DIR, 'missing'),
        'breakhis',
        BREAKHIS_SHA,
      ),
    ).resolves.toBeNull();
  });

  it('takes the most recent report of these weights, and skips unreadable or partial ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'healix-eval-'));
    try {
      const source = JSON.parse(
        readFileSync(
          join(
            EVALUATION_DIR,
            'pathology-2026-10-11-183500-c8cbd905-8d05b1f0.json',
          ),
          'utf8',
        ),
      ) as Record<string, unknown> & { breakhis: Record<string, unknown> };
      const write = (name: string, report: unknown) =>
        writeFileSync(join(dir, name), JSON.stringify(report));
      write('pathology-old.json', {
        ...source,
        file: 'pathology-old.json',
        generatedAt: '2026-10-01T10:00:00+00:00',
      });
      write('pathology-new.json', {
        ...source,
        file: 'pathology-new.json',
        generatedAt: '2026-10-12T10:00:00+00:00',
      });
      write('pathology-stopped.json', {
        ...source,
        breakhis: { reason: 'split', status: 'stopped' },
        file: 'pathology-stopped.json',
        generatedAt: '2026-10-13T10:00:00+00:00',
      });
      writeFileSync(join(dir, 'pathology-broken.json'), '{ not json');
      write('brain-latest.json', { generatedAt: '2026-10-14T10:00:00Z' });

      const found = await findPathologyEvaluation(
        dir,
        'breakhis',
        BREAKHIS_SHA,
      );
      expect(found?.file).toBe('pathology-new.json');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe('nuclei palette', () => {
  it('is the one the AI service colours the overlay with', () => {
    expect(NUCLEI_PALETTE).toEqual(
      JSON.parse(readFileSync(PALETTE_FILE, 'utf8')),
    );
  });
});

// --- Templates ---------------------------------------------------------------

let BREAKHIS: BreakhisEvaluation;

beforeAll(async () => {
  const found = await findPathologyEvaluation(
    EVALUATION_DIR,
    'breakhis',
    BREAKHIS_SHA,
  );
  if (!found)
    throw new Error('The BreakHis evaluation of the repository is missing.');
  BREAKHIS = found;
});

const PANNUKE: PannukeEvaluation = {
  file: 'pathology-test.json',
  generatedAt: '2026-10-12T10:00:00+00:00',
  nucleiMeanDice: 0.5649,
  perClass: {
    background: { dice: 0.9625, iou: 0.9277 },
    connective: { dice: 0.56, iou: 0.3889 },
    dead: { dice: 0.3056, iou: 0.1803 },
    epithelial: { dice: 0.623, iou: 0.4525 },
    inflammatory: { dice: 0.6239, iou: 0.4534 },
    neoplastic: { dice: 0.7119, iou: 0.5527 },
  },
  weightsSha256: PANNUKE_SHA,
};

function pathologyInput(
  pipeline: 'pathology-breast' | 'pathology-nuclei',
  run: Partial<ReportInput['run']> = {},
  overrides: Partial<ReportInput> = {},
): ReportInput {
  const breast = pipeline === 'pathology-breast';
  return {
    breakhisEvaluation: breast ? BREAKHIS : null,
    cardioEvaluation: null,
    decidedBy: {
      fullName: 'Leïla Achour',
      role: 'physician',
      speciality: 'Anatomie et cytologie pathologiques',
    },
    editedAt: new Date('2026-10-12T10:30:00Z'),
    evaluation: null,
    ecgTrace: null,
    fonts: {
      bold: Buffer.from('b'),
      regular: Buffer.from('r'),
      semibold: Buffer.from('s'),
    },
    mask: breast
      ? null
      : { data: Buffer.from('labels'), sha256: '1'.repeat(64) },
    overlay: breast
      ? null
      : { data: Buffer.from('overlay-rgba'), sha256: '2'.repeat(64) },
    pannukeEvaluation: null,
    patient: {
      birthDate: new Date('1975-06-02T00:00:00Z'),
      firstName: 'Nadia',
      gender: 'FEMALE',
      hospitalRecordNumber: 'HC-2026-00977',
      id: 'patient-b',
      lastName: 'Mansouri',
    },
    reportNumber: 'CR-IA-2026-000042',
    requestedBy: {
      fullName: 'Leïla Achour',
      role: 'physician',
      speciality: 'Anatomie et cytologie pathologiques',
    },
    run: {
      classificationModelId: breast
        ? 'pathology-breakhis-classification'
        : null,
      classificationWeightsSha256: breast ? BREAKHIS_SHA : null,
      clinicianImpression: null,
      createdAt: new Date('2026-10-12T09:00:00Z'),
      decidedAt: new Date('2026-10-12T10:00:00Z'),
      decisionLabel: breast ? 'malignant' : null,
      decisionReason: null,
      decisionStatus: 'VALIDATED',
      decisionThreshold: breast ? 0.13 : null,
      durationMs: breast ? 480 : 1600,
      id: 'run-p',
      magnification: breast ? 200 : 40,
      malignancyScore: breast ? 0.59 : null,
      maskAreaPx: breast ? null : 30_000,
      maskAreaRatio: breast ? null : 0.1,
      modelDecision: breast ? 'malignant' : null,
      nucleiFractions: breast
        ? null
        : {
            background: 0.9,
            nucleusTypes: {
              connective: 0.2,
              dead: 0.03,
              epithelial: 0.07,
              inflammatory: 0.2,
              neoplastic: 0.5,
            },
          },
      pipeline,
      predictions: [],
      segmentationModelId: breast
        ? null
        : 'pathology-unet-pannuke-segmentation',
      segmentationSkippedReason: null,
      segmentationWeightsSha256: breast ? null : PANNUKE_SHA,
      tileCount: breast ? null : 9,
      ecg: null,
      decisionLabels: null,
      ttaScores: breast ? [0.58, 0.6, 0.57, 0.61] : null,
      ...run,
    },
    sourceDocument: {
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-10-12T08:50:00Z'),
      data: Buffer.from('image'),
      height: 460,
      mimeType: 'image/png',
      originalName: 'lame-he.png',
      width: 700,
    },
    structure: { kind: 'unknown' },
    ...overrides,
  };
}

const textOf = (input: ReportInput) => {
  const document = buildReportDocument(input);
  return `${document.html}\n${document.headerTemplate}\n${document.footerTemplate}`;
};

// The required negation is the only place "probabilité" may appear.
const NEGATION = "ce n'est pas une probabilité";
const withoutNegation = (text: string) =>
  text.split(escapeHtml(NEGATION)).join('').split(NEGATION).join('');

describe('histopathology report: breast classification', () => {
  it('titles the report and states the score as a score, with the threshold and the result', () => {
    const html = buildReportDocument(pathologyInput('pathology-breast')).html;

    expect(html).toContain(
      "<h1>Compte rendu d'analyse histopathologique assistée par IA</h1>",
    );
    expect(html).not.toContain("D'IMAGERIE ASSISTÉE PAR INTELLIGENCE");
    expect(html).toContain(
      "Score de malignité du modèle : 0,59 (score non calibré, ce n'est pas une probabilité) — seuil de décision 0,13 — résultat du modèle : malin",
    );
    // The image, its magnification, the 4 view scores.
    expect(html).toContain('Image analysée (grossissement 200×)');
    for (const [view, score] of [
      ['Image originale', '0,58'],
      ['Retournement horizontal', '0,60'],
      ['Retournement vertical', '0,57'],
      ['Retournements horizontal et vertical', '0,61'],
    ]) {
      expect(html).toMatch(new RegExp(`${view}</td><td class="num">${score}<`));
    }
    expect(html).toContain('Résultat validé');
    expect(html).toContain('<strong>Malin</strong>');
  });

  it('never calls the score a probability', () => {
    for (const modelDecision of ['malignant', 'benign']) {
      const text = textOf(
        pathologyInput('pathology-breast', {
          decisionLabel: modelDecision,
          malignancyScore: modelDecision === 'benign' ? 0.05 : 0.59,
          modelDecision,
        }),
      );
      expect(withoutNegation(text).toLowerCase()).not.toContain('probabilit');
    }
  });

  it('prints the measured sensitivity and specificity, the line of the magnification and the test set', () => {
    const html = buildReportDocument(pathologyInput('pathology-breast')).html;

    expect(html).toContain('jeu de test : 13 patients, dont 4 bénins');
    expect(html).toMatch(/Sensibilité globale : 92,6\s%\s\(IC 95 % : 87,1\s%/);
    expect(html).toMatch(/spécificité globale : 75,5\s%\s\(IC 95 % : 56,5\s%/);
    expect(html).toMatch(
      /À 200×, grossissement de cette image : 340 images, sensibilité 92\s%, spécificité 77,5\s%/,
    );
    expect(html).toContain(escapeHtml(BREAKHIS.file));
  });

  it('warns from the confusion matrix of the magnification, for either result', () => {
    expect(
      buildReportDocument(pathologyInput('pathology-breast')).html,
    ).toContain(
      escapeHtml(
        'Sur le jeu de test à 200×, 20 des 251 résultats « malin » étaient bénins.',
      ),
    );
    const benign = buildReportDocument(
      pathologyInput('pathology-breast', {
        decisionLabel: 'benign',
        magnification: 400,
        malignancyScore: 0.05,
        modelDecision: 'benign',
        ttaScores: [0.04, 0.05, 0.06, 0.05],
      }),
    ).html;
    expect(benign).toContain(
      escapeHtml(
        'Sur le jeu de test à 400×, 20 des 78 résultats « bénin » étaient malins.',
      ),
    );
    expect(breastConfusionWarning(BREAKHIS, 40, 'other')).toBeNull();
  });

  it('prints no figure and no warning for weights no evaluation measured', () => {
    for (const [input, notice] of [
      [
        pathologyInput('pathology-breast', {
          classificationWeightsSha256: 'a'.repeat(64),
        }),
        'Performances non mesurées pour ces poids (empreinte aaaaaaaa).',
      ],
      [
        pathologyInput('pathology-breast', {}, { breakhisEvaluation: null }),
        'Performances non mesurées pour ces poids (empreinte c8cbd905).',
      ],
      [
        pathologyInput('pathology-breast', {
          classificationWeightsSha256: null,
        }),
        'Performances non mesurées pour ces poids.',
      ],
    ] as const) {
      const html = buildReportDocument(input).html;
      expect(html).toContain(notice);
      expect(html).not.toContain('Sensibilité globale');
      expect(html).not.toContain('Confusions observées');
      expect(html).not.toContain('jeu de test : 13 patients');
    }
  });

  it('shows a correction to the other result', () => {
    const html = buildReportDocument(
      pathologyInput('pathology-breast', {
        decisionLabel: 'benign',
        decisionReason: 'Fibroadénome à la relecture.',
        decisionStatus: 'CORRECTED',
      }),
    ).html;
    expect(html).toContain('Résultat corrigé');
    expect(html).toContain('<strong>Bénin</strong>');
    expect(html).toContain('Fibroadénome à la relecture.');
  });

  it('never prints a score on the wrong side of the threshold', () => {
    expect(formatScore(0.59, 0.13)).toBe('0,59');
    // 0.128 would read 0,13 with 2 decimals: a benign score shown at the threshold.
    expect(formatScore(0.128, 0.13)).toBe('0,128');
    expect(formatScore(0.1299, 0.13)).toBe('0,1299');
    expect(formatScore(0.13, 0.13)).toBe('0,13');
  });
});

describe('histopathology report: nuclei segmentation', () => {
  it('lays the colour overlay over the image, without the contour filter, with its legend', () => {
    const html = buildReportDocument(pathologyInput('pathology-nuclei')).html;

    expect(html).toContain(
      "<h1>Compte rendu d'analyse histopathologique assistée par IA</h1>",
    );
    expect(html).toContain('Figure 2');
    expect(html).toContain(
      `href="data:image/png;base64,${Buffer.from('overlay-rgba').toString('base64')}"`,
    );
    const figure = html.slice(
      html.indexOf('Figure 1'),
      html.indexOf('<ul class="legend">'),
    );
    expect(figure).not.toContain('filter=');
    for (const [name, colour] of [
      ['Néoplasiques', '#D55E00'],
      ['Inflammatoires', '#0072B2'],
      ['Conjonctifs', '#009E73'],
      ['Morts', '#6E6E6E'],
      ['Épithéliaux', '#F0E442'],
    ]) {
      expect(html).toContain(`background:${colour}"></span>${name}</li>`);
    }
  });

  it('gives the covered share and the composition in % of the nuclear surface, dead flagged unreliable', () => {
    const html = buildReportDocument(pathologyInput('pathology-nuclei')).html;

    expect(html).toMatch(
      /Part de l&#39;image couverte par des noyaux<\/th><td><strong>10\s%<\/strong>/,
    );
    expect(html).toContain('Part de la surface nucléaire');
    expect(html).toMatch(/Néoplasiques<\/td><td class="num">50\s%/);
    expect(html).toMatch(
      /Morts <span class="tag">non fiable<\/span><\/td><td class="num">3\s%/,
    );
  });

  it('states the limits, the tiles and the 40x H&E training', () => {
    const text = buildReportDocument(
      pathologyInput('pathology-nuclei'),
    ).html.toLowerCase();

    expect(text).toContain(
      'segmentation sémantique : des noyaux accolés ne sont pas séparés',
    );
    expect(text).toContain('modèle entraîné sur des patchs h&amp;e à 40×');
    expect(text).toContain('9 tuiles analysées');
  });

  it('never gives a number of nuclei', () => {
    const text = textOf(pathologyInput('pathology-nuclei')).toLowerCase();
    expect(text).not.toMatch(/\d[\d\s]*noyau/);
    expect(text).not.toContain('nombre de noyaux');
  });

  it('concludes with the map reviewed and accepted, no class', () => {
    const html = buildReportDocument(pathologyInput('pathology-nuclei')).html;
    const conclusion = html.slice(html.indexOf('Conclusion du médecin'));
    expect(conclusion).toContain('Carte de segmentation relue et acceptée');
    expect(conclusion).not.toContain('Classe retenue');
    expect(conclusion).not.toContain('Résultat retenu');
  });

  it('prints the PanNuke performance only when measured on these weights', () => {
    expect(
      buildReportDocument(pathologyInput('pathology-nuclei')).html,
    ).toContain(
      'Performances non mesurées pour ces poids (empreinte 02b26d77).',
    );

    const measured = buildReportDocument(
      pathologyInput('pathology-nuclei', {}, { pannukeEvaluation: PANNUKE }),
    ).html;
    expect(measured).toContain('Dice moyen des noyaux : 0,56');
    expect(measured).toContain('Morts 0,31');

    const otherWeights = buildReportDocument(
      pathologyInput(
        'pathology-nuclei',
        { segmentationWeightsSha256: 'b'.repeat(64) },
        { pannukeEvaluation: PANNUKE },
      ),
    ).html;
    expect(otherWeights).toContain(
      'Performances non mesurées pour ces poids (empreinte bbbbbbbb).',
    );
  });

  it('says so when the image holds no nucleus pixel', () => {
    const html = buildReportDocument(
      pathologyInput('pathology-nuclei', {
        nucleiFractions: {
          background: 1,
          nucleusTypes: {
            connective: null,
            dead: null,
            epithelial: null,
            inflammatory: null,
            neoplastic: null,
          },
        },
      }),
    ).html;
    expect(html).toContain('Aucun pixel de noyau sur cette image');
    expect(html).not.toContain('Part de la surface nucléaire');
  });
});

describe('every chain', () => {
  it('never prints an urgency, a specialist or a course of action', () => {
    for (const input of [
      pathologyInput('pathology-breast'),
      pathologyInput('pathology-nuclei'),
    ]) {
      const text = textOf(input).toLowerCase();
      for (const word of [
        'urgence',
        'urgent',
        'délai',
        'spécialiste',
        'conduite à tenir',
        'recommand',
        'adresser',
      ]) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('fingerprints the overlay and the evaluation used', () => {
    const base = buildReportDocument(pathologyInput('pathology-nuclei'));
    const otherOverlay = buildReportDocument(
      pathologyInput(
        'pathology-nuclei',
        {},
        { overlay: { data: Buffer.from('x'), sha256: '3'.repeat(64) } },
      ),
    );
    expect(otherOverlay.contentSha256).not.toBe(base.contentSha256);

    const breast = buildReportDocument(pathologyInput('pathology-breast'));
    const unmeasured = buildReportDocument(
      pathologyInput('pathology-breast', {}, { breakhisEvaluation: null }),
    );
    expect(unmeasured.contentSha256).not.toBe(breast.contentSha256);
  });
});
