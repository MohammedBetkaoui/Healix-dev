import { ExternalLink, Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import {
  type AdministrationRoute,
  type Medication,
  type PharmaceuticalForm,
  type PrescriptionItem,
} from "../types/prescription.types";
import { MedicationSearch } from "./MedicationSearch";

type MedicationRowProps = {
  index: number;
  item: PrescriptionItem;
  locale: Locale;
  medications: Medication[];
  onChange: (item: PrescriptionItem) => void;
  onRemove: () => void;
  t: TranslationFunction;
};

const forms: PharmaceuticalForm[] = ["TABLET", "CAPSULE", "ORAL_SOLUTION", "INJECTABLE", "EYE_DROPS", "OINTMENT", "INHALER"];
const routes: AdministrationRoute[] = ["ORAL", "IV", "IM", "SC", "CUTANEOUS", "OPHTHALMIC", "INHALED"];

function Field({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{label}</span><Input type={type} min={type === "number" ? 1 : undefined} className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function MedicationRow({ index, item, locale, medications, onChange, onRemove, t }: MedicationRowProps) {
  const setMedicationField = (key: "strength" | "pharmaceuticalForm" | "route", value: string) => onChange({ ...item, medication: { ...item.medication, [key]: value } });
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold"><span className="me-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[.68rem] text-[var(--medical)]">{index + 1}</span>{item.medication.dci}</h4><button type="button" className="clinical-icon-button h-8 min-w-8 text-[var(--danger-ink)]" onClick={onRemove} aria-label={t("prescriptions.actions.remove")}><Trash2 size={15} aria-hidden="true" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="sm:col-span-2 xl:col-span-2"><MedicationSearch medications={medications} selected={item.medication} t={t} onSelect={(medication) => onChange({ ...item, medication })} /></div>
        <Field label={t("prescriptions.builder.brand")} value={item.medication.brandName ?? ""} onChange={(value) => onChange({ ...item, medication: { ...item.medication, brandName: value } })} />
        <Field label={t("prescriptions.builder.dosage")} value={item.medication.strength} onChange={(value) => setMedicationField("strength", value)} />
        <label><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.form")}</span><Select className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.medication.pharmaceuticalForm} onChange={(event) => setMedicationField("pharmaceuticalForm", event.target.value)}>{forms.map((form) => <option key={form} value={form}>{t(`prescriptions.forms.${form}`)}</option>)}</Select></label>
        <label><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.route")}</span><Select className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.medication.route} onChange={(event) => setMedicationField("route", event.target.value)}>{routes.map((route) => <option key={route} value={route}>{t(`prescriptions.routes.${route}`)}</option>)}</Select></label>
        <Field label={t("prescriptions.builder.dosePerIntake")} value={item.dosePerIntake[locale]} onChange={(value) => onChange({ ...item, dosePerIntake: { ...item.dosePerIntake, [locale]: value } })} />
        <Field label={t("prescriptions.builder.frequency")} value={item.frequency[locale]} onChange={(value) => onChange({ ...item, frequency: { ...item.frequency, [locale]: value } })} />
        <Field label={t("prescriptions.builder.intakeMoment")} value={item.intakeMoment[locale]} onChange={(value) => onChange({ ...item, intakeMoment: { ...item.intakeMoment, [locale]: value } })} />
        <Field label={t("prescriptions.builder.duration")} type="number" value={item.durationDays} onChange={(value) => onChange({ ...item, durationDays: Number(value) || 1 })} />
        <Field label={t("prescriptions.builder.quantity")} value={item.quantity[locale]} onChange={(value) => onChange({ ...item, quantity: { ...item.quantity, [locale]: value } })} />
        <label className="sm:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.instructions")}</span><Textarea className="min-h-20 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.patientInstructions[locale]} onChange={(event) => onChange({ ...item, patientInstructions: { ...item.patientInstructions, [locale]: event.target.value } })} /></label>
        <label className="sm:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.indication")}</span><Textarea className="min-h-16 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.indication[locale]} onChange={(event) => onChange({ ...item, indication: { ...item.indication, [locale]: event.target.value } })} /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--line-soft)] pt-3">
        {(["asNeeded", "renewalAllowed", "substitutionAllowed"] as const).map((key) => <label key={key} className="flex items-start gap-2 text-[.7rem] text-[var(--text-primary)]"><Checkbox checked={item[key]} onChange={(event) => onChange({ ...item, [key]: event.target.checked })} />{t(`prescriptions.builder.${key}`)}</label>)}
      </div>
      <a href="#medication-information" className="clinical-link mt-2 text-[.68rem]" onClick={(event) => event.preventDefault()}>{t("prescriptions.actions.medicationInfo")}<ExternalLink size={12} aria-hidden="true" /></a>
    </article>
  );
}

