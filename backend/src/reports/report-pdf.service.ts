import { Injectable } from '@nestjs/common';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';

type Snapshot = Record<string, unknown>;

export type ReportPdfInput = {
  number: string;
  version: number;
  replacesNumber: string | null;
  title: string;
  category: string;
  effectiveAt: Date;
  finalizedAt: Date;
  patient: Snapshot;
  author: Snapshot;
  organization: Snapshot;
  sections: Array<{ id: string; title: string; body: string }>;
  conclusion: string | null;
  contentFingerprint: string;
};

const escapeHtml = (value: unknown) =>
  (typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? String(value)
    : value instanceof Date
      ? value.toISOString()
      : ''
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const text = (snapshot: Snapshot, key: string) => escapeHtml(snapshot[key]);

// Text typed by the physician: escaped, line breaks kept.
const paragraphs = (value: string) =>
  escapeHtml(value).replace(/\r?\n/g, '<br>');

const CATEGORY_LABELS: Record<string, string> = {
  CONSULTATION_NOTE: 'Note de consultation',
  RADIOLOGY: "Compte rendu d'imagerie",
  LABORATORY_RESULT: 'Résultat de laboratoire',
  OTHER_CLINICAL: 'Rapport clinique',
};

@Injectable()
export class ReportPdfService {
  constructor(private readonly renderer: AiReportRenderer) {}

  render(input: ReportPdfInput): Promise<Buffer> {
    const format = (date: Date) =>
      new Intl.DateTimeFormat('fr-DZ', {
        timeZone: 'Africa/Algiers',
        dateStyle: 'long',
      }).format(date);
    const sections = input.sections
      .map(
        (section) => `<section class="block">
          <h2>${escapeHtml(section.title)}</h2>
          <p>${paragraphs(section.body)}</p>
        </section>`,
      )
      .join('');
    const conclusion = input.conclusion
      ? `<section class="block conclusion"><h2>Conclusion</h2><p>${paragraphs(input.conclusion)}</p></section>`
      : '';
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
      @page { size: A4 portrait; } body { font-family: Arial, sans-serif; color:#17202a; font-size:12px; line-height:1.5; }
      .head { display:flex; justify-content:space-between; border-bottom:2px solid #167d78; padding-bottom:12px; }
      .brand { color:#167d78; font-size:22px; font-weight:700; } .muted { color:#5d6d7e; }
      h1 { text-align:center; letter-spacing:1px; margin:26px 0 6px; font-size:20px; }
      h2 { font-size:13px; margin:0 0 6px; color:#167d78; text-transform:uppercase; letter-spacing:.5px; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; padding:12px; background:#f5f9f9; border-radius:8px; margin-top:14px; }
      .block { break-inside:avoid; margin-top:16px; } .block p { margin:0; }
      .conclusion { border-top:1px solid #d8e2e2; padding-top:12px; }
      .signature { break-inside:avoid; margin-top:24px; margin-left:auto; width:230px; min-height:68px; border:1px solid #9aa; padding:10px; text-align:center; }
      .fingerprint { break-inside:avoid; margin-top:14px; font-size:8px; color:#667; word-break:break-all; }
    </style></head><body>
      <div class="head"><div><div class="brand">HEALIXDZ</div><b>${text(input.organization, 'name')}</b></div><div>${text(input.organization, 'address')}<br>${text(input.organization, 'wilaya')}<br>${text(input.organization, 'phone')}</div></div>
      <h1>${escapeHtml(input.title)}</h1>
      <p style="text-align:center" class="muted">${escapeHtml(CATEGORY_LABELS[input.category] ?? 'Rapport clinique')} · <b>N° ${escapeHtml(input.number)}</b> · version ${input.version}${input.replacesNumber ? ` (remplace ${escapeHtml(input.replacesNumber)})` : ''}</p>
      <div class="grid">
        <div><b>Patient :</b> ${text(input.patient, 'lastName')} ${text(input.patient, 'firstName')}</div>
        <div><b>Date de naissance :</b> ${text(input.patient, 'birthDate')}</div>
        <div><b>N° dossier :</b> ${text(input.patient, 'hospitalRecordNumber') || '—'}</div>
        <div><b>Date de l'acte :</b> ${escapeHtml(format(input.effectiveAt))}</div>
      </div>
      ${sections}
      ${conclusion}
      <p style="margin-top:22px">Rédigé par <b>Dr ${text(input.author, 'fullName')}</b>${input.author.speciality ? `, ${text(input.author, 'speciality')}` : ''}${input.author.registrationNumber ? ` — N° d’Ordre ${text(input.author, 'registrationNumber')}` : ''}, le ${escapeHtml(format(input.finalizedAt))}.</p>
      <div class="signature">Cachet / signature manuscrite</div>
      <div class="fingerprint">Empreinte du contenu : ${escapeHtml(input.contentFingerprint)}</div>
    </body></html>`;
    return this.renderer.render({
      html,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#667">Document médical archivé par HealixDz — <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
      margins: {
        bottom: '18mm',
        left: '18mm',
        right: '18mm',
        top: '18mm',
      },
    });
  }
}
