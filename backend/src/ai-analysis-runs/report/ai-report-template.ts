// The AI analysis report, in French only: an HTML page and the header and
// footer Chromium prints on every page. Pure: everything it shows comes in
// through ReportInput, which carries only what may be printed (never the
// national identity number nor the phone of the patient). No urgency level,
// no suggested specialist, no consultation delay, no recommendation: the
// physician's conclusion is the only conclusion of the document. One template
// for the four chains (brain, pathology-breast, pathology-nuclei, cardio-ecg);
// a measured figure is printed only from the evaluation of the analysis's own
// weights.

import { createSha256Checksum } from '../../common/utils/checksum.util';
import { formatPhysicianName } from '../../common/utils/physician-name';
import {
  ECG_CLASSES,
  NUCLEUS_TYPES,
  type EcgClass,
  type NucleusType,
} from '../ai-service.client';
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
import { type CardioEvaluation } from './cardio-evaluation';
import { NUCLEI_PALETTE } from './nuclei-palette';
import {
  type BreakhisEvaluation,
  type PannukeEvaluation,
} from './pathology-evaluation';

export const ACCENT_COLOR = '#0F2942';
const TIME_ZONE = 'Africa/Algiers';

const CLASS_LABELS: Record<string, string> = {
  benign: 'Bénin',
  glioma: 'Gliome',
  malignant: 'Malin',
  meningioma: 'Méningiome',
  notumor: 'Absence de tumeur décelée',
  other: 'Autre (hors des classes du modèle)',
  pituitary: 'Adénome hypophysaire',
};

// The BreakHis result, as written in a sentence.
const BREAST_RESULTS: Record<string, string> = {
  benign: 'bénin',
  malignant: 'malin',
};

const TTA_VIEW_NAMES = [
  'Image originale',
  'Retournement horizontal',
  'Retournement vertical',
  'Retournements horizontal et vertical',
];

const NUCLEUS_NAMES: Record<NucleusType, string> = {
  connective: 'Conjonctifs',
  dead: 'Morts',
  epithelial: 'Épithéliaux',
  inflammatory: 'Inflammatoires',
  neoplastic: 'Néoplasiques',
};
// The 5 superclasses of PTB-XL, named in French, with their code.
export const ECG_CLASS_NAMES: Record<EcgClass, string> = {
  CD: 'Trouble de la conduction',
  HYP: 'Hypertrophie',
  MI: 'Infarctus du myocarde',
  NORM: 'ECG normal',
  STTC: 'Trouble ST/T',
};

// Too rare in training and in test: its share is shown, flagged.
const UNRELIABLE_NUCLEUS_TYPES: readonly NucleusType[] = ['dead'];

// No evaluation report measured the weights of the analysis.
const notMeasured = (weightsSha256: string | null) =>
  weightsSha256
    ? `Performances non mesurées pour ces poids (empreinte ${escapeHtml(weightsSha256.slice(0, 8))}).`
    : 'Performances non mesurées pour ces poids.';

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
  'pathology-breakhis-classification':
    'EfficientNet-B0 BreakHis (classification bénin / malin)',
  'pathology-unet-pannuke-segmentation':
    'U-Net EfficientNet-B0 PanNuke (segmentation des noyaux)',
  'cardio-ecg-resnet1d-ptbxl-superdiagnostic':
    'ResNet1D-34 PTB-XL (classification multi-label de l’ECG 12 dérivations)',
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
    /** brain, pathology-breast or pathology-nuclei. */
    pipeline: string;
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
    /** null for a validated nuclei map: no label. */
    decisionLabel: string | null;
    decisionReason: string | null;
    decidedAt: Date;
    // Pathology (null for brain).
    magnification: number | null;
    malignancyScore: number | null;
    decisionThreshold: number | null;
    ttaScores: number[] | null;
    modelDecision: string | null;
    nucleiFractions: {
      background: number;
      nucleusTypes: Record<string, number | null>;
    } | null;
    tileCount: number | null;
    // Cardiology (null for the other chains).
    ecg: {
      probabilities: Record<EcgClass, number>;
      thresholds: Record<EcgClass, number>;
      /** Classes at or above their threshold. */
      positive: EcgClass[];
      windows: number;
      inputSamplingRate: number;
      durationSeconds: number;
      /** SHA-256 of the model card (thresholds, filter, leads). */
      configSha256: string;
    } | null;
    /** The classes the physician kept on an ECG (possibly none); null otherwise. */
    decisionLabels: EcgClass[] | null;
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
  /** Colour overlay of a nuclei segmentation. */
  overlay: { data: Buffer; sha256: string } | null;
  /** Lead II of the stored ECG trace (first 10 s, filtered, mV), as drawn. */
  ecgTrace: { samplingRate: number; leadII: number[]; sha256: string } | null;
  /** Cardiology: the service's evaluation of these weights, else the notebook's, or null. */
  cardioEvaluation: CardioEvaluation | null;
  /** brain: null when the evaluation report is missing or incomplete. */
  evaluation: EvaluationReport | null;
  /** Pathology: the evaluation of these very weights, or null. */
  breakhisEvaluation: BreakhisEvaluation | null;
  pannukeEvaluation: PannukeEvaluation | null;
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
const decimals = (digits: number) =>
  new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

