import { formatDateOnly } from "./dates";
import type { AiReport } from "./types";

// What the Desktop says of a validated AI result. Nothing here starts an
// analysis or reads an image: it only words a conclusion the physician already
// decided on the Web platform (labels and classes as on the Web, locales/fr).

export type Specialty = "brain" | "pathology" | "cardiology";

export function specialtyOf(pipeline: string): Specialty {
  if (pipeline.startsWith("pathology")) return "pathology";
  if (pipeline.startsWith("cardio")) return "cardiology";
  return "brain";
}

export const specialtyColor = (specialty: Specialty) => `var(--specialty-${specialty})`;

// The classes the models answer with, as a sentence ("gliome") and as a title.
const CLASSES: Record<string, string> = {
  glioma: "gliome",
  meningioma: "méningiome",
  notumor: "pas de tumeur",
  pituitary: "tumeur hypophysaire",
  benign: "bénin",
  malignant: "malin",
  NORM: "ECG normal",
  MI: "infarctus du myocarde",
  STTC: "trouble ST/T",
  CD: "trouble de la conduction",
  HYP: "hypertrophie",
};

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);

// A class the app does not know is shown as received, never hidden.
export const className = (code: string) => CLASSES[code] ?? code;
export const classTitle = (code: string) => capitalize(className(code));

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const score = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatNumber = (value: number) => number.format(value);
export const formatScore = (value: number) => score.format(value);
export const formatPercent = (probability: number) => `${number.format(Math.round(probability * 1000) / 10)} %`;

// ESC 2021, as on the Web (volumetry-measures.ts): read on the fraction rounded to
// the unit. reduced <= 40 %, mildly reduced 41-49 %, preserved >= 50 %.
export type LvefClass = "reduced" | "mildlyReduced" | "preserved";

export function lvefClass(ef: number | null | undefined): LvefClass | null {
  if (ef === null || ef === undefined || !Number.isFinite(ef)) return null;
  const reported = Math.floor(ef + 0.5);
  if (reported <= 40) return "reduced";
  return reported <= 49 ? "mildlyReduced" : "preserved";
}

export const LVEF_CLASS_LABEL: Record<LvefClass, { text: string; range: string; tone: "danger" | "warning" | "success" }> = {
  reduced: { text: "FEVG réduite", range: "≤ 40 %", tone: "danger" },
  mildlyReduced: { text: "FEVG modérément réduite", range: "41–49 %", tone: "warning" },
  preserved: { text: "FEVG préservée", range: "≥ 50 %", tone: "success" },
};

export const ESC_SOURCE = "Classes de la FEVG : recommandations ESC 2021 sur l’insuffisance cardiaque.";

// The conclusion of the physician, in a sentence: the class kept, the classes of
// an ECG, the ejection fraction of a volumetry, or what a validated map means.
export function conclusionOf(report: AiReport): string {
  if (report.decisionLabels?.length) return report.decisionLabels.map(className).join(", ");
  if (report.decisionLabel) return className(report.decisionLabel);
  const lvef = report.measures.lvef;
  if (report.pipeline === "cardio-volume-mri" && lvef !== null && lvef !== undefined) {
    const cls = lvefClass(lvef);
    return `FEVG ${formatNumber(lvef)} %${cls ? ` (${LVEF_CLASS_LABEL[cls].text.replace("FEVG ", "").toLowerCase()})` : ""}`;
  }
  return report.pipeline === "pathology-nuclei" ? "carte des noyaux validée" : "résultat validé";
}

// What the model itself proposed: its class or classes, never the physician's.
export function proposalOf(report: AiReport): string | null {
  if (report.modelLabels?.length) return report.modelLabels.map(className).join(", ");
  return report.modelDecision ? className(report.modelDecision) : null;
}

const DECIDED_BY = { VALIDATED: "validée par", CORRECTED: "corrigée par" } as const;

