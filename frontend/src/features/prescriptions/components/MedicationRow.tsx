import { ExternalLink, Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationFunction } from "@/lib/i18n";

import {
  type AdministrationRoute,
  type PharmaceuticalForm,
} from "../types/prescription.types";
import { applyMedication, type ItemDraft } from "../utils/prescription-form";
import { MedicationSearch } from "./MedicationSearch";

type MedicationRowProps = {
  index: number;
  item: ItemDraft;
  onChange: (item: ItemDraft) => void;
  onRemove: () => void;
  t: TranslationFunction;
};

const forms: PharmaceuticalForm[] = ["TABLET", "CAPSULE", "ORAL_SOLUTION", "INJECTABLE", "EYE_DROPS", "OINTMENT", "INHALER", "OTHER"];
const routes: AdministrationRoute[] = ["ORAL", "IV", "IM", "SC", "CUTANEOUS", "OPHTHALMIC", "INHALED", "OTHER"];

function Field({ disabled, label, onChange, required, type = "text", value }: { disabled?: boolean; label: string; onChange: (value: string) => void; required?: boolean; type?: string; value: string | number }) {
  return <label className="block"><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{label}{required ? " *" : ""}</span><Input type={type} min={type === "number" ? 1 : undefined} disabled={disabled} required={required} className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function MedicationRow({ index, item, onChange, onRemove, t }: MedicationRowProps) {
  // A line taken from the reference is described by it: the API ignores any
  // other value for these fields, so they are not editable.
  const locked = Boolean(item.medicationId);
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold"><span className="me-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[.68rem] text-[var(--medical)]">{index + 1}</span>{item.dci || t("prescriptions.builder.newMedication")}</h4><button type="button" className="clinical-icon-button h-8 min-w-8 text-[var(--danger-ink)]" onClick={onRemove} aria-label={t("prescriptions.actions.remove")}><Trash2 size={15} aria-hidden="true" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="sm:col-span-2 xl:col-span-2"><MedicationSearch item={item} t={t} onSelect={(medication) => onChange(applyMedication(item, medication))} onFreeText={(value) => onChange({ ...item, dci: value, medicationId: undefined })} /></div>
        <Field label={t("prescriptions.builder.brand")} value={item.brandName} disabled={locked} onChange={(value) => onChange({ ...item, brandName: value })} />
        <Field label={t("prescriptions.builder.dosage")} value={item.strength} disabled={locked} required onChange={(value) => onChange({ ...item, strength: value })} />
        <label><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.form")}</span><Select className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.pharmaceuticalForm} disabled={locked} onChange={(event) => onChange({ ...item, pharmaceuticalForm: event.target.value as PharmaceuticalForm })}>{forms.map((form) => <option key={form} value={form}>{t(`prescriptions.forms.${form}`)}</option>)}</Select></label>
        <label><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.route")}</span><Select className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.route} disabled={locked} onChange={(event) => onChange({ ...item, route: event.target.value as AdministrationRoute })}>{routes.map((route) => <option key={route} value={route}>{t(`prescriptions.routes.${route}`)}</option>)}</Select></label>
        <Field label={t("prescriptions.builder.dosePerIntake")} value={item.dosePerIntake} required onChange={(value) => onChange({ ...item, dosePerIntake: value })} />
        <Field label={t("prescriptions.builder.frequency")} value={item.frequency} required onChange={(value) => onChange({ ...item, frequency: value })} />
        <Field label={t("prescriptions.builder.intakeMoment")} value={item.intakeMoment} onChange={(value) => onChange({ ...item, intakeMoment: value })} />
        <Field label={t("prescriptions.builder.duration")} type="number" value={item.durationDays} onChange={(value) => onChange({ ...item, durationDays: value })} />
        <Field label={t("prescriptions.builder.quantity")} value={item.quantity} required onChange={(value) => onChange({ ...item, quantity: value })} />
        <label className="sm:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.instructions")}</span><Textarea className="min-h-20 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.patientInstructions} onChange={(event) => onChange({ ...item, patientInstructions: event.target.value })} /></label>
        <label className="sm:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-[.66rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.indication")}</span><Textarea className="min-h-16 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={item.indication} onChange={(event) => onChange({ ...item, indication: event.target.value })} /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--line-soft)] pt-3">
        {(["asNeeded", "renewalAllowed", "substitutionAllowed"] as const).map((key) => <label key={key} className="flex items-start gap-2 text-[.7rem] text-[var(--text-primary)]"><Checkbox checked={item[key]} onChange={(event) => onChange({ ...item, [key]: event.target.checked })} />{t(`prescriptions.builder.${key}`)}</label>)}
      </div>
      <a href="#medication-information" className="clinical-link mt-2 text-[.68rem]" onClick={(event) => event.preventDefault()}>{t("prescriptions.actions.medicationInfo")}<ExternalLink size={12} aria-hidden="true" /></a>
    </article>
  );
}