export const formatDate = (value: Date) => date.format(value);
export const formatDateTime = (value: Date) => dateTime.format(value);
export const formatPercent = (value: number) => percent.format(value);

/**
 * A malignancy score with 2 decimals, more if 2 would put it on the other
 * side of the threshold (0.128 would read 0,13 at a 0.13 threshold).
 */
export function formatScore(score: number, threshold: number): string {
  for (let digits = 2; digits < 6; digits += 1) {
    const shown = Number(score.toFixed(digits));
    if (shown >= threshold === score >= threshold) {
      return decimals(digits).format(score);
    }
  }
  return decimals(6).format(score);
}

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
  if (person.role === 'physician') return formatPhysicianName(person.fullName);
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
        `<strong>${escapeHtml(formatPhysicianName(structure.doctorName))}</strong>`,
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

  if (run.pipeline !== 'brain') {
    const breast = run.pipeline === 'pathology-breast';
    return `<section>
  <h2>Technique</h2>
  <table class="facts">
    ${row('Document analysé', escapeHtml(sourceDocument.originalName))}
    ${row("Date d'import", formatDateTime(sourceDocument.createdAt))}
    ${row('Dimensions', dimensions)}
    ${row('Grossissement', run.magnification === null ? 'Non renseigné' : `${integer.format(run.magnification)}×${breast ? '' : ' (image H&amp;E, déclarée lors de la demande)'}`)}
    ${row("Chaîne d'analyse", breast ? 'Classification bénin / malin, moyenne de 4 vues de l’image (originale et retournements)' : `Segmentation sémantique des noyaux, en tuiles de 256 × 256 pixels${run.tileCount === null ? '' : ` (${integer.format(run.tileCount)} tuile${run.tileCount > 1 ? 's' : ''} analysée${run.tileCount > 1 ? 's' : ''})`}`)}
    ${row('Modèle utilisé', models.join('<br />'))}
    ${row('Durée de traitement', duration)}
  </table>
  <p class="note">Analyse automatisée d'une image unique ; elle ne remplace pas la lecture de la lame complète.</p>
</section>`;
  }

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
  const nuclei = run.pipeline === 'pathology-nuclei';
  const verdict = nuclei
    ? 'Carte de segmentation relue et acceptée'
    : run.decisionStatus === 'CORRECTED'
      ? 'Résultat corrigé'
      : 'Résultat validé';
  const ecgLabels = run.pipeline === 'cardio-ecg' ? run.decisionLabels : null;
  const labelRow = ecgLabels
    ? row(
        'Classes retenues',
        ecgLabels.length > 0
          ? ecgLabels
              .map(
                (label) =>
                  `<strong>${escapeHtml(ecgClassName(label))}</strong>`,
              )
              .join('<br />')
          : 'Aucune des 5 classes du modèle',
      )
    : nuclei || run.decisionLabel === null
      ? ''
      : row(
          run.pipeline === 'pathology-breast'
            ? 'Résultat retenu'
            : 'Classe retenue',
          `<strong>${escapeHtml(classLabel(run.decisionLabel))}</strong>`,
        );
  const reasonRow = run.decisionReason
    ? row('Motif', escapeHtml(run.decisionReason))
    : '';
  return `<section class="conclusion">
  <h2>Conclusion du médecin</h2>
  <p class="verdict">${verdict}</p>
  ${
    labelRow || reasonRow
      ? `<table class="facts">
    ${labelRow}
    ${reasonRow}
  </table>`
      : ''
  }
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

// --- Pathology ----------------------------------------------------------------

function sourceFigure(input: ReportInput, caption: string): string {
  const { sourceDocument } = input;
  const ratio =
    sourceDocument.width && sourceDocument.height
      ? `aspect-ratio: ${sourceDocument.width} / ${sourceDocument.height}`
      : '';
  return `<figure>
      <div class="slice" style="${ratio}"><img src="${imageUri(input)}" alt="" /></div>
      <figcaption><strong>Figure 1</strong> — ${caption}</figcaption>
    </figure>`;
}

const imageUri = (input: ReportInput) =>
  `data:${input.sourceDocument.mimeType};base64,${input.sourceDocument.data.toString('base64')}`;

/** The evaluation describes these weights (and was found for them). */
function breakhisApplies(input: ReportInput): boolean {
  return evaluationMatchesWeights(
    input.run.classificationWeightsSha256,
    input.breakhisEvaluation?.weightsSha256 ?? null,
  );
}

function pannukeApplies(input: ReportInput): boolean {
  return evaluationMatchesWeights(
    input.run.segmentationWeightsSha256,
    input.pannukeEvaluation?.weightsSha256 ?? null,
  );
}

/**
 * Warning for the result, read from the confusion matrix of the image's
 * magnification: for "malignant", the benign images among the "malignant"
 * results; for "benign", the malignant ones among the "benign" results.
 */
export function breastConfusionWarning(
  evaluation: BreakhisEvaluation,
  magnification: number | null,
  result: string | null,
): string | null {
  const metrics =
    magnification === null
      ? undefined
      : evaluation.byMagnification[String(magnification)];
  if (!metrics || (result !== 'malignant' && result !== 'benign')) return null;
  const [[tn, fp], [fn, tp]] = metrics.confusionMatrix;
  const [wrong, total] = result === 'malignant' ? [fp, fp + tp] : [fn, fn + tn];
  if (total === 0) return null;
  const at = `${integer.format(magnification as number)}×`;
  return result === 'malignant'
    ? `Sur le jeu de test à ${at}, ${integer.format(wrong)} des ${integer.format(total)} résultats « malin » étaient bénins.`
    : `Sur le jeu de test à ${at}, ${integer.format(wrong)} des ${integer.format(total)} résultats « bénin » étaient malins.`;
}

function breastResults(input: ReportInput): string {
  const { run } = input;
  const threshold = run.decisionThreshold ?? 0;
  const score = run.malignancyScore ?? 0;
  const result = BREAST_RESULTS[run.modelDecision ?? ''] ?? '—';
  const views = run.ttaScores ?? [];
  const magnification =
    run.magnification === null
      ? ''
      : ` (grossissement ${integer.format(run.magnification)}×)`;
  const warning =
    breakhisApplies(input) && input.breakhisEvaluation
      ? breastConfusionWarning(
          input.breakhisEvaluation,
          run.magnification,
          run.modelDecision,
        )
      : null;

  return `<section>
  <h2>Résultats</h2>
  <p class="model-result">Score de malignité du modèle : ${formatScore(score, threshold)} (score non calibré, ce n'est pas une probabilité) — seuil de décision ${decimals(2).format(threshold)} — résultat du modèle : ${result}</p>
  <table class="grid">
    <thead><tr><th scope="col">Vue de l'image</th><th scope="col" class="num">Score</th></tr></thead>
    <tbody>
      ${views
        .map(
          (view, index) =>
            `<tr><td>${TTA_VIEW_NAMES[index] ?? `Vue ${index + 1}`}</td><td class="num">${formatScore(view, threshold)}</td></tr>`,
        )
        .join('\n      ')}
    </tbody>
  </table>
  <p class="note">Le score retenu est la moyenne des ${integer.format(views.length)} vues.</p>
  <div class="figures">
    ${sourceFigure(input, `Image analysée${magnification}`)}
  </div>
  ${warning ? `<div class="notice"><strong>Confusions observées sur le jeu de test</strong>${escapeHtml(warning)}</div>` : ''}
</section>`;
}

function overlayFigure(input: ReportInput): string {
  const { sourceDocument, overlay } = input;
  const width = sourceDocument.width ?? 512;
  const height = sourceDocument.height ?? 512;
  // The RGBA overlay over the image, as it is: no contour filter.
  return `<figure>
    <div class="slice" style="aspect-ratio: ${width} / ${height}">
      <img src="${imageUri(input)}" alt="" />
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <image href="data:image/png;base64,${overlay?.data.toString('base64') ?? ''}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
      </svg>
    </div>
    <figcaption><strong>Figure 2</strong> — Même image, noyaux colorés par type</figcaption>
  </figure>`;
}

function nucleiResults(input: ReportInput): string {
  const { run, overlay } = input;
  const fractions = run.nucleiFractions;
  const shares = NUCLEUS_TYPES.map((type) => ({
    share: fractions?.nucleusTypes[type] ?? null,
    type,
  }));
  const anyNucleus = shares.some(({ share }) => share !== null);
  const legend = NUCLEUS_TYPES.map(
    (type) =>
      `<li><span class="swatch" style="background:${NUCLEI_PALETTE[type]}"></span>${NUCLEUS_NAMES[type]}</li>`,
  ).join('');
  const composition = anyNucleus
    ? `<table class="grid">
    <thead><tr><th scope="col">Composition par type</th><th scope="col" class="num">Part de la surface nucléaire</th></tr></thead>
    <tbody>
      ${shares
        .map(
          ({ share, type }) =>
            `<tr><td>${NUCLEUS_NAMES[type]}${UNRELIABLE_NUCLEUS_TYPES.includes(type) ? ' <span class="tag">non fiable</span>' : ''}</td><td class="num">${formatPercent(share ?? 0)}</td></tr>`,
        )
        .join('\n      ')}
    </tbody>
  </table>`
    : '<p>Aucun pixel de noyau sur cette image : pas de composition par type.</p>';

  return `<section>
  <h2>Résultats</h2>
  <table class="facts">
    ${row("Part de l'image couverte par des noyaux", fractions ? `<strong>${formatPercent(1 - fractions.background)}</strong>` : '—')}
  </table>
  ${composition}
  <div class="figures">
    ${sourceFigure(input, 'Image analysée (grossissement 40×)')}
    ${overlay ? overlayFigure(input) : ''}
  </div>
  <ul class="legend">${legend}</ul>
  <ul class="limits">
    <li>Segmentation sémantique : des noyaux accolés ne sont pas séparés ; les parts sont des surfaces, sans dénombrement.</li>
    <li>Modèle entraîné sur des patchs H&amp;E à 40×.</li>
    <li>Classe « morts » non fiable.</li>
  </ul>
</section>`;
}

function percentWithInterval(measured: {
  value: number;
  ci95: readonly [number, number] | null;
}): string {
  return measured.ci95
    ? `${formatPercent(measured.value)} (IC 95 % : ${formatPercent(measured.ci95[0])} – ${formatPercent(measured.ci95[1])})`
    : formatPercent(measured.value);
}

function breastPerformances(input: ReportInput): string {
  const evaluation = input.breakhisEvaluation;
  if (!breakhisApplies(input) || !evaluation) {
    return `<section class="small">
  <h2>Performances de référence</h2>
  <p>${notMeasured(input.run.classificationWeightsSha256)}</p>
</section>`;
  }
  const magnification = input.run.magnification;
  const atMagnification =
    magnification === null
      ? undefined
      : evaluation.byMagnification[String(magnification)];
  const line = atMagnification
    ? ` À ${integer.format(magnification as number)}×, grossissement de cette image : ${integer.format(atMagnification.n)} images, sensibilité ${atMagnification.sensitivity === null ? '—' : formatPercent(atMagnification.sensitivity)}, spécificité ${atMagnification.specificity === null ? '—' : formatPercent(atMagnification.specificity)}.`
    : '';
  return `<section class="small">
  <h2>Performances de référence</h2>
  <p>Mesurées le ${formatDate(new Date(evaluation.generatedAt))} sur le jeu de test BreakHis (jeu de test : ${integer.format(evaluation.testPatients)} patients, dont ${integer.format(evaluation.benignPatients)} bénins ; ${integer.format(evaluation.n)} images), au seuil ${decimals(2).format(evaluation.threshold)}, avec les 4 vues (rapport ${escapeHtml(evaluation.file)}). Sensibilité globale : ${percentWithInterval(evaluation.sensitivity)} ; spécificité globale : ${percentWithInterval(evaluation.specificity)}. Intervalles obtenus en rééchantillonnant les patients.${line}</p>
</section>`;
}

function nucleiPerformances(input: ReportInput): string {
  const evaluation = input.pannukeEvaluation;
  if (!pannukeApplies(input) || !evaluation) {
    return `<section class="small">
  <h2>Performances de référence</h2>
  <p>${notMeasured(input.run.segmentationWeightsSha256)}</p>
</section>`;
  }
  const dice = NUCLEUS_TYPES.map((type) => {
    const value = evaluation.perClass[type].dice;
    return `${NUCLEUS_NAMES[type]} ${value === null ? '—' : decimals(2).format(value)}`;
  }).join(' ; ');
  return `<section class="small">
  <h2>Performances de référence</h2>
  <p>Mesurées le ${formatDate(new Date(evaluation.generatedAt))} sur le Fold 3 de PanNuke (rapport ${escapeHtml(evaluation.file)}), sur les pixels de tout le jeu de test. Dice moyen des noyaux : ${evaluation.nucleiMeanDice === null ? '—' : decimals(2).format(evaluation.nucleiMeanDice)}. Dice par type : ${dice}.</p>
</section>`;
}

function pathologyLegal(input: ReportInput): string {
  const limitations =
    input.run.pipeline === 'pathology-breast'
      ? [
          "Métriques issues d'une validation interne sur BreakHis : performances à confirmer sur les données de votre laboratoire.",
          "Le score de malignité n'est pas calibré : ce n'est pas une probabilité.",
          'Classification bénin / malin : le type histologique de la tumeur n’est pas donné.',
          "Analyse d'une image : le reste de la lame n'est pas pris en compte.",
        ]
      : [
          'Segmentation sémantique : chaque pixel reçoit une classe ; les noyaux ne sont ni séparés ni dénombrés.',
          'Modèle entraîné sur des patchs H&E à 40× : une autre coloration ou un autre grossissement sort de son domaine.',
          "Analyse d'une image : le reste de la lame n'est pas pris en compte.",
        ];
  return `<section class="small">
  <h2>Mentions légales</h2>
  <p>Aide à la décision. Ce compte rendu ne constitue pas un diagnostic à lui seul et ne remplace pas l'avis d'un médecin. Modèles non certifiés comme dispositifs médicaux.</p>
  <ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`;
}

// --- Cardiology ---------------------------------------------------------------

/** The evaluation describes these weights (and was found for them). */
function cardioApplies(input: ReportInput): boolean {
  return evaluationMatchesWeights(
    input.run.classificationWeightsSha256,
    input.cardioEvaluation?.weightsSha256 ?? null,
  );
}

export const ecgClassName = (label: EcgClass) =>
  `${ECG_CLASS_NAMES[label]} (${label})`;

// Standard ECG paper: 25 mm/s, 10 mm/mV; 1 mm squares, 5 mm ones in bold.
const ECG_SPEED_MM_PER_S = 25;
const ECG_GAIN_MM_PER_MV = 10;
const ECG_STRIP_SECONDS = 5;
// Room for the 1 mV calibration pulse, left of the trace: 2 large squares,
// so the large squares of the grid start with the trace.
const ECG_CALIBRATION_MM = 10;
const ECG_MIN_STRIP_MM = 25;
const ECG_MAX_STRIP_MM = 45;

const mm = (value: number) => Number(value.toFixed(2));

/**
 * One strip of lead II on ECG paper, as SVG in millimetres: grid, 1 mV
 * calibration pulse, then the samples as one polyline (clipped to the strip).
 */
export function ecgStripSvg(
  samples: readonly number[],
  samplingRate: number,
  index: number,
): string {
  const traceWidth = (samples.length / samplingRate) * ECG_SPEED_MM_PER_S;
  const width = ECG_CALIBRATION_MM + traceWidth;
  const low = Math.min(0, ...samples);
  const high = Math.max(1, ...samples);
  const span = Math.ceil(((high - low) * ECG_GAIN_MM_PER_MV + 8) / 5) * 5;
  const height = Math.min(ECG_MAX_STRIP_MM, Math.max(ECG_MIN_STRIP_MM, span));
  // The middle of the signal in the middle of the strip, on a 1 mm line.
  const baseline = Math.round(
    height / 2 + ((high + low) / 2) * ECG_GAIN_MM_PER_MV,
  );
  const y = (millivolts: number) =>
    mm(baseline - millivolts * ECG_GAIN_MM_PER_MV);

  const lines: string[] = [];
  for (let x = 0; x <= width + 1e-9; x += 1) {
    lines.push(
      `<line x1="${mm(x)}" y1="0" x2="${mm(x)}" y2="${height}" class="${Math.round(x) % 5 === 0 ? 'major' : 'minor'}" />`,
    );
  }
  for (let row = 0; row <= height; row += 1) {
    lines.push(
      `<line x1="0" y1="${row}" x2="${mm(width)}" y2="${row}" class="${row % 5 === 0 ? 'major' : 'minor'}" />`,
    );
  }
  const step = ECG_SPEED_MM_PER_S / samplingRate;
  const points = samples
    .map(
      (value, sample) =>
        `${mm(ECG_CALIBRATION_MM + sample * step)},${y(value)}`,
    )
    .join(' ');
  // 1 mV for 0.2 s, from the baseline.
  const pulse = `M1,${y(0)} H2 V${y(1)} H${mm(2 + 0.2 * ECG_SPEED_MM_PER_S)} V${y(0)} H${ECG_CALIBRATION_MM - 1}`;

  return `<svg class="ecg-strip" viewBox="0 0 ${mm(width)} ${height}" width="${mm(width)}mm" height="${height}mm" role="img" aria-label="Dérivation II, ${index === 0 ? '0 à 5' : '5 à 10'} s">
      <defs><clipPath id="ecg-clip-${index}"><rect x="0" y="0" width="${mm(width)}" height="${height}" /></clipPath></defs>
      <g class="grid">${lines.join('')}</g>
      <g clip-path="url(#ecg-clip-${index})">
        <path class="calibration" d="${pulse}" />
        <polyline class="trace" points="${points}" />
      </g>
      <text x="1" y="3.2" class="lead">II</text>
    </svg>`;
}

function ecgFigure(input: ReportInput): string {
  const trace = input.ecgTrace;
  if (!trace || trace.leadII.length === 0) {
    return '<p>Tracé non disponible.</p>';
  }
  const perStrip = Math.round(ECG_STRIP_SECONDS * trace.samplingRate);
  const strips: string[] = [];
  for (let start = 0; start < trace.leadII.length; start += perStrip) {
    strips.push(
      ecgStripSvg(
        trace.leadII.slice(start, start + perStrip),
        trace.samplingRate,
        strips.length,
      ),
    );
  }
  return `<figure class="ecg">
    ${strips.join('\n    ')}
    <figcaption><strong>Figure 1</strong> — Dérivation II, 10 premières secondes après filtrage passe-bande (signal rééchantillonné à ${integer.format(trace.samplingRate)} Hz) ; 25 mm/s, 10 mm/mV, impulsion d'étalonnage de 1 mV.</figcaption>
  </figure>`;
}

function ecgTechnique(input: ReportInput): string {
  const { run, sourceDocument } = input;
  const ecg = run.ecg;
  const duration =
    run.durationMs === null
      ? 'Non renseignée'
      : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(run.durationMs / 1000)} s`;
  const signal = ecg
    ? `12 dérivations, ${decimals(1).format(ecg.durationSeconds)} s à ${integer.format(ecg.inputSamplingRate)} Hz`
    : 'Non renseigné';
  const model = run.classificationModelId
    ? `${escapeHtml(MODEL_NAMES[run.classificationModelId] ?? run.classificationModelId)}<br /><span class="sha">Poids SHA-256 : ${escapeHtml(run.classificationWeightsSha256 ?? '—')}</span>${ecg ? `<br /><span class="sha">Carte du modèle SHA-256 : ${escapeHtml(ecg.configSha256)}</span>` : ''}`
    : 'Non renseigné';
  return `<section>
  <h2>Technique</h2>
  <table class="facts">
    ${row('Document analysé', escapeHtml(sourceDocument.originalName))}
    ${row("Date d'import", formatDateTime(sourceDocument.createdAt))}
    ${row('Signal', signal)}
    ${row("Chaîne d'analyse", `Rééchantillonnage à 100 Hz, fenêtres de 10 s toutes les 5 s${ecg ? ` (${integer.format(ecg.windows)} fenêtre${ecg.windows > 1 ? 's' : ''})` : ''}, filtre passe-bande 0,5–40 Hz, probabilités moyennées sur les fenêtres`)}
    ${row('Modèle utilisé', model)}
    ${row('Durée de traitement', duration)}
  </table>
</section>`;
}

