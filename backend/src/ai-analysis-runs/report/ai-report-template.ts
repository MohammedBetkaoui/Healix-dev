// The AI analysis report, in French only: an HTML page and the header and
// footer Chromium prints on every page. Pure: everything it shows comes in
// through ReportInput, which carries only what may be printed (never the
// national identity number nor the phone of the patient). No urgency level,
// no suggested specialist, no consultation delay, no recommendation: the
// physician's conclusion is the only conclusion of the document.

import { createSha256Checksum } from '../../common/utils/checksum.util';
import {
  BRAIN_CLASS_LABELS,
  type ConfusionWarning,
  evaluationMatchesWeights,
  type EvaluationReport,
  getConfidenceSplit,
  getConfusionWarning,
  isUncertain,
  UNCERTAINTY_THRESHOLD,
} from './ai-report-rules';

export const ACCENT_COLOR = '#0F2942';
const TIME_ZONE = 'Africa/Algiers';

const CLASS_LABELS: Record<string, string> = {
  glioma: 'Gliome',
  meningioma: 'Méningiome',
  notumor: 'Absence de tumeur décelée',
  other: 'Autre (hors des classes du modèle)',
  pituitary: 'Adénome hypophysaire',
};

const ESTABLISHMENT_TYPES: Record<string, string> = {
  CLINIC: 'Clinique',
  GROUP_PRACTICE: 'Cabinet de groupe',
  HOSPITAL: 'Hôpital',
  IMAGING_CENTER: "Centre d'imagerie médicale",
  LABORATORY: "Laboratoire d'analyses",
};

const MODEL_NAMES: Record<string, string> = {
  'brain-efficientnetb4-tumor-classification':
    'EfficientNet-B4 (classification)',
  'brain-unet-meningioma-segmentation': 'U-Net méningiome (segmentation)',
  'brain-unet-pituitary-segmentation':
    'U-Net adénome hypophysaire (segmentation)',
};

const SKIPPED_SEGMENTATION: Record<string, string> = {
  model_not_loaded:
    "Pas de contour : le modèle de segmentation n'était pas disponible lors de l'analyse.",
  not_applicable_for_class:
    "Pas de contour : seuls le méningiome et l'adénome hypophysaire sont segmentés.",
};

export type ReportPerson = {
  fullName: string;
  role: 'physician' | 'establishmentAdmin' | 'other';
  speciality: string | null;
};

export type ReportStructure =
  | {
      kind: 'establishment';
      name: string;
      type: string;
      address: string;
      wilaya: string;
      phone: string;
      email: string;
    }
  | {
      kind: 'practice';
      doctorName: string;
      speciality: string;
      address: string;
      wilaya: string;
    }
  | { kind: 'unknown' };

export type ReportInput = {
  reportNumber: string;
  editedAt: Date;
  structure: ReportStructure;
  patient: {
    id: string;
    lastName: string;
    firstName: string;
    gender: 'MALE' | 'FEMALE';
    birthDate: Date;
    hospitalRecordNumber: string | null;
  };
  run: {
    id: string;
    createdAt: Date;
    clinicianImpression: string | null;
    predictions: { label: string; probability: number }[];
    classificationModelId: string | null;
    classificationWeightsSha256: string | null;
    segmentationModelId: string | null;
    segmentationWeightsSha256: string | null;
    maskAreaPx: number | null;
    maskAreaRatio: number | null;
    segmentationSkippedReason: string | null;
    durationMs: number | null;
    decisionStatus: 'VALIDATED' | 'CORRECTED';
    decisionLabel: string;
    decisionReason: string | null;
    decidedAt: Date;
  };
  requestedBy: ReportPerson;
  decidedBy: ReportPerson;
  sourceDocument: {
    originalName: string;
    createdAt: Date;
    mimeType: string;
    data: Buffer;
    width: number | null;
    height: number | null;
    checksum: string | null;
  };
  mask: { data: Buffer; sha256: string } | null;
  /** null when the evaluation report is missing or incomplete. */
  evaluation: EvaluationReport | null;
  fonts: { regular: Buffer; semibold: Buffer; bold: Buffer };
};

export type ReportDocument = {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
  /** SHA-256 of the printed facts: the fingerprint shown on the document. */
  contentSha256: string;
};

