import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEvaluationReport } from './ai-report-rules';
import {
  ageAt,
  buildReportDocument,
  escapeHtml,
  type ReportInput,
} from './ai-report-template';

const EVALUATION = parseEvaluationReport(
  JSON.parse(
    readFileSync(
      join(__dirname, '../../../../ai-service/evaluation/brain-latest.json'),
      'utf8',
    ),
  ),
);
const MEASURED_SHA = EVALUATION?.classifierSha256 ?? 'missing';

function reportInput(overrides: Partial<ReportInput> = {}): ReportInput {
  const base: ReportInput = {
    decidedBy: {
      fullName: 'Amel Benaïssa',
      role: 'physician',
      speciality: 'Radiologie',
    },
    editedAt: new Date('2026-10-09T15:30:00Z'),
    evaluation: EVALUATION,
    fonts: {
      bold: Buffer.from('b'),
      regular: Buffer.from('r'),
      semibold: Buffer.from('s'),
    },
    mask: { data: Buffer.from('mask'), sha256: 'f'.repeat(64) },
    patient: {
      birthDate: new Date('1984-03-27T00:00:00Z'),
      firstName: 'Karim',
      gender: 'MALE',
      hospitalRecordNumber: 'HC-2026-00412',
      id: 'patient-a',
      lastName: 'Haddad',
    },
    reportNumber: 'CR-IA-2026-000007',
    requestedBy: {
      fullName: 'Yacine Mebarki',
      role: 'physician',
      speciality: 'Neurologie',
    },
    run: {
      classificationModelId: 'brain-efficientnetb4-tumor-classification',
      classificationWeightsSha256: MEASURED_SHA,
      clinicianImpression: 'Lésion extra-axiale à base durale.',
      createdAt: new Date('2026-10-09T15:04:24Z'),
      decidedAt: new Date('2026-10-09T15:20:00Z'),
      decisionLabel: 'meningioma',
      decisionReason: null,
      decisionStatus: 'VALIDATED',
      durationMs: 313,
      id: 'run-1',
      maskAreaPx: 2544,
      maskAreaRatio: 0.0257,
      predictions: [
        { label: 'pituitary', probability: 0.03 },
        { label: 'meningioma', probability: 0.93 },
        { label: 'glioma', probability: 0.02 },
        { label: 'notumor', probability: 0.02 },
      ],
      segmentationModelId: 'brain-unet-meningioma-segmentation',
      segmentationSkippedReason: null,
      segmentationWeightsSha256: 'e'.repeat(64),
    },
    sourceDocument: {
      checksum: 'c'.repeat(64),
      createdAt: new Date('2026-10-08T09:12:00Z'),
      data: Buffer.from('image'),
      height: 340,
      mimeType: 'image/jpeg',
      originalName: 'Te-me_0023.jpg',
      width: 291,
    },
    structure: {
      address: '12, boulevard Krim Belkacem',
      email: 'contact@clinique.dz',
      kind: 'establishment',
      name: 'Clinique El Nour',
      phone: '+213 21 00 00 00',
      type: 'CLINIC',
      wilaya: 'Alger',
    },
  };
  return { ...base, ...overrides };
}

const withRun = (run: Partial<ReportInput['run']>) =>
  reportInput({ run: { ...reportInput().run, ...run } });

const textOf = (input: ReportInput) => {
  const document = buildReportDocument(input);
  return `${document.html}\n${document.headerTemplate}\n${document.footerTemplate}`;
};

