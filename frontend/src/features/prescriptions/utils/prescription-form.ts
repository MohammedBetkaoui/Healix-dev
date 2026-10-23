import {
  type AdministrationRoute,
  type Medication,
  type PharmaceuticalForm,
  type PrescriptionItem,
  type PrescriptionItemInput,
  type PrescriptionType,
  type RegulatoryCategory,
  type VerificationState,
} from "../types/prescription.types";

/** One medication line of the builder, as typed (numbers stay strings). */
export type ItemDraft = {
  key: string;
  /** Set when the line comes from the reference: the API then ignores the fields below it. */
  medicationId?: string;
  dci: string;
  brandName: string;
  strength: string;
  pharmaceuticalForm: PharmaceuticalForm;
  route: AdministrationRoute;
  manufacturer: string;
  regulatoryCategory: RegulatoryCategory;
  reimbursable: VerificationState;
  requiresPriorApproval: VerificationState;
  dosePerIntake: string;
  frequency: string;
  intakeMoment: string;
  durationDays: string;
  quantity: string;
  patientInstructions: string;
  indication: string;
  asNeeded: boolean;
  renewalAllowed: boolean;
  substitutionAllowed: boolean;
};

export type ItemField = "dci" | "strength" | "dosePerIntake" | "frequency" | "quantity" | "durationDays";

export function newItemDraft(key: string): ItemDraft {
  return {
    key,
    dci: "",
    brandName: "",
    strength: "",
    pharmaceuticalForm: "TABLET",
    route: "ORAL",
    manufacturer: "",
    regulatoryCategory: "STANDARD",
    reimbursable: "UNKNOWN",
    requiresPriorApproval: "UNKNOWN",
    dosePerIntake: "",
    frequency: "",
    intakeMoment: "",
    durationDays: "",
    quantity: "",
    patientInstructions: "",
    indication: "",
    asNeeded: false,
    renewalAllowed: false,
    substitutionAllowed: true,
  };
}

/** The line takes the identity of a reference medication; its dosing is kept. */
export function applyMedication(item: ItemDraft, medication: Medication): ItemDraft {
  return {
    ...item,
    medicationId: medication.id,
    dci: medication.dci,
    brandName: medication.brandName ?? "",
    strength: medication.strength,
    pharmaceuticalForm: medication.pharmaceuticalForm,
    route: medication.route,
    manufacturer: medication.manufacturer ?? "",
    regulatoryCategory: medication.regulatoryCategory,
    reimbursable: medication.reimbursable,
    requiresPriorApproval: medication.requiresPriorApproval,
  };
}

export function itemFromPrescription(key: string, item: PrescriptionItem): ItemDraft {
  const { medication } = item;
  return {
    ...newItemDraft(key),
    medicationId: medication.id ?? undefined,
    dci: medication.dci,
    brandName: medication.brandName ?? "",
    strength: medication.strength,
    pharmaceuticalForm: medication.pharmaceuticalForm,
    route: medication.route,
    manufacturer: medication.manufacturer ?? "",
    regulatoryCategory: medication.regulatoryCategory,
    dosePerIntake: item.dosePerIntake,
    frequency: item.frequency,
    intakeMoment: item.intakeMoment ?? "",
    durationDays: item.durationDays === null ? "" : String(item.durationDays),
    quantity: item.quantity,
    patientInstructions: item.patientInstructions ?? "",
    indication: item.indication ?? "",
    asNeeded: item.asNeeded,
    renewalAllowed: item.renewalAllowed,
    substitutionAllowed: item.substitutionAllowed,
  };
}

const parseDuration = (value: string) => {
  const days = Number(value.trim());
  return value.trim() !== "" && Number.isInteger(days) ? days : undefined;
};

/** Required fields (the API refuses a line without them) that are missing or invalid. */
export function getItemIssues(item: ItemDraft): ItemField[] {
  const issues: ItemField[] = [];
  if (!item.dci.trim()) issues.push("dci");
  if (!item.strength.trim()) issues.push("strength");
  if (!item.dosePerIntake.trim()) issues.push("dosePerIntake");
  if (!item.frequency.trim()) issues.push("frequency");
  if (!item.quantity.trim()) issues.push("quantity");
  if (item.durationDays.trim()) {
    const days = parseDuration(item.durationDays);
    if (days === undefined || days < 1 || days > 3650) issues.push("durationDays");
  }
  return issues;
}

const optional = (value: string) => value.trim() || undefined;

/** Body of CreatePrescriptionItemDto. */
export function toItemInput(item: ItemDraft): PrescriptionItemInput {
  return {
    medicationId: item.medicationId,
    dci: item.dci.trim(),
    brandName: optional(item.brandName),
    strength: item.strength.trim(),
    pharmaceuticalForm: item.pharmaceuticalForm,
    route: item.route,
    manufacturer: optional(item.manufacturer),
    regulatoryCategory: item.regulatoryCategory,
    dosePerIntake: item.dosePerIntake.trim(),
    frequency: item.frequency.trim(),
    intakeMoment: optional(item.intakeMoment),
    durationDays: parseDuration(item.durationDays),
    quantity: item.quantity.trim(),
    patientInstructions: optional(item.patientInstructions),
    indication: optional(item.indication),
    asNeeded: item.asNeeded,
    renewalAllowed: item.renewalAllowed,
    substitutionAllowed: item.substitutionAllowed,
  };
}

const LEVEL: Record<PrescriptionType, number> = { STANDARD: 0, REGULATED: 1, PSYCHOTROPIC: 2, NARCOTIC: 3 };

/** Highest regulatory category of the lines (the API applies the same rule). */
export function typeFromItems(items: Array<Pick<ItemDraft, "regulatoryCategory">>): PrescriptionType {
  return items.reduce<PrescriptionType>(
    (highest, item) => (LEVEL[item.regulatoryCategory] > LEVEL[highest] ? item.regulatoryCategory : highest),
    "STANDARD",
  );
}

/** A group of values is "yes" if any is, "unknown" if any is, else "no". */
export function aggregateVerification(values: VerificationState[]): VerificationState {
  if (values.includes("YES")) return "YES";
  if (values.includes("UNKNOWN") || values.length === 0) return "UNKNOWN";
  return "NO";
}