// --- Formatting ---------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const date = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: TIME_ZONE,
});
const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});
// A birth date is a calendar date stored at midnight UTC.
const birthDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'UTC',
});
const percent = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  style: 'percent',
});
// Probabilities with one fixed decimal, so the column reads evenly.
const probability = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  style: 'percent',
});
const integer = new Intl.NumberFormat('fr-FR');

export const formatDate = (value: Date) => date.format(value);
export const formatDateTime = (value: Date) => dateTime.format(value);
export const formatPercent = (value: number) => percent.format(value);

export function ageAt(birth: Date, at: Date): number {
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < birth.getUTCMonth() ||
    (at.getUTCMonth() === birth.getUTCMonth() &&
      at.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function classLabel(label: string): string {
  return CLASS_LABELS[label] ?? label;
}

/** "Dr <name>" for a physician only: no title is ever invented. */
export function personName(person: ReportPerson): string {
  if (person.role === 'physician') return `Dr ${person.fullName}`;
  if (person.role === 'establishmentAdmin') {
    return `${person.fullName} (administration de l'établissement)`;
  }
  return person.fullName;
}

const shortSha = (sha: string | null) => (sha ? sha.slice(0, 12) : '—');

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// --- Sections -----------------------------------------------------------------

function fontFaces(fonts: ReportInput['fonts']): string {
  const face = (data: Buffer, weight: number) =>
    `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');}`;
  return (
    face(fonts.regular, 400) + face(fonts.semibold, 600) + face(fonts.bold, 700)
  );
}

function structureLines(structure: ReportStructure): string[] {
  switch (structure.kind) {
    case 'establishment':
      return [
        `<strong>${escapeHtml(structure.name)}</strong>`,
        escapeHtml(ESTABLISHMENT_TYPES[structure.type] ?? structure.type),
        escapeHtml(structure.address),
        `Wilaya : ${escapeHtml(structure.wilaya)}`,
        `Tél. ${escapeHtml(structure.phone)} · ${escapeHtml(structure.email)}`,
      ];
    case 'practice':
      return [
        `<strong>Dr ${escapeHtml(structure.doctorName)}</strong>`,
        escapeHtml(structure.speciality),
        escapeHtml(structure.address),
        `Wilaya : ${escapeHtml(structure.wilaya)}`,
      ];
    default:
      return ['Structure non renseignée'];
  }
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function identification(input: ReportInput): string {
  const { patient, run } = input;
  const recordRow = patient.hospitalRecordNumber
    ? row('N° de dossier hospitalier', escapeHtml(patient.hospitalRecordNumber))
    : row('Identifiant interne', escapeHtml(patient.id));
  return `<section>
  <h2>Identification</h2>
  <table class="facts">
    ${row('Patient', `<strong>${escapeHtml(patient.lastName.toLocaleUpperCase('fr-FR'))}</strong> ${escapeHtml(patient.firstName)}`)}
    ${row('Sexe', patient.gender === 'FEMALE' ? 'Féminin' : 'Masculin')}
    ${row('Date de naissance', `${birthDate.format(patient.birthDate)} (${ageAt(patient.birthDate, run.createdAt)} ans à la date de l'analyse)`)}
    ${recordRow}
    ${row('Médecin demandeur', escapeHtml(personName(input.requestedBy)))}
    ${row("Date et heure de l'analyse", formatDateTime(run.createdAt))}
    ${row('Médecin ayant validé', escapeHtml(personName(input.decidedBy)))}
    ${row('Date de validation', formatDateTime(run.decidedAt))}
  </table>
</section>`;
}

function indication(input: ReportInput): string {
  const impression = input.run.clinicianImpression?.trim();
  return `<section>
  <h2>Indication</h2>
  <p>${impression ? escapeHtml(impression) : 'Non renseignée.'}</p>
</section>`;
}

function technique(input: ReportInput): string {
  const { run, sourceDocument } = input;
  const dimensions =
    sourceDocument.width && sourceDocument.height
      ? `${integer.format(sourceDocument.width)} × ${integer.format(sourceDocument.height)} pixels`
      : 'Non déterminées';
  const models = [
    run.classificationModelId
      ? `${escapeHtml(MODEL_NAMES[run.classificationModelId] ?? run.classificationModelId)} — empreinte des poids ${shortSha(run.classificationWeightsSha256)}`
      : null,
    run.segmentationModelId
      ? `${escapeHtml(MODEL_NAMES[run.segmentationModelId] ?? run.segmentationModelId)} — empreinte des poids ${shortSha(run.segmentationWeightsSha256)}`
      : null,
  ].filter((entry): entry is string => entry !== null);
  const duration =
    run.durationMs === null
      ? 'Non renseignée'
      : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(run.durationMs / 1000)} s`;

  return `<section>
  <h2>Technique</h2>
  <table class="facts">
    ${row('Document analysé', escapeHtml(sourceDocument.originalName))}
    ${row("Date d'import", formatDateTime(sourceDocument.createdAt))}
    ${row('Dimensions', dimensions)}
    ${row("Chaîne d'analyse", 'Classification EfficientNet-B4, puis segmentation U-Net si méningiome ou adénome hypophysaire')}
    ${row('Modèles utilisés', models.join('<br />'))}
    ${row('Durée de traitement', duration)}
  </table>
  <p class="note">Analyse automatisée d'une coupe unique ; elle ne remplace pas la lecture de l'examen complet.</p>
</section>`;
}

function contourFigure(input: ReportInput, imageUri: string): string {
  const { sourceDocument, mask } = input;
  const width = sourceDocument.width ?? 512;
  const height = sourceDocument.height ?? 512;
  // Outline drawn outside the segmented area (white line, black halo), so it
  // never hides the edge of the region; in pixels of the image.
  const line = Math.max(1, Math.round(Math.max(width, height) / 256));
  return `<figure>
    <div class="slice" style="aspect-ratio: ${width} / ${height}">
      <img src="${imageUri}" alt="" />
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="contour" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
            <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="shape" />
            <feMorphology in="shape" operator="dilate" radius="${line}" result="outer" />
            <feComposite in="outer" in2="shape" operator="out" result="ring" />
            <feMorphology in="shape" operator="dilate" radius="${line * 2}" result="outer2" />
            <feComposite in="outer2" in2="outer" operator="out" result="halo" />
            <feFlood flood-color="#FFFFFF" result="white" />
            <feComposite in="white" in2="ring" operator="in" result="whiteRing" />
            <feFlood flood-color="#000000" result="black" />
            <feComposite in="black" in2="halo" operator="in" result="blackHalo" />
            <feMerge><feMergeNode in="blackHalo" /><feMergeNode in="whiteRing" /></feMerge>
          </filter>
        </defs>
        <image href="data:image/png;base64,${mask?.data.toString('base64') ?? ''}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" filter="url(#contour)" />
      </svg>
    </div>
    <figcaption><strong>Figure 2</strong> — Même coupe, contour de la segmentation</figcaption>
  </figure>`;
}

function confusionText(warning: ConfusionWarning): string {
  const counts = `Sur le jeu de test, ${integer.format(warning.count)} des ${integer.format(warning.total)} résultats « ${escapeHtml(classLabel(warning.predicted))} »`;
  if (warning.kind === 'otherClasses') {
    return `${counts} relevaient d'une autre classe.`;
  }
  return warning.negative
    ? `${counts} étaient des gliomes. Un résultat négatif n'exclut pas un gliome.`
    : `${counts} étaient des gliomes.`;
}

function results(input: ReportInput, evaluationApplies: boolean): string {
  const { run, sourceDocument, mask, evaluation } = input;
  const predictions = [...run.predictions].sort(
    (a, b) => b.probability - a.probability,
  );
  const top = predictions[0] ?? null;
  const imageUri = `data:${sourceDocument.mimeType};base64,${sourceDocument.data.toString('base64')}`;
  const ratio =
    sourceDocument.width && sourceDocument.height
      ? `aspect-ratio: ${sourceDocument.width} / ${sourceDocument.height}`
      : '';

  const surface =
    mask && run.maskAreaPx !== null && run.maskAreaRatio !== null
      ? `<p>Surface segmentée : <strong>${integer.format(run.maskAreaPx)} pixels</strong>, soit ${formatPercent(run.maskAreaRatio)} de la coupe. L'échelle physique de l'image est inconnue : aucune surface en mm² n'est donnée.</p>`
      : `<p>${escapeHtml(SKIPPED_SEGMENTATION[run.segmentationSkippedReason ?? ''] ?? 'Pas de contour de segmentation pour cette analyse.')}</p>`;

  const notices: string[] = [];
  if (evaluationApplies && evaluation && top) {
    if (isUncertain(top.probability)) {
      const split = getConfidenceSplit(evaluation.classification);
      const base = `Probabilité de la classe principale : ${formatPercent(top.probability)}, sous le seuil de ${formatPercent(UNCERTAINTY_THRESHOLD)}.`;
      notices.push(
        `<div class="notice"><strong>Résultat incertain</strong>${base}${
          split
            ? ` Sur le jeu de test, les résultats sous ce niveau de confiance étaient justes dans ${formatPercent(split.belowAccuracy)} des cas, contre ${formatPercent(split.aboveAccuracy)} au-dessus.`
            : ''
        }</div>`,
      );
    }
    const warning = getConfusionWarning(top.label, evaluation.classification);
    if (warning) {
      notices.push(
        `<div class="notice"><strong>Confusions observées sur le jeu de test</strong>${confusionText(warning)}</div>`,
      );
    }
  }

  return `<section>
  <h2>Résultats</h2>
  <table class="grid">
    <thead><tr><th scope="col">Classe</th><th scope="col" class="num">Probabilité</th></tr></thead>
    <tbody>
      ${predictions
        .map(
          (prediction, index) =>
            `<tr${index === 0 ? ' class="top"' : ''}><td>${escapeHtml(classLabel(prediction.label))}${index === 0 ? ' <span class="tag">classe principale du modèle</span>' : ''}</td><td class="num">${probability.format(prediction.probability)}</td></tr>`,
        )
        .join('\n      ')}
    </tbody>
  </table>
  <div class="figures">
    <figure>
      <div class="slice" style="${ratio}"><img src="${imageUri}" alt="" /></div>
      <figcaption><strong>Figure 1</strong> — Coupe analysée</figcaption>
    </figure>
    ${mask ? contourFigure(input, imageUri) : ''}
  </div>
  ${surface}
  ${notices.join('\n  ')}
</section>`;
}

function conclusion(input: ReportInput): string {
  const { run } = input;
  return `<section class="conclusion">
  <h2>Conclusion du médecin</h2>
  <p class="verdict">${run.decisionStatus === 'CORRECTED' ? 'Résultat corrigé' : 'Résultat validé'}</p>
  <table class="facts">
    ${row('Classe retenue', `<strong>${escapeHtml(classLabel(run.decisionLabel))}</strong>`)}
    ${run.decisionReason ? row('Motif', escapeHtml(run.decisionReason)) : ''}
  </table>
</section>`;
}

function performances(input: ReportInput, evaluationApplies: boolean): string {
  const { evaluation } = input;
  if (!evaluationApplies || !evaluation) {
    return `<section class="small">
  <h2>Performances de référence</h2>
  <p>Performances non mesurées pour cette version des modèles.</p>
</section>`;
  }
  const { classification, imagesPerClass } = evaluation;
  const counts = Object.values(imagesPerClass);
  const perClass = counts.every((count) => count === counts[0])
    ? `${integer.format(counts[0])} par classe`
    : BRAIN_CLASS_LABELS.map(
        (label) =>
          `${classLabel(label)} ${integer.format(imagesPerClass[label])}`,
      ).join(', ');
  const recalls = BRAIN_CLASS_LABELS.map(
    (label) =>
      `${escapeHtml(classLabel(label))} ${formatPercent(classification.perClass[label].recall)}`,
  ).join(' ; ');
  return `<section class="small">
  <h2>Performances de référence</h2>
  <p>Mesurées le ${formatDate(new Date(evaluation.generatedAt))} sur le jeu de test Nickparvar (${integer.format(classification.testImages)} images, ${perClass}), en une passe, sans augmentation des images au test (rapport ${escapeHtml(evaluation.file)}). Exactitude : ${formatPercent(classification.accuracy.value)} (intervalle de confiance à 95 % : ${formatPercent(classification.accuracy.ci95[0])} – ${formatPercent(classification.accuracy.ci95[1])}). Rappel par classe : ${recalls}.</p>
</section>`;
}

function legal(input: ReportInput, evaluationApplies: boolean): string {
  const gliomaRecall =
    evaluationApplies && input.evaluation
      ? ` : ${formatPercent(input.evaluation.classification.perClass.glioma.recall)} sur le jeu de test`
      : '';
  const limitations = [
    "Métriques issues d'une validation interne : performances à confirmer sur les données de votre établissement.",
    "Ne reconnaît que les classes listées : une anomalie d'un autre type ne peut pas être signalée comme telle.",
    "Analyse d'images 2D : le contexte volumique de l'examen (autres coupes) n'est pas pris en compte.",
    `Rappel plus faible sur les gliomes${gliomaRecall}.`,
    ...(input.run.segmentationModelId
      ? [
          'Segmentation évaluée uniquement sur des images contenant la tumeur visée.',
        ]
      : []),
  ];
  return `<section class="small">
  <h2>Mentions légales</h2>
  <p>Aide à la décision. Ce compte rendu ne constitue pas un diagnostic à lui seul et ne remplace pas l'avis d'un médecin. Modèles non certifiés comme dispositifs médicaux.</p>
  <ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`;
}

function signature(input: ReportInput, contentSha256: string): string {
  const { decidedBy, run } = input;
  return `<div class="signature">
  <p class="signer">${escapeHtml(personName(decidedBy))}</p>
  ${decidedBy.speciality ? `<p>${escapeHtml(decidedBy.speciality)}</p>` : ''}
  <p>Validé le ${formatDateTime(run.decidedAt)}</p>
  <p class="electronic">Validé électroniquement dans HealixDZ</p>
  <p class="fingerprint">Empreinte du document : ${contentSha256.slice(0, 16)}</p>
</div>`;
}

const STYLES = `
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Inter',Arial,sans-serif;font-size:9.4pt;line-height:1.45;color:#1a1a1a}
h1{margin:0;font-size:12.5pt;font-weight:700;letter-spacing:.02em;text-align:center;color:${ACCENT_COLOR}}
.subtitle{margin:1.5mm 0 0;text-align:center;font-size:10.5pt;font-weight:600;color:${ACCENT_COLOR}}
.title{padding-bottom:4mm;border-bottom:1pt solid ${ACCENT_COLOR};margin-bottom:5mm}
section{margin-top:5mm}
h2{margin:0 0 2.2mm;padding-bottom:1mm;border-bottom:.6pt solid ${ACCENT_COLOR};font-size:9pt;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${ACCENT_COLOR};break-after:avoid}
p{margin:0 0 1.6mm}
table{width:100%;border-collapse:collapse;break-inside:avoid}
th,td{padding:1.1mm 2mm;border-bottom:.4pt solid #cfcfcf;text-align:left;vertical-align:top}
table.facts th{width:38%;font-weight:600;color:#4a4a4a}
table.grid thead th{font-weight:600;color:#4a4a4a;border-bottom:.6pt solid #8a8a8a}
table.grid .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.grid tr.top td{font-weight:600}
.tag{font-size:7.6pt;font-weight:400;color:#5a5a5a}
.note{margin-top:2mm;font-size:8.4pt;color:#4a4a4a}
.figures{display:flex;gap:6mm;margin:4mm 0 3mm;break-inside:avoid}
figure{margin:0;width:62mm;break-inside:avoid}
.slice{position:relative;width:100%;background:#000;border:.4pt solid #8a8a8a}
.slice img,.slice svg{position:absolute;inset:0;width:100%;height:100%;display:block}
figcaption{margin-top:1.4mm;font-size:8pt;color:#4a4a4a}
.notice{margin-top:3mm;padding:2.4mm 3mm;border:.7pt solid #5a5a5a;break-inside:avoid}
.notice strong{display:block;margin-bottom:.6mm}
section.conclusion{margin-top:6mm;padding:3.5mm 4mm;border:1.3pt solid ${ACCENT_COLOR};break-inside:avoid}
.conclusion .verdict{font-size:11pt;font-weight:700;color:${ACCENT_COLOR}}
.conclusion table.facts th{width:28%}
section.small{font-size:7.8pt;color:#3a3a3a}
section.small h2{font-size:7.8pt}
section.small ul{margin:1mm 0 0;padding-left:4mm}
.signature{width:72mm;margin:9mm 0 0 auto;padding-top:2.2mm;border-top:.6pt solid ${ACCENT_COLOR};break-inside:avoid;font-size:8.6pt}
.signature p{margin:0 0 .6mm}
.signature .signer{font-size:10pt;font-weight:700}
.signature .electronic{margin-top:1.4mm;font-weight:600;color:${ACCENT_COLOR}}
.signature .fingerprint{margin-top:2mm;font-size:7.4pt;color:#5a5a5a;letter-spacing:.03em}
`;

/** Builds the report; the printed facts are hashed into its fingerprint. */
export function buildReportDocument(input: ReportInput): ReportDocument {
  const evaluationApplies = evaluationMatchesWeights(
    input.run.classificationWeightsSha256,
    input.evaluation?.classifierSha256 ?? null,
  );

  // What the document certifies: printed facts, and the hashes of the images.
  const contentSha256 = createSha256Checksum(
    Buffer.from(
      stableStringify({
        decidedBy: input.decidedBy,
        document: {
          checksum:
            input.sourceDocument.checksum ??
            createSha256Checksum(input.sourceDocument.data),
          createdAt: input.sourceDocument.createdAt,
          height: input.sourceDocument.height,
          name: input.sourceDocument.originalName,
          width: input.sourceDocument.width,
        },
        editedAt: input.editedAt,
        evaluation:
          evaluationApplies && input.evaluation
            ? {
                file: input.evaluation.file,
                sha256: input.evaluation.classifierSha256,
              }
            : null,
        maskSha256: input.mask?.sha256 ?? null,
        patient: input.patient,
        reportNumber: input.reportNumber,
        requestedBy: input.requestedBy,
        run: input.run,
        structure: input.structure,
      }),
      'utf8',
    ),
  );

  const fonts = fontFaces(input.fonts);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Compte rendu ${escapeHtml(input.reportNumber)}</title>
<style>${fonts}${STYLES}</style>
</head>
<body>
<div class="title">
  <h1>COMPTE RENDU D'ANALYSE D'IMAGERIE ASSISTÉE PAR INTELLIGENCE ARTIFICIELLE</h1>
  <p class="subtitle">Imagerie cérébrale (IRM)</p>
</div>
${identification(input)}
${indication(input)}
${technique(input)}
${results(input, evaluationApplies)}
${conclusion(input)}
${performances(input, evaluationApplies)}
${legal(input, evaluationApplies)}
${signature(input, contentSha256)}
</body>
</html>`;

  // Chromium prints these in the page margins; they need their own styles.
  const templateStyle = `<style>${fonts}
.band{width:100%;padding:0 18mm;font-family:'Inter',Arial,sans-serif;font-size:7.4pt;line-height:1.35;color:#1a1a1a;-webkit-print-color-adjust:exact}
.band strong{font-weight:700}
</style>`;
  const headerTemplate = `${templateStyle}
<div class="band" style="padding-top:12mm">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;padding-bottom:2mm;border-bottom:.6pt solid ${ACCENT_COLOR}">
    <div>${structureLines(input.structure).join('<br />')}</div>
    <div style="text-align:right;white-space:nowrap">
      <div style="font-weight:700;color:${ACCENT_COLOR}">Compte rendu n° ${escapeHtml(input.reportNumber)}</div>
      <div>Édité le ${formatDate(input.editedAt)}</div>
    </div>
  </div>
</div>`;
  const footerTemplate = `${templateStyle}
<div class="band" style="padding-bottom:10mm">
  <div style="display:flex;justify-content:space-between;gap:6mm;padding-top:2mm;border-top:.6pt solid #8a8a8a;color:#4a4a4a">
    <span>Document médical confidentiel — soumis au secret médical</span>
    <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    <span>Généré par HealixDZ</span>
  </div>
</div>`;

  return { contentSha256, footerTemplate, headerTemplate, html };
}
