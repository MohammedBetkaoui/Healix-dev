import { Database, Plus } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type Medication, type PrescriptionItem } from "../types/prescription.types";
import { MedicationRow } from "./MedicationRow";

type MedicationComposerProps = {
  items: PrescriptionItem[];
  locale: Locale;
  medications: Medication[];
  onChange: (items: PrescriptionItem[]) => void;
  t: TranslationFunction;
};

function newItem(medication: Medication, index: number): PrescriptionItem {
  return {
    id: `draft-item-${Date.now()}-${index}`,
    medication,
    dosePerIntake: { fr: "1 comprimé", ar: "قرص واحد" },
    frequency: { fr: "1 fois par jour", ar: "مرة واحدة يومياً" },
    intakeMoment: { fr: "Le matin", ar: "صباحاً" },
    durationDays: 7,
    quantity: { fr: "7 unités", ar: "7 وحدات" },
    patientInstructions: { fr: "Respecter la posologie indiquée.", ar: "احترام الجرعة المحددة." },
    indication: { fr: "À préciser", ar: "يحدد لاحقاً" },
    asNeeded: false,
    renewalAllowed: false,
    substitutionAllowed: true,
  };
}

export function MedicationComposer({ items, locale, medications, onChange, t }: MedicationComposerProps) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{t("prescriptions.builder.areas.medications")}</h3><p className="mt-1 flex items-center gap-1.5 text-[.66rem] text-[var(--text-secondary)]"><Database size={13} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.builder.anppReady")}</p></div><button type="button" className="clinical-button" onClick={() => onChange([...items, newItem(medications[0], items.length)])}><Plus size={15} aria-hidden="true" />{t("prescriptions.actions.addMedication")}</button></div>
      <div className="space-y-3">{items.map((item, index) => <MedicationRow key={item.id} index={index} item={item} locale={locale} medications={medications} onChange={(updated) => onChange(items.map((candidate) => candidate.id === item.id ? updated : candidate))} onRemove={() => onChange(items.filter((candidate) => candidate.id !== item.id))} t={t} />)}</div>
    </section>
  );
}

