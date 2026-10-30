import { Pill as PillIcon } from "lucide-react";
import { Button, Field, inputClass } from "../dashboard-ui";
import type { PrescriptionItemInput } from "../types";
import { MedicationPicker } from "./MedicationPicker";

export function PrescriptionItemEditor({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: PrescriptionItemInput;
  onChange: (item: PrescriptionItemInput) => void;
  onRemove?: () => void;
}) {
  const field = (key: keyof PrescriptionItemInput, label: string, type = "text") => (
    <Field label={label}>
      <input
        className={inputClass}
        type={type}
        value={String(item[key] ?? "")}
        onChange={(event) =>
          onChange({
            ...item,
            [key]: type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value,
          })
        }
      />
    </Field>
  );
  const checkbox = (key: "asNeeded" | "renewalAllowed" | "substitutionAllowed", label: string) => (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--ink-soft)]">
      <input
        className="h-4 w-4 accent-[var(--accent)]"
        type="checkbox"
        checked={item[key]}
        onChange={(event) => onChange({ ...item, [key]: event.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <article className="surface-section p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
            <PillIcon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Médicament {index + 1}</h3>
        </div>
        {onRemove && <Button variant="ghost" size="sm" onClick={onRemove}>Retirer</Button>}
      </div>
      <MedicationPicker
        selected={item}
        onSelect={(medication) =>
          onChange({
            ...item,
            medicationId: medication.id,
            dci: medication.dci,
            brandName: medication.brandName ?? null,
            strength: medication.strength,
            pharmaceuticalForm: medication.pharmaceuticalForm,
            route: medication.route,
            manufacturer: medication.manufacturer ?? null,
            regulatoryCategory: medication.regulatoryCategory,
          })
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {field("dci", "DCI")}
        {field("brandName", "Marque")}
        {field("strength", "Dosage")}
        {field("pharmaceuticalForm", "Forme pharmaceutique")}
        {field("route", "Voie")}
        {field("dosePerIntake", "Dose par prise")}
        {field("frequency", "Fréquence")}
        {field("intakeMoment", "Moment de prise")}
        {field("durationDays", "Durée (jours)", "number")}
        {field("quantity", "Quantité")}
        {field("patientInstructions", "Instructions patient")}
        {field("indication", "Indication")}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-[var(--line)] pt-4">
        {checkbox("asNeeded", "Si besoin")}
        {checkbox("renewalAllowed", "Renouvelable")}
        {checkbox("substitutionAllowed", "Substitution autorisée")}
      </div>
    </article>
  );
}
