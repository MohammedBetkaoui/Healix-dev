import type { ConsultationVitalSigns } from "./types";

// The vital signs of a consultation: the fields, their units and the bounds the
// server enforces (UpdateConsultationDto), which the native side checks again.
export const VITAL_FIELDS = [
  { key: "systolicBp", label: "Tension systolique", unit: "mmHg", min: 40, max: 300, integer: true },
  { key: "diastolicBp", label: "Tension diastolique", unit: "mmHg", min: 20, max: 200, integer: true },
  { key: "heartRate", label: "Fréquence cardiaque", unit: "bpm", min: 20, max: 300, integer: true },
  { key: "respiratoryRate", label: "Fréquence respiratoire", unit: "/min", min: 5, max: 100, integer: true },
  { key: "oxygenSaturation", label: "Saturation en oxygène (SpO₂)", unit: "%", min: 0, max: 100, integer: false },
  { key: "temperature", label: "Température", unit: "°C", min: 25, max: 45, integer: false },
  { key: "weightKg", label: "Poids", unit: "kg", min: 0.1, max: 700, integer: false },
  { key: "heightCm", label: "Taille", unit: "cm", min: 10, max: 300, integer: false },
] as const;

export type VitalKey = (typeof VITAL_FIELDS)[number]["key"];
export type VitalsForm = Record<VitalKey, string>;

export const emptyVitalsForm = (): VitalsForm => ({
  systolicBp: "", diastolicBp: "", heartRate: "", respiratoryRate: "",
  oxygenSaturation: "", temperature: "", weightKg: "", heightCm: "",
});

const format = (value: number) => String(value).replace(".", ",");

// A number typed by the doctor: a decimal comma is accepted, an empty field is
// "not measured", anything else out of bounds is an error in French.
export function parseVital(field: (typeof VITAL_FIELDS)[number], text: string): { value: number | null; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { value: null };
  const value = Number(trimmed.replace(",", "."));
  const limits = `(${format(field.min)} à ${format(field.max)} ${field.unit})`;
  if (!Number.isFinite(value) || !/^-?\d+([.,]\d+)?$/.test(trimmed)) {
    return { value: null, error: `${field.label} : saisissez un nombre ${limits}.` };
  }
  if (field.integer && !Number.isInteger(value)) {
    return { value: null, error: `${field.label} : saisissez un nombre entier ${limits}.` };
  }
  if (value < field.min || value > field.max) {
    return { value: null, error: `${field.label} hors limites ${limits}.` };
  }
  return { value };
}

export type VitalErrors = Partial<Record<VitalKey, string>>;

export function vitalsFromForm(form: VitalsForm): { values: ConsultationVitalSigns; errors: VitalErrors } {
  const values: ConsultationVitalSigns = {};
  const errors: VitalErrors = {};
  for (const field of VITAL_FIELDS) {
    const parsed = parseVital(field, form[field.key]);
    if (parsed.error) errors[field.key] = parsed.error;
    else if (parsed.value !== null) values[field.key] = parsed.value;
  }
  return { values, errors };
}

export function vitalsToForm(vitals: ConsultationVitalSigns | null | undefined): VitalsForm {
  const form = emptyVitalsForm();
  for (const field of VITAL_FIELDS) {
    const value = vitals?.[field.key];
    if (value !== null && value !== undefined) form[field.key] = format(value);
  }
  return form;
}

// Body mass index, one decimal: kg / m².
export function bmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

// 22,9 : always one decimal, with the decimal comma.
export const formatBmi = (index: number) => index.toFixed(1).replace(".", ",");

export type VitalFlag = { level: "attention" | "alert"; text: string };
export type FlagKey = "bloodPressure" | "heartRate" | "respiratoryRate" | "oxygenSaturation" | "temperature" | "bmi";

// Values to look at, in words: the text is what is announced, the colour only
// repeats it. Indicative thresholds for an adult.
export function vitalFlags(values: ConsultationVitalSigns): Partial<Record<FlagKey, VitalFlag>> {
  const flags: Partial<Record<FlagKey, VitalFlag>> = {};
  const { systolicBp: sys, diastolicBp: dia, heartRate, respiratoryRate, oxygenSaturation, temperature } = values;

  if ((sys != null && sys >= 180) || (dia != null && dia >= 110)) {
    flags.bloodPressure = { level: "alert", text: "Tension très élevée" };
  } else if ((sys != null && sys >= 140) || (dia != null && dia >= 90)) {
    flags.bloodPressure = { level: "attention", text: "Tension élevée" };
  } else if ((sys != null && sys < 90) || (dia != null && dia < 60)) {
    flags.bloodPressure = { level: "attention", text: "Tension basse" };
  }

  if (heartRate != null && heartRate > 100) flags.heartRate = { level: "attention", text: "Tachycardie" };
  else if (heartRate != null && heartRate < 60) flags.heartRate = { level: "attention", text: "Bradycardie" };

  if (respiratoryRate != null && respiratoryRate > 20) flags.respiratoryRate = { level: "attention", text: "Fréquence élevée" };
  else if (respiratoryRate != null && respiratoryRate < 12) flags.respiratoryRate = { level: "attention", text: "Fréquence basse" };

  if (oxygenSaturation != null && oxygenSaturation < 90) flags.oxygenSaturation = { level: "alert", text: "Saturation très basse" };
  else if (oxygenSaturation != null && oxygenSaturation < 94) flags.oxygenSaturation = { level: "attention", text: "Saturation basse" };

  if (temperature != null && temperature >= 39.5) flags.temperature = { level: "alert", text: "Forte fièvre" };
  else if (temperature != null && temperature >= 38) flags.temperature = { level: "attention", text: "Fièvre" };
  else if (temperature != null && temperature < 35) flags.temperature = { level: "attention", text: "Hypothermie" };

  const index = bmi(values.weightKg, values.heightCm);
  if (index !== null) {
    if (index >= 30) flags.bmi = { level: "attention", text: "Obésité" };
    else if (index >= 25) flags.bmi = { level: "attention", text: "Surpoids" };
    else if (index < 18.5) flags.bmi = { level: "attention", text: "Insuffisance pondérale" };
  }
  return flags;
}