describe('buildReportDocument', () => {
  it('prints the sections in order, in French', () => {
    const html = buildReportDocument(reportInput()).html;
    const order = [
      "COMPTE RENDU D'ANALYSE D'IMAGERIE ASSISTÉE PAR INTELLIGENCE ARTIFICIELLE",
      'Imagerie cérébrale (IRM)',
      '>Identification<',
      '>Indication<',
      '>Technique<',
      '>Résultats<',
      '>Conclusion du médecin<',
      // The signature right after the conclusion, in the same block.
      'Validé électroniquement dans HealixDZ',
      'Empreinte du document : ',
      '>Performances de référence<',
      '>Mentions légales<',
    ].map((text) => html.indexOf(text));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('<html lang="fr">');
  });

  it('keeps the conclusion and the signature together, on the same page', () => {
    const html = buildReportDocument(reportInput()).html;
    // From the unbreakable block to the first section after it.
    const closing = html.slice(
      html.indexOf('<div class="closing">'),
      html.indexOf('<section class="small">'),
    );

    expect(closing).toContain('Conclusion du médecin');
    expect(closing).toContain('Validé électroniquement dans HealixDZ');
    expect(closing).toContain('Empreinte du document : ');
    expect(html).toMatch(/\.closing\{[^}]*break-inside:avoid/);
  });

  it('identifies the patient by name, sex, birth date, age and record number only', () => {
    const html = buildReportDocument(reportInput()).html;

    expect(html).toContain('<strong>HADDAD</strong> Karim');
    expect(html).toContain('Masculin');
    expect(html).toContain('27 mars 1984 (42 ans');
    expect(html).toContain('HC-2026-00412');
    expect(
      ageAt(new Date('1984-03-27T00:00:00Z'), new Date('2026-03-26T12:00:00Z')),
    ).toBe(41);

    const withoutRecord = buildReportDocument(
      reportInput({
        patient: { ...reportInput().patient, hospitalRecordNumber: null },
      }),
    ).html;
    expect(withoutRecord).toContain('Identifiant interne');
    expect(withoutRecord).toContain('patient-a');
  });

  it('never prints an urgency, a delay or a suggested specialist', () => {
    for (const label of ['glioma', 'meningioma', 'notumor', 'pituitary']) {
      const text = textOf(
        withRun({
          decisionLabel: label,
          predictions: [
            { label, probability: 0.6 },
            { label: 'other', probability: 0.4 },
          ],
        }),
      ).toLowerCase();
      expect(text).not.toContain('urgence');
      expect(text).not.toContain('délai');
      expect(text).not.toContain('spécialiste suggéré');
    }
  });

  it('shows the measured performance and the same warnings as the result page', () => {
    const html = buildReportDocument(
      withRun({
        predictions: [
          { label: 'meningioma', probability: 0.887 },
          { label: 'glioma', probability: 0.113 },
        ],
      }),
    ).html;

    expect(html).toContain('Exactitude : 95,5');
    expect(html).toContain('Résultat incertain');
    expect(html).toMatch(
      /justes dans 72,2\s%\sdes cas, contre 98,4\s%\sau-dessus/,
    );
    expect(html).toContain(
      '42 des 435 résultats « Méningiome » étaient des gliomes.',
    );
  });

  it('shows no figure for weights the evaluation did not measure', () => {
    const html = buildReportDocument(
      withRun({
        classificationWeightsSha256: 'a'.repeat(64),
        predictions: [{ label: 'notumor', probability: 0.6 }],
      }),
    ).html;

    expect(html).toContain(
      'Performances non mesurées pour cette version des modèles.',
    );
    expect(html).not.toContain('Exactitude :');
    expect(html).not.toContain('Résultat incertain');
    expect(html).not.toContain('étaient des gliomes');
    expect(html).toContain('Rappel plus faible sur les gliomes.');

    const noReport = buildReportDocument(
      reportInput({ evaluation: null }),
    ).html;
    expect(noReport).toContain(
      'Performances non mesurées pour cette version des modèles.',
    );
  });

  it('puts the physician conclusion forward, with the correction and its reason', () => {
    const html = buildReportDocument(
      withRun({
        decisionLabel: 'glioma',
        decisionReason: 'Prise de contraste en anneau.',
        decisionStatus: 'CORRECTED',
      }),
    ).html;

    expect(html).toContain('Résultat corrigé');
    expect(html).toContain('<strong>Gliome</strong>');
    expect(html).toContain('Prise de contraste en anneau.');
    expect(buildReportDocument(reportInput()).html).toContain(
      'Résultat validé',
    );
  });

  it('draws the contour figure only with a mask, and says why otherwise', () => {
    const withMask = buildReportDocument(reportInput()).html;
    expect(withMask).toContain('Figure 1');
    expect(withMask).toContain('Figure 2');
    expect(withMask).toMatch(/2\s544 pixels/);
    expect(withMask).toContain("aucune surface en mm² n'est donnée");

    const withoutMask = buildReportDocument(
      reportInput({
        mask: null,
        run: {
          ...reportInput().run,
          maskAreaPx: null,
          maskAreaRatio: null,
          segmentationModelId: null,
          segmentationSkippedReason: 'not_applicable_for_class',
        },
      }),
    ).html;
    expect(withoutMask).toContain('Figure 1');
    expect(withoutMask).not.toContain('Figure 2');
    expect(withoutMask).toContain(
      escapeHtml(
        "seuls le méningiome et l'adénome hypophysaire sont segmentés",
      ),
    );
  });

  it('gives "Dr" to physicians only', () => {
    const html = buildReportDocument(
      reportInput({
        decidedBy: {
          fullName: 'Nadia Admin',
          role: 'establishmentAdmin',
          speciality: null,
        },
      }),
    ).html;

    expect(html).toContain(
      escapeHtml("Nadia Admin (administration de l'établissement)"),
    );
    expect(html).not.toContain('Dr Nadia Admin');
    expect(html).toContain('Dr Yacine Mebarki');
  });

  it('heads every page with the structure, the number and the date, and numbers the pages', () => {
    const document = buildReportDocument(reportInput());

    expect(document.headerTemplate).toContain('Clinique El Nour');
    expect(document.headerTemplate).toContain(
      'Compte rendu n° CR-IA-2026-000007',
    );
    expect(document.headerTemplate).toContain('Édité le 9 octobre 2026');
    expect(document.footerTemplate).toContain(
      'Document médical confidentiel — soumis au secret médical',
    );
    expect(document.footerTemplate).toContain(
      '<span class="pageNumber"></span> / <span class="totalPages"></span>',
    );
    expect(document.footerTemplate).toContain('Généré par HealixDZ');

    const practice = buildReportDocument(
      reportInput({
        structure: {
          address: '3 rue Didouche',
          doctorName: 'Samir Kaci',
          kind: 'practice',
          speciality: 'Neurochirurgie',
          wilaya: 'Oran',
        },
      }),
    ).headerTemplate;
    expect(practice).toContain('Dr Samir Kaci');
    expect(practice).toContain('Neurochirurgie');
  });

  it('escapes what the users typed', () => {
    const html = buildReportDocument(
      withRun({ clinicianImpression: '<script>alert(1)</script>' }),
    ).html;

    expect(html).not.toContain('<script>');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
  });

  it('fingerprints its content: same facts, same fingerprint; any change, another', () => {
    const first = buildReportDocument(reportInput());

    expect(buildReportDocument(reportInput()).contentSha256).toBe(
      first.contentSha256,
    );
    expect(
      buildReportDocument(withRun({ decisionReason: 'x' })).contentSha256,
    ).not.toBe(first.contentSha256);
    expect(first.html).toContain(
      `Empreinte du document : ${first.contentSha256.slice(0, 16)}`,
    );
  });
});