// "Analyse IA (IRM cérébrale, 28/10/2026, validée par Dr X, rapport CR-IA-2026-000123) : gliome."
// The doctor may edit it: it is only ever inserted by an explicit click.
export function citationOf(report: AiReport): string {
  const when = report.decidedAt ?? report.createdAt;
  const date = new Date(when);
  const day = Number.isNaN(date.getTime())
    ? null
    : `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  const by = report.decidedByName
    ? `${DECIDED_BY[report.decisionStatus]} ${report.decidedByName}`
    : report.decisionStatus === "CORRECTED"
      ? "corrigée"
      : "validée";
  const parts = [report.moduleLabel, day, by, report.reportNumber ? `rapport ${report.reportNumber}` : null].filter(
    (part): part is string => Boolean(part),
  );
  return `Analyse IA (${parts.join(", ")}) : ${conclusionOf(report)}.`;
}

// Appended at the end of what the doctor already wrote, on its own line; the
// text is never replaced, and the same citation is not added twice.
export function appendCitation(existing: string, citation: string): string {
  if (existing.includes(citation)) return existing;
  const kept = existing.replace(/\s+$/, "");
  return kept ? `${kept}\n${citation}` : citation;
}

export const isCited = (existing: string, report: AiReport) => existing.includes(citationOf(report));

export type MeasureLine = { label: string; value: string; note?: string };

const ml = (value: number | null | undefined) => (value === null || value === undefined ? null : `${formatNumber(value)} ml`);

// The key figures of a result, by pipeline. A figure the run does not have is left out.
export function measureLines(report: AiReport): MeasureLine[] {
  const m = report.measures;
  const lines: MeasureLine[] = [];
  const add = (label: string, value: string | null, note?: string) => {
    if (value !== null) lines.push({ label, value, note });
  };
  const has = (key: string) => m[key] !== null && m[key] !== undefined;
  switch (report.pipeline) {
    case "pathology-breast":
      add("Score de malignité", has("malignancyScore") ? formatScore(m.malignancyScore as number) : null, "pas une probabilité");
      add("Seuil de décision", has("decisionThreshold") ? formatScore(m.decisionThreshold as number) : null);
      add("Grossissement", has("magnification") ? `×${formatNumber(m.magnification as number)}` : null);
      break;
    case "pathology-nuclei":
      add("Part de l’image couverte par le masque", has("maskAreaRatio") ? formatPercent(m.maskAreaRatio as number) : null);
      add("Grossissement", has("magnification") ? `×${formatNumber(m.magnification as number)}` : null);
      break;
    case "brain":
      add("Part de l’image couverte par le masque", has("maskAreaRatio") ? formatPercent(m.maskAreaRatio as number) : null);
      break;
    case "cardio-volume-mri": {
      add("FEVG du ventricule gauche", has("lvef") ? `${formatNumber(m.lvef as number)} %` : null);
      add("FEVG du ventricule droit", has("rvef") ? `${formatNumber(m.rvef as number)} %` : null);
      add("Volume télédiastolique du VG", ml(m.lvedv), has("lvedvIndexed") ? `${formatNumber(m.lvedvIndexed as number)} ml/m²` : undefined);
      add("Volume télésystolique du VG", ml(m.lvesv), has("lvesvIndexed") ? `${formatNumber(m.lvesvIndexed as number)} ml/m²` : undefined);
      add("Masse du myocarde du VG", has("lvMass") ? `${formatNumber(m.lvMass as number)} g` : null, has("lvMassIndexed") ? `${formatNumber(m.lvMassIndexed as number)} g/m²` : undefined);
      break;
    }
    default:
      break;
  }
  return lines;
}

export const decidedOn = (report: AiReport) => formatDateOnly(report.decidedAt ?? report.createdAt);

// The newest first, whatever order the list came in.
export const newestFirst = (reports: AiReport[]) =>
  [...reports].sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt));