function ecgResults(input: ReportInput): string {
  const ecg = input.run.ecg;
  const rows = ecg
    ? ECG_CLASSES.map((label) => {
        const positive = ecg.positive.includes(label);
        return `<tr${positive ? ' class="top"' : ''}><td>${escapeHtml(ecgClassName(label))}</td><td class="num">${probability.format(ecg.probabilities[label])}</td><td class="num">${probability.format(ecg.thresholds[label])}</td><td>${positive ? 'Positif' : 'Négatif'}</td></tr>`;
      }).join('\n      ')
    : '';
  return `<section>
  <h2>Résultats</h2>
  <table class="grid">
    <thead><tr><th scope="col">Classe</th><th scope="col" class="num">Probabilité</th><th scope="col" class="num">Seuil</th><th scope="col">Résultat du modèle</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p class="note">Classification multi-label : chaque classe est comparée à son propre seuil ; les probabilités sont indépendantes et ne s'additionnent pas.${ecg && ecg.positive.length === 0 ? ' Aucune classe n’atteint son seuil.' : ''}</p>
  ${ecgFigure(input)}
</section>`;
}

function ecgPerformances(input: ReportInput): string {
  const evaluation = input.cardioEvaluation;
  if (!cardioApplies(input) || !evaluation) {
    return `<section class="small">
  <h2>Performances de référence</h2>
  <p>${notMeasured(input.run.classificationWeightsSha256)}</p>
</section>`;
  }
  const perClass = ECG_CLASSES.map((label) => {
    const metrics = evaluation.perClass[label];
    const share = (value: number | null) =>
      value === null ? '—' : formatPercent(value);
    return `${escapeHtml(ECG_CLASS_NAMES[label])} : AUC ${decimals(2).format(metrics.auc)}, sensibilité ${share(metrics.sensitivity)}, spécificité ${share(metrics.specificity)}`;
  }).join(' ; ');
  const source =
    evaluation.source === 'service'
      ? `Mesurées le ${formatDate(new Date(evaluation.generatedAt as string))} par le service d'analyse lui-même (même prétraitement, même inférence) sur le pli 10 de PTB-XL (${integer.format(evaluation.nEcg)} ECG), aux seuils du modèle (rapport ${escapeHtml(evaluation.file)}).`
      : `Mesures du notebook d'entraînement sur le pli 10 de PTB-XL (${integer.format(evaluation.nEcg)} ECG), reprises de la carte du modèle (${escapeHtml(evaluation.file)}) : non mesurées sur le service d'analyse lui-même.`;
  return `<section class="small">
  <h2>Performances de référence</h2>
  <p>${source} AUC macro : ${decimals(3).format(evaluation.aucMacro)}. ${perClass}.</p>
</section>`;
}

