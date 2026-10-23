import { Injectable } from '@nestjs/common';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';

type Snapshot = Record<string, unknown>;

type PdfItem = {
  dci: string;
  brandName: string | null;
  strength: string;
  pharmaceuticalForm: string;
  route: string;
  dosePerIntake: string;
  frequency: string;
  intakeMoment: string | null;
  durationDays: number | null;
  quantity: string;
  patientInstructions: string | null;
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

@Injectable()
export class PrescriptionPdfService {
  constructor(private readonly renderer: AiReportRenderer) {}

  render(input: {
    number: string;
    prescribedAt: Date;
    patient: Snapshot;
    prescriber: Snapshot;
    organization: Snapshot;
    items: PdfItem[];
    contentFingerprint: string;
  }): Promise<Buffer> {
    const date = new Intl.DateTimeFormat('fr-DZ', {
      timeZone: 'Africa/Algiers',
      dateStyle: 'long',
    }).format(input.prescribedAt);
    const items = input.items
      .map(
        (item, index) => `<section class="medicine">
          <h3>${index + 1}. ${escapeHtml(item.dci)}${item.brandName ? ` — ${escapeHtml(item.brandName)}` : ''}</h3>
          <div class="muted">${escapeHtml(item.strength)} · ${escapeHtml(item.pharmaceuticalForm)} · ${escapeHtml(item.route)}</div>
          <p><b>Posologie :</b> ${escapeHtml(item.dosePerIntake)} — ${escapeHtml(item.frequency)}${item.intakeMoment ? ` — ${escapeHtml(item.intakeMoment)}` : ''}</p>
          <p><b>Durée :</b> ${item.durationDays ? `${item.durationDays} jour(s)` : 'Non précisée'} · <b>Quantité :</b> ${escapeHtml(item.quantity)}</p>
          ${item.patientInstructions ? `<p><b>Instructions :</b> ${escapeHtml(item.patientInstructions)}</p>` : ''}
        </section>`,
      )
      .join('');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
      @page { size: A4 portrait; } body { font-family: Arial, sans-serif; color:#17202a; font-size:12px; line-height:1.45; }
      .head { display:flex; justify-content:space-between; border-bottom:2px solid #167d78; padding-bottom:12px; }
      .brand { color:#167d78; font-size:22px; font-weight:700; } .muted { color:#5d6d7e; }
      h1 { text-align:center; letter-spacing:2px; margin:28px 0 8px; } h2 { font-size:14px; margin:18px 0 8px; color:#167d78; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; padding:12px; background:#f5f9f9; border-radius:8px; }
      .medicine { break-inside:avoid; border-bottom:1px solid #d8e2e2; padding:10px 0; } .medicine h3 { margin:0 0 4px; font-size:14px; }
      .signature { break-inside:avoid; margin-top:20px; margin-left:auto; width:230px; min-height:68px; border:1px solid #9aa; padding:10px; text-align:center; }
      .fingerprint { break-inside:avoid; margin-top:14px; font-size:8px; color:#667; word-break:break-all; }
    </style></head><body>
      <div class="head"><div><div class="brand">HEALIXDZ</div><b>${text(input.organization, 'name')}</b></div><div>${text(input.organization, 'address')}<br>${text(input.organization, 'wilaya')}<br>${text(input.organization, 'phone')}</div></div>
      <h1>ORDONNANCE</h1><p style="text-align:center"><b>N° ${escapeHtml(input.number)}</b> · ${escapeHtml(date)}</p>
      <h2>Patient</h2><div class="grid"><div><b>Nom :</b> ${text(input.patient, 'lastName')}</div><div><b>Prénom :</b> ${text(input.patient, 'firstName')}</div><div><b>Date de naissance :</b> ${text(input.patient, 'birthDate')}</div><div><b>N° dossier :</b> ${text(input.patient, 'hospitalRecordNumber') || '—'}</div></div>
      <h2>Prescripteur</h2><div class="grid"><div><b>Dr :</b> ${text(input.prescriber, 'fullName')}</div><div><b>Spécialité :</b> ${text(input.prescriber, 'speciality')}</div><div><b>N° d’Ordre :</b> ${text(input.prescriber, 'registrationNumber')}</div><div><b>Conseil régional :</b> ${text(input.prescriber, 'regionalCouncil')}</div><div style="grid-column:1 / 3"><b>Adresse professionnelle :</b> ${text(input.prescriber, 'professionalAddress')}</div></div>
      <h2>Médicaments</h2>${items}
      <p>Fait à ${text(input.organization, 'wilaya')}, le ${escapeHtml(date)}.</p>
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
