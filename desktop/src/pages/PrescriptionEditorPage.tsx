import { useMemo, useRef, useState } from "react";
import { FileText, Plus, TriangleAlert } from "lucide-react";
import { Button, Field, Notice, PageHeader, Pill, inputClass, textareaClass } from "../dashboard-ui";
import type { LocalPatient, PrescriptionDraftInput, PrescriptionItemInput } from "../types";
import { emptyPrescriptionItem } from "../drafts";
import { describeError } from "../errors";
import { fr } from "../i18n/fr";
import { PrescriptionItemEditor } from "../components/PrescriptionItemEditor";
import { SafetySummary } from "../components/SafetyAlerts";
import { ALLERGY_CONFIRMATION_LABEL, blockingAlerts, evaluatePrescriptionSafety, normalize } from "../prescription-safety";
import { hasPrintIdentity, printInputForDraft, type PrintIdentity } from "../print/build-print-input";
import { PrintControls } from "../print/PrintControls";
import { renderPrescriptionHtml } from "../print/prescription-print";

export type AllergyOverride = NonNullable<PrescriptionDraftInput["allergyOverride"]>;

export function PrescriptionEditorPage({
  patientName,
  patient,
  identity,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  patientName: string;
  // The patient of the prescription, for the safety checks and the printed
  // page; null while it is being read.
  patient: LocalPatient | null;
  identity: PrintIdentity;
  value: PrescriptionDraftInput;
  onChange: (value: PrescriptionDraftInput) => void;
  onCancel: () => void;
  // Saves the draft on this device; the local id of the saved draft, null when
  // it could not be saved.
  onSave: (allergyOverride?: AllergyOverride) => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState({ signature: "", checked: false, reason: "" });
  // What was last saved, to know whether printing has to save first.
  const savedSnapshot = useRef<string | null>(value.localId ? JSON.stringify(value.items) : null);

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

  // The checks run on what is typed, against the patient's medical summary. A
  // line is not judged before its medication has a name.
  const alerts = useMemo(
    () =>
      patient
        ? evaluatePrescriptionSafety(value.items, patient.medicalSummary ?? null).alerts.filter(
            (alert) => alert.itemIndex === undefined || Boolean(value.items[alert.itemIndex]?.dci.trim()),
          )
        : [],
    [patient, value.items],
  );
  const allergies = blockingAlerts(alerts);
  // A confirmation is for those medications: another allergic one asks again.
  const signature = allergies.map((alert) => normalize(alert.detail ?? "")).sort().join("|");
  const confirmed =
    allergies.length === 0 ||
    (confirmation.signature === signature && confirmation.checked && confirmation.reason.trim().length >= 3);
  const override = (): AllergyOverride | undefined =>
    allergies.length
      ? { reason: confirmation.reason.trim(), medications: allergies.map((alert) => alert.detail ?? "") }
      : undefined;

  const save = async (): Promise<string | null> => {
    setSaving(true);
    setError("");
    try {
      const id = await onSave(override());
      if (id) savedSnapshot.current = JSON.stringify(value.items);
      return id;
    } catch (cause) {
      setError(describeError(cause));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const printBlock = !hasPrintIdentity(identity)
    ? fr.print.noIdentity
    : !patient
      ? fr.common.loading
      : !locallyValid
        ? "Complétez chaque médicament pour imprimer."
        : !confirmed
          ? fr.safety.printBlocked
          : null;

  return (
    <section className="workspace-stack" aria-label="Ordonnance hors ligne">
      <PageHeader
        icon={<FileText className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow="Ordonnance hors ligne"
        title={patientName}
        description="La validation officielle et le numéro d’ordonnance exigent une connexion Internet."
        actions={<Pill tone="warning">Brouillon local</Pill>}
      />
      {patient ? <SafetySummary alerts={alerts} /> : null}
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
          alerts={alerts.filter((alert) => alert.itemIndex === index)}
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

      {allergies.length ? (
        <section
          role="alert"
          data-allergy-confirmation=""
          className="space-y-3 rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-[var(--danger-ink)]"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {fr.safety.allergyTitle} : {allergies.map((alert) => alert.detail).join(", ")}
          </h2>
          <p className="text-xs">{fr.safety.allergyBlocked}</p>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium">
            <input
              className="mt-0.5 h-4 w-4 accent-[var(--danger)]"
              type="checkbox"
              checked={confirmation.signature === signature && confirmation.checked}
              onChange={(event) => setConfirmation({ ...confirmation, signature, checked: event.target.checked })}
            />
            {ALLERGY_CONFIRMATION_LABEL}
          </label>
          <Field label={fr.safety.allergyReason}>
            <textarea
              className={textareaClass}
              value={confirmation.reason}
              maxLength={500}
              onChange={(event) => setConfirmation({ ...confirmation, signature, reason: event.target.value })}
            />
          </Field>
        </section>
      ) : null}

      {error && <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>{error}</Notice>}
      <div className="flex flex-wrap items-start justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Fermer</Button>
        <PrintControls
          filename="ordonnance-brouillon.html"
          disabledReason={printBlock}
          prepare={async () => {
            if (!patient) return null;
            // The page is printed from what is saved: a draft with changes
            // since the last save is saved first.
            let id = value.localId ?? null;
            if (!id || savedSnapshot.current !== JSON.stringify(value.items)) id = await save();
            if (!id) return null;
            return { localId: id, html: renderPrescriptionHtml(printInputForDraft(value.items, patient, identity)) };
          }}
        />
        <button type="button" className="clinical-button clinical-button-unavailable" disabled title="Connexion Internet requise pour la validation officielle.">
          Valider l’ordonnance (connexion requise)
        </button>
        <Button disabled={saving || !locallyValid || !confirmed} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer localement"}
        </Button>
      </div>
    </section>
  );
}
