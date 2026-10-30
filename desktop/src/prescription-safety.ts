// Local safety checks of a prescription, so that an alert does not wait for the
// network. This is a faithful port of the server's PrescriptionSafetyService
// (backend/src/prescriptions/prescription-safety.service.ts): same kinds of
// alert, same normalization, same French messages, same order. The shared cases
// (src/test/safety-cases.json) and the server's own answers
// (safety-golden.json) are checked by prescription-safety.test.ts here and by
// prescription-safety.parity.spec.ts on the server, so the two cannot drift
// apart unnoticed.
//
// One check is added here and does not exist on the server: CURRENT_MEDICATION.

export type SafetyItem = {
  dci: string;
  strength: string;
  pharmaceuticalForm: string;
  regulatoryCategory: string;
  dosePerIntake: string;
  frequency: string;
  durationDays?: number | null;
  quantity: string;
};

export type SafetyAlertKind =
  | "ALLERGY"
  | "DUPLICATION"
  | "DURATION"
  | "DOSAGE"
  | "REGULATED"
  | "MISSING_CONTEXT"
  | "CURRENT_MEDICATION";

export type SafetyAlert = {
  id: string;
  kind: SafetyAlertKind;
  level: "information" | "attention" | "critical";
  title: string;
  detail?: string;
  resolved: boolean;
  // The line of the prescription the alert is about (0-based); absent for an
  // alert about the whole prescription. Not part of the server's answer.
  itemIndex?: number;
};

type MedicalSummary = {
  allergies?: unknown;
  chronicDiseases?: unknown;
  currentMedications?: unknown;
  history?: unknown;
  notes?: unknown;
};

// NFKD, accents removed, trimmed, lower case (French).
export const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("fr");

const readSummary = (value: unknown): MedicalSummary | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as MedicalSummary) : null;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The DCI as a whole word of a current medication ("Amlodipine 5 mg" holds
// "amlodipine"; "acide acétylsalicylique 100" holds "acide acetylsalicylique").
const mentions = (entry: string, dci: string) =>
  Boolean(dci) && new RegExp(`(^|[^a-z0-9])${escapeRegExp(dci)}([^a-z0-9]|$)`).test(entry);

export const EVALUATED_CHECKS = [
  "EXACT_DUPLICATE",
  "EXACT_STRUCTURED_ALLERGY_MATCH",
  "REGULATORY_CATEGORY",
  "REQUIRED_DOSING_FIELDS",
] as const;

export const NOT_EVALUATED = [
  "DRUG_INTERACTIONS",
  "COMPLEX_CONTRAINDICATIONS",
  "COMPLEX_DOSING",
  "PREGNANCY",
  "RENAL_FUNCTION",
  "HEPATIC_FUNCTION",
] as const;

export function evaluatePrescriptionSafety(items: SafetyItem[], medicalSummary: unknown) {
  const alerts: SafetyAlert[] = [];
  const seen = new Map<string, number>();
  const summary = readSummary(medicalSummary);
  const allergies = stringArray(summary?.allergies).map(normalize);
  const currentMedications = stringArray(summary?.currentMedications).map((entry) => ({ raw: entry.trim(), normalized: normalize(entry) }));

  items.forEach((item, index) => {
    const duplicateKey = [normalize(item.dci), normalize(item.strength), item.pharmaceuticalForm].join("|");
    const previous = seen.get(duplicateKey);
    if (previous !== undefined) {
      alerts.push({
        id: `duplication-${index + 1}`,
        kind: "DUPLICATION",
        level: "attention",
        title: "Médicament dupliqué dans cette ordonnance.",
        detail: `Les lignes ${previous + 1} et ${index + 1} ont la même DCI, le même dosage et la même forme.`,
        resolved: false,
        itemIndex: index,
      });
    } else {
      seen.set(duplicateKey, index);
    }

    if (allergies.includes(normalize(item.dci))) {
      alerts.push({
        id: `allergy-${index + 1}`,
        kind: "ALLERGY",
        level: "critical",
        title: "Correspondance exacte avec une allergie structurée connue.",
        detail: item.dci,
        resolved: false,
        itemIndex: index,
      });
    }
    if (item.regulatoryCategory !== "STANDARD") {
      alerts.push({
        id: `regulated-${index + 1}`,
        kind: "REGULATED",
        level: "attention",
        title: "Médicament soumis à une vigilance réglementaire supplémentaire.",
        detail: item.regulatoryCategory,
        resolved: false,
        itemIndex: index,
      });
    }
    const duration = item.durationDays ?? null;
    if (duration !== null && duration <= 0) {
      alerts.push({
        id: `duration-${index + 1}`,
        kind: "DURATION",
        level: "critical",
        title: "Durée de traitement invalide.",
        resolved: false,
        itemIndex: index,
      });
    }
    if (!item.quantity.trim() || !item.dosePerIntake.trim() || !item.frequency.trim()) {
      alerts.push({
        id: `dosage-${index + 1}`,
        kind: "DOSAGE",
        level: "critical",
        title: "Posologie, fréquence ou quantité manquante.",
        resolved: false,
        itemIndex: index,
      });
    }
  });

  if (!summary) {
    alerts.push({
      id: "missing-medical-summary",
      kind: "MISSING_CONTEXT",
      level: "information",
      title: "Résumé médical non renseigné.",
      detail: "Les allergies, traitements et antécédents ne peuvent pas être évalués.",
      resolved: false,
    });
  }

  // Desktop only: the medication is already in the patient's current treatments.
  items.forEach((item, index) => {
    const dci = normalize(item.dci);
    const found = currentMedications.find((entry) => mentions(entry.normalized, dci));
    if (found) {
      alerts.push({
        id: `current-medication-${index + 1}`,
        kind: "CURRENT_MEDICATION",
        level: "attention",
        title: "Ce médicament figure déjà dans les traitements actuels du patient.",
        detail: found.raw,
        resolved: false,
        itemIndex: index,
      });
    }
  });

  return {
    alerts,
    evaluatedChecks: [...EVALUATED_CHECKS, "CURRENT_MEDICATION"] as string[],
    notEvaluated: [...NOT_EVALUATED] as string[],
  };
}

// Alerts to read before saving, most serious first.
const LEVEL_ORDER = { critical: 0, attention: 1, information: 2 } as const;
export const bySeverity = (alerts: SafetyAlert[]) =>
  [...alerts].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

// The prescription cannot be saved while one of these stands unconfirmed.
export const blockingAlerts = (alerts: SafetyAlert[]) => alerts.filter((alert) => alert.kind === "ALLERGY");

export const ALLERGY_CONFIRMATION_LABEL = "Je confirme cette prescription malgré l’allergie connue";
