import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

import { AiReportRenderer } from './ai-report-renderer';
import { buildReportDocument } from './ai-report-template';

// A real PDF through Chromium. Skipped where Chromium is not installed
// (npx playwright install chromium); the other tests simulate the renderer.
const chromiumInstalled = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

// 2 x 2 grey PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);

const font = (weight: number) =>
  readFileSync(
    resolve(
      process.cwd(),
      'assets',
      'fonts',
      'inter',
      `inter-latin-${weight}-normal.woff2`,
    ),
  );

(chromiumInstalled ? describe : describe.skip)(
  'AiReportRenderer with Chromium',
  () => {
    const renderer = new AiReportRenderer();

    afterAll(() => renderer.onModuleDestroy());

    it('produces a PDF of at least one A4 page', async () => {
      const document = buildReportDocument({
        decidedBy: {
          fullName: 'Amel Benaïssa',
          role: 'physician',
          speciality: 'Radiologie',
        },
        editedAt: new Date('2026-10-09T15:30:00Z'),
        evaluation: null,
        fonts: { bold: font(700), regular: font(400), semibold: font(600) },
        mask: { data: PNG, sha256: 'f'.repeat(64) },
        patient: {
          birthDate: new Date('1984-03-27T00:00:00Z'),
          firstName: 'Karim',
          gender: 'MALE',
          hospitalRecordNumber: null,
          id: 'patient-a',
          lastName: 'Haddad',
        },
        reportNumber: 'CR-IA-2026-000001',
        requestedBy: {
          fullName: 'Amel Benaïssa',
          role: 'physician',
          speciality: null,
        },
        run: {
          classificationModelId: 'brain-efficientnetb4-tumor-classification',
          classificationWeightsSha256: 'a'.repeat(64),
          clinicianImpression: null,
          createdAt: new Date('2026-10-09T15:04:24Z'),
          decidedAt: new Date('2026-10-09T15:20:00Z'),
          decisionLabel: 'meningioma',
          decisionReason: null,
          decisionStatus: 'VALIDATED',
          durationMs: 313,
          id: 'run-1',
          maskAreaPx: 1,
          maskAreaRatio: 0.25,
          predictions: [{ label: 'meningioma', probability: 0.93 }],
          segmentationModelId: 'brain-unet-meningioma-segmentation',
          segmentationSkippedReason: null,
          segmentationWeightsSha256: 'e'.repeat(64),
        },
        sourceDocument: {
          checksum: null,
          createdAt: new Date('2026-10-08T09:12:00Z'),
          data: PNG,
          height: 2,
          mimeType: 'image/png',
          originalName: 'irm.png',
          width: 2,
        },
        structure: { kind: 'unknown' },
      });

      const pdf = await renderer.render(document);
      const text = pdf.toString('latin1');

      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(
        (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
      ).toBeGreaterThanOrEqual(1);
      // A4 in points: 595 x 842.
      expect(text).toMatch(
        /\/MediaBox\s*\[\s*0\s+0\s+595\.9?\d*\s+842\.?\d*\s*\]/,
      );
    }, 60_000);
  },
);
