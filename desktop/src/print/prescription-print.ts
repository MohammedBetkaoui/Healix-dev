import { fr } from "../i18n/fr";

// The printable prescription, offline. It reproduces the document the server
// renders for a validated prescription (backend/src/prescriptions/
// prescription-pdf.service.ts): A4, the HealixDz header with the cabinet,
// "ORDONNANCE", the Patient / Prescripteur / Médicaments blocks, "Fait à …, le …",
// the stamp and signature frame and the content fingerprint.
//
// What differs, on purpose:
//   - a draft has no official number: the page says it was established offline
//     and that the number is given at synchronization, and carries no
//     fingerprint (nothing has been fixed yet);
//   - the pharmaceutical form and the route are written in French, not as the
//     codes of the database;
//   - the footer says this is an offline print, not the archived document.
//
// Every value is escaped: a patient called "<script>" prints as text.

export type PrintPatient = {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  hospitalRecordNumber?: string | null;
};

export type PrintPrescriber = {
  fullName?: string | null;
  speciality?: string | null;
  registrationNumber?: string | null;
  regionalCouncil?: string | null;
  professionalAddress?: string | null;
};

export type PrintOrganization = {
  name?: string | null;
  address?: string | null;
  wilaya?: string | null;
  phone?: string | null;
};

export type PrintItem = {
  dci: string;
  brandName?: string | null;
  strength: string;
  pharmaceuticalForm: string;
  route: string;
  dosePerIntake: string;
  frequency: string;
  intakeMoment?: string | null;
  durationDays?: number | null;
  quantity: string;
  patientInstructions?: string | null;
};

export type PrescriptionPrintInput = {
  // The official number of a validated prescription; null for a draft.
  number: string | null;
  // Validated: the date it was prescribed. Draft: when it was established here.
  date: string | null;
  // Validated only.
  contentFingerprint: string | null;
  patient: PrintPatient;
  prescriber: PrintPrescriber;
  organization: PrintOrganization;
  items: PrintItem[];
};

export const escapeHtml = (value: unknown) =>
  (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : value instanceof Date ? value.toISOString() : "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const longDate = (iso: string | null | undefined) => {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Algiers", dateStyle: "long" }).format(Number.isNaN(date.getTime()) ? new Date() : date);
};

const shortDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

const itemHtml = (item: PrintItem, index: number) => {
  const form = fr.prescription.forms[item.pharmaceuticalForm] ?? item.pharmaceuticalForm;
  const route = fr.prescription.routes[item.route] ?? item.route;
  return `<section class="medicine">
          <h3>${index + 1}. ${escapeHtml(item.dci)}${item.brandName ? ` — ${escapeHtml(item.brandName)}` : ""}</h3>
          <div class="muted">${escapeHtml(item.strength)} · ${escapeHtml(form)} · ${escapeHtml(route)}</div>
          <p><b>Posologie :</b> ${escapeHtml(item.dosePerIntake)} — ${escapeHtml(item.frequency)}${item.intakeMoment ? ` — ${escapeHtml(item.intakeMoment)}` : ""}</p>
          <p><b>Durée :</b> ${item.durationDays ? `${item.durationDays} jour(s)` : "Non précisée"} · <b>Quantité :</b> ${escapeHtml(item.quantity)}</p>
          ${item.patientInstructions ? `<p><b>Instructions :</b> ${escapeHtml(item.patientInstructions)}</p>` : ""}
        </section>`;
};

export function renderPrescriptionHtml(input: PrescriptionPrintInput): string {
  const { patient, prescriber, organization } = input;
  const validated = Boolean(input.number);
  const date = longDate(input.date);
  const heading = validated
    ? `<p style="text-align:center"><b>N° ${escapeHtml(input.number)}</b> · ${escapeHtml(date)}</p>`
    : `<p style="text-align:center"><b>Établie hors ligne le ${escapeHtml(date)}</b> — numéro attribué lors de la synchronisation</p>`;
  const footer = validated
    ? "Copie imprimée hors ligne depuis HealixDz Desktop — le document archivé par HealixDz fait foi."
    : "Brouillon établi hors ligne depuis HealixDz Desktop — numéro attribué lors de la synchronisation.";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${validated ? "Ordonnance" : "Ordonnance (brouillon)"}</title><style>
      @page { size: A4 portrait; margin: 18mm 18mm 22mm; } body { font-family: Arial, sans-serif; color:#17202a; font-size:12px; line-height:1.45; margin:0; }
      .head { display:flex; justify-content:space-between; border-bottom:2px solid #167d78; padding-bottom:12px; }
      .brand { color:#167d78; font-size:22px; font-weight:700; } .muted { color:#5d6d7e; }
      h1 { text-align:center; letter-spacing:2px; margin:28px 0 8px; } h2 { font-size:14px; margin:18px 0 8px; color:#167d78; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; padding:12px; background:#f5f9f9; border-radius:8px; }
      .medicine { break-inside:avoid; border-bottom:1px solid #d8e2e2; padding:10px 0; } .medicine h3 { margin:0 0 4px; font-size:14px; }
      .signature { break-inside:avoid; margin-top:20px; margin-left:auto; width:230px; min-height:68px; border:1px solid #9aa; padding:10px; text-align:center; }
      .fingerprint { break-inside:avoid; margin-top:14px; font-size:8px; color:#667; word-break:break-all; }
      .page-footer { position:fixed; left:0; right:0; bottom:0; font-size:8px; text-align:center; color:#667; }
    </style></head><body>
      <div class="head"><div><div class="brand">HEALIXDZ</div><b>${escapeHtml(organization.name)}</b></div><div>${escapeHtml(organization.address)}<br>${escapeHtml(organization.wilaya)}<br>${escapeHtml(organization.phone)}</div></div>
      <h1>ORDONNANCE</h1>${heading}
      <h2>Patient</h2><div class="grid"><div><b>Nom :</b> ${escapeHtml(patient.lastName)}</div><div><b>Prénom :</b> ${escapeHtml(patient.firstName)}</div><div><b>Date de naissance :</b> ${escapeHtml(shortDate(patient.birthDate))}</div><div><b>N° dossier :</b> ${escapeHtml(patient.hospitalRecordNumber) || "—"}</div></div>
      <h2>Prescripteur</h2><div class="grid"><div><b>Dr :</b> ${escapeHtml(prescriber.fullName)}</div><div><b>Spécialité :</b> ${escapeHtml(prescriber.speciality)}</div><div><b>N° d’Ordre :</b> ${escapeHtml(prescriber.registrationNumber)}</div><div><b>Conseil régional :</b> ${escapeHtml(prescriber.regionalCouncil)}</div><div style="grid-column:1 / 3"><b>Adresse professionnelle :</b> ${escapeHtml(prescriber.professionalAddress)}</div></div>
      <h2>Médicaments</h2>${input.items.map(itemHtml).join("")}
      <p>Fait à ${escapeHtml(organization.wilaya)}, le ${escapeHtml(date)}.</p>
      <div class="signature">Cachet / signature manuscrite</div>${validated && input.contentFingerprint ? `
      <div class="fingerprint">Empreinte du contenu : ${escapeHtml(input.contentFingerprint)}</div>` : ""}
      <div class="page-footer">${escapeHtml(footer)}</div>
    </body></html>`;
}
