import { useState } from "react";
import { FileText, Plus, TriangleAlert } from "lucide-react";
import { Button, Field, Notice, PageHeader, Pill, inputClass } from "../dashboard-ui";
import type { PrescriptionDraftInput, PrescriptionItemInput } from "../types";
import { emptyPrescriptionItem } from "../drafts";
import { describeError } from "../errors";
import { PrescriptionItemEditor } from "../components/PrescriptionItemEditor";

export function PrescriptionEditorPage({
  patientName,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  patientName: string;
  value: PrescriptionDraftInput;
  onChange: (value: PrescriptionDraftInput) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const updateItem = (index: number, next: PrescriptionItemInput) =>
    onChange({
      ...value,
      items: value.items.map((item, itemIndex) =>
        itemIndex === index ? next : item,
      ),
    });
  const locallyValid = value.items.length > 0 && value.items.every(
    (item) =>
      item.dci.trim() &&
      item.strength.trim() &&
      item.pharmaceuticalForm.trim() &&
      item.route.trim() &&
      item.dosePerIntake.trim() &&
      item.frequency.trim() &&
      item.quantity.trim() &&
      (!item.durationDays || item.durationDays > 0),
  );
  return (
    <section className="workspace-stack" aria-label="Ordonnance hors ligne">
      <PageHeader
        icon={<FileText className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Ordonnance hors ligne"
        title={patientName}
        description="La validation officielle et le numéro d’ordonnance exigent une connexion Internet."
        actions={<Pill tone="warning">Brouillon local</Pill>}
      />
      <div className="surface-section p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <input
              className={inputClass}
              value={value.type}
              onChange={(event) => onChange({ ...value, type: event.target.value })}
              placeholder="STANDARD"
            />
          </Field>
          <Field label="Valable jusqu’au">
            <input
              className={inputClass}
              type="date"
              value={value.validUntil?.slice(0, 10) ?? ""}
              onChange={(event) =>
                onChange({ ...value, validUntil: event.target.value || null })
              }
            />
          </Field>
        </div>
      </div>
      {value.items.map((item, index) => (
        <PrescriptionItemEditor
          key={`${item.medicationId ?? "manual"}-${index}`}
          index={index}
          item={item}
          onChange={(next) => updateItem(index, next)}
          onRemove={
            value.items.length > 1
              ? () =>
                  onChange({
                    ...value,
                    items: value.items.filter((_, itemIndex) => itemIndex !== index),
                  })
              : undefined
          }
        />
      ))}
      <div>
        <Button
          variant="secondary"
          onClick={() => onChange({ ...value, items: [...value.items, emptyPrescriptionItem()] })}
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />Ajouter un médicament
        </Button>
      </div>
      {error && <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Fermer</Button>
        <button type="button" className="clinical-button clinical-button-unavailable" disabled title="Connexion Internet requise pour la validation officielle.">
          Valider l’ordonnance (connexion requise)
        </button>
        <Button
          disabled={saving || !locallyValid}
          onClick={() => {
            setSaving(true);
            setError("");
            void onSave()
              .catch((cause) => setError(describeError(cause)))
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer localement"}
        </Button>
      </div>
    </section>
  );
}