function ecgLegal(input: ReportInput): string {
  const hyp =
    cardioApplies(input) && input.cardioEvaluation
      ? input.cardioEvaluation.perClass.HYP.sensitivity
      : null;
  const limitations = [
    "Métriques issues d'une validation interne sur PTB-XL : performances à confirmer sur les données de votre établissement.",
    'Ne reconnaît que 5 superclasses : un trouble du rythme ou une autre anomalie peut ne pas être signalé comme tel.',
    `Sensibilité plus faible pour l'hypertrophie${hyp === null ? '' : ` : ${formatPercent(hyp)} sur le jeu de test`}.`,
    "Analyse d'un signal numérique : elle ne remplace pas la lecture du tracé complet.",
  ];
  return `<section class="small">
  <h2>Mentions légales</h2>
  <p>Aide à la décision. Ce compte rendu ne constitue pas un diagnostic à lui seul et ne remplace pas l'avis d'un médecin. Modèle non certifié comme dispositif médical.</p>
  <ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`;
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
.closing{margin-top:6mm;break-inside:avoid}
section.conclusion{margin-top:0;padding:3.5mm 4mm;border:1.3pt solid ${ACCENT_COLOR};break-inside:avoid}
.conclusion .verdict{font-size:11pt;font-weight:700;color:${ACCENT_COLOR}}
.conclusion table.facts th{width:28%}
section.small{font-size:7.8pt;color:#3a3a3a}
section.small h2{font-size:7.8pt}
section.small ul{margin:1mm 0 0;padding-left:4mm}
.signature{width:72mm;margin:6mm 0 0 auto;padding-top:2.2mm;border-top:.6pt solid ${ACCENT_COLOR};break-inside:avoid;font-size:8.6pt}
.signature p{margin:0 0 .6mm}
.signature .signer{font-size:10pt;font-weight:700}
.signature .electronic{margin-top:1.4mm;font-weight:600;color:${ACCENT_COLOR}}
.signature .fingerprint{margin-top:2mm;font-size:7.4pt;color:#5a5a5a;letter-spacing:.03em}
h1{text-transform:uppercase}
.model-result{margin:0 0 3mm;font-weight:600}
ul.legend{display:flex;flex-wrap:wrap;gap:1.5mm 5mm;margin:0 0 3mm;padding:0;list-style:none;font-size:8.4pt}
ul.legend .swatch{display:inline-block;width:3mm;height:3mm;margin-right:1.4mm;vertical-align:-.3mm;border:.3pt solid #5a5a5a}
ul.limits{margin:2mm 0 0;padding-left:4mm;font-size:8.4pt;color:#4a4a4a}
.sha{font-size:7.4pt;color:#4a4a4a;word-break:break-all}
figure.ecg{width:auto;margin:4mm 0 0}
.ecg-strip{display:block;margin-bottom:2mm;background:#fff}
.ecg-strip .minor{stroke:#f2c4c4;stroke-width:.08}
.ecg-strip .major{stroke:#de8f8f;stroke-width:.2}
.ecg-strip .trace,.ecg-strip .calibration{fill:none;stroke:#111;stroke-width:.3;stroke-linejoin:round}
.ecg-strip .lead{font-size:2.6px;font-weight:700;fill:#111}
`;

const TITLES: Record<string, string> = {
  brain:
    "COMPTE RENDU D'ANALYSE D'IMAGERIE ASSISTÉE PAR INTELLIGENCE ARTIFICIELLE",
  'cardio-ecg': "Compte rendu d'électrocardiogramme analysé par IA",
};

const SUBTITLES: Record<string, string> = {
  brain: 'Imagerie cérébrale (IRM)',
  'cardio-ecg': 'Cardiologie — ECG 12 dérivations, 5 superclasses (PTB-XL)',
};

const PATHOLOGY_SUBTITLES: Record<string, string> = {
  'pathology-breast': 'Histopathologie mammaire — classification bénin / malin',
  'pathology-nuclei': 'Histopathologie — segmentation des noyaux (H&amp;E)',
};

// The evaluation a report prints from, named in its fingerprint.
function evaluationIdentity(
  input: ReportInput,
  brainEvaluationApplies: boolean,
): { file: string; sha256: string | null } | null {
  switch (input.run.pipeline) {
    case 'brain':
      return brainEvaluationApplies && input.evaluation
        ? {
            file: input.evaluation.file,
            sha256: input.evaluation.classifierSha256,
          }
        : null;
    case 'pathology-breast':
      return breakhisApplies(input) && input.breakhisEvaluation
        ? {
            file: input.breakhisEvaluation.file,
            sha256: input.breakhisEvaluation.weightsSha256,
          }
        : null;
    case 'cardio-ecg':
      return cardioApplies(input) && input.cardioEvaluation
        ? {
            file: input.cardioEvaluation.file,
            sha256: input.cardioEvaluation.weightsSha256,
          }
        : null;
    default:
      return pannukeApplies(input) && input.pannukeEvaluation
        ? {
            file: input.pannukeEvaluation.file,
            sha256: input.pannukeEvaluation.weightsSha256,
          }
        : null;
  }
}

/** Builds the report; the printed facts are hashed into its fingerprint. */
export function buildReportDocument(input: ReportInput): ReportDocument {
  const pipeline = input.run.pipeline;
  const brain = pipeline === 'brain';
  const cardio = pipeline === 'cardio-ecg';
  const evaluationApplies =
    brain &&
    evaluationMatchesWeights(
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
        ecgTraceSha256: input.ecgTrace?.sha256 ?? null,
        editedAt: input.editedAt,
        evaluation: evaluationIdentity(input, evaluationApplies),
        maskSha256: input.mask?.sha256 ?? null,
        overlaySha256: input.overlay?.sha256 ?? null,
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
  <h1>${TITLES[pipeline] ?? "Compte rendu d'analyse histopathologique assistée par IA"}</h1>
  <p class="subtitle">${SUBTITLES[pipeline] ?? PATHOLOGY_SUBTITLES[pipeline] ?? 'Histopathologie'}</p>
</div>
${identification(input)}
${indication(input)}
${cardio ? ecgTechnique(input) : technique(input)}
${brain ? results(input, evaluationApplies) : cardio ? ecgResults(input) : pipeline === 'pathology-breast' ? breastResults(input) : nucleiResults(input)}
<div class="closing">
${conclusion(input)}
${signature(input, contentSha256)}
</div>
${brain ? performances(input, evaluationApplies) : cardio ? ecgPerformances(input) : pipeline === 'pathology-breast' ? breastPerformances(input) : nucleiPerformances(input)}
${brain ? legal(input, evaluationApplies) : cardio ? ecgLegal(input) : pathologyLegal(input)}
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
