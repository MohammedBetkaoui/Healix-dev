import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { Button, Field, PageHeader, Pill, textareaClass } from "../dashboard-ui";
import type { ConsultationDraftInput } from "../types";

export function ConsultationEditorPage({
  patientName,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  patientName: string;
  value: ConsultationDraftInput;
  onChange: (value: ConsultationDraftInput) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const field = (key: keyof ConsultationDraftInput, label: string) => (
    <Field label={label}>
      <textarea
        className={textareaClass}
        value={String(value[key] ?? "")}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </Field>
  );
  return (
    <section className="workspace-stack" aria-label="Consultation hors ligne">
      <PageHeader
        icon={<Stethoscope className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Consultation hors ligne"
        title={patientName}
        actions={<Pill tone="warning">Brouillon local</Pill>}
      />
      <div className="surface-section p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {field("chiefComplaint", "Motif")}
          {field("historyPresentIllness", "Histoire de la maladie")}
          {field("clinicalExamination", "Examen clinique")}
          {field("assessment", "Évaluation")}
          {field("carePlan", "Plan thérapeutique")}
          {field("followUpPlan", "Suivi")}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Fermer</Button>
        <Button variant="secondary" onClick={() => onChange({ ...value, localStatus: "READY_TO_SYNC" })}>
          Marquer prête à synchroniser
        </Button>
        <Button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave().finally(() => setSaving(false));
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer localement"}
        </Button>
      </div>
    </section>
  );
}
