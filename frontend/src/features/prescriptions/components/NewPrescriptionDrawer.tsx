import { Search, ShieldAlert, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { usePatientContext, usePatientSearch } from "../hooks/use-patient-context";
import { usePrescriberContext } from "../hooks/use-prescriber-context";
import {
  useCreatePrescription,
  useSubmitPrescription,
  useUpdatePrescription,
  useValidatePrescription,
} from "../hooks/use-prescription-mutations";
import {
  type ClinicalSafetyAlert,
  type Prescription,
  type PrescriptionCapabilities,
} from "../types/prescription.types";
import { getPrescriptionErrorKey } from "../utils/prescription-errors";
import {
  getItemIssues,
  type ItemDraft,
  itemFromPrescription,
  toItemInput,
  typeFromItems,
} from "../utils/prescription-form";
import { formatDoctorName, formatPrescriptionDate, getPatientDisplayName } from "../utils/prescription-format";
import { ClinicalSafetyPanel } from "./ClinicalSafetyPanel";
import { InsuranceContext } from "./InsuranceContext";
import { MedicationComposer, nextItemKey } from "./MedicationComposer";
import { PatientContextCard } from "./PatientContextCard";
import { PrescriptionActionError } from "./PrescriptionStateViews";
import { PrescriptionReview } from "./PrescriptionReview";

export type BuilderResult = { prescription: Prescription; validated: boolean };

/** Opened from a consultation: the patient and the consultation are given, not chosen. */
export type PrescriptionContext = {
  encounterId: string;
  encounterLabel: string;
  patient: { id: string; label: string };
};

type NewPrescriptionDrawerProps = {
  capabilities: PrescriptionCapabilities;
  /** The patient and the consultation the prescription is written for (they cannot be changed). */
  context?: PrescriptionContext;
  /** A draft to continue (edit, or a renewal just created by the API). */
  draft?: Prescription;
  locale: Locale;
  onClose: () => void;
  onDone: (result: BuilderResult) => void;
  t: TranslationFunction;
};

type PatientChoice = { id: string; label: string };

const patientLabel = (patient: Parameters<typeof getPatientDisplayName>[0] & { hospitalRecordNumber: string | null }, locale: Locale) =>
  `${getPatientDisplayName(patient, locale)}${patient.hospitalRecordNumber ? ` · ${patient.hospitalRecordNumber}` : ""}`;

export function NewPrescriptionDrawer({ capabilities, context: given, draft, locale, onClose, onDone, t }: NewPrescriptionDrawerProps) {
  const listId = useId();
  const create = useCreatePrescription();
  const update = useUpdatePrescription();
  const submit = useSubmitPrescription();
  const validate = useValidatePrescription();
  const prescriber = usePrescriberContext(capabilities.canCreatePrescription);

  const [patient, setPatient] = useState<PatientChoice | null>(() => draft ? { id: draft.patient.id, label: patientLabel(draft.patient, locale) } : (given?.patient ?? null));
  const [patientQuery, setPatientQuery] = useState(patient?.label ?? "");
  const [encounterId, setEncounterId] = useState(draft?.encounter?.id ?? given?.encounterId ?? "");
  const [items, setItems] = useState<ItemDraft[]>(() => draft ? draft.items.map((item) => itemFromPrescription(nextItemKey(), item)) : []);
  const [acknowledged, setAcknowledged] = useState(draft?.regulatoryDetails?.acknowledgement === true);
  const [carnetReference, setCarnetReference] = useState(draft?.regulatoryDetails?.carnetReference ?? "");
  const [savedId, setSavedId] = useState<string | null>(draft?.id ?? null);
  const [pendingId, setPendingId] = useState<string | null>(draft?.status === "PENDING_VALIDATION" ? draft.id : null);
  const [alerts, setAlerts] = useState<ClinicalSafetyAlert[]>(draft?.alerts ?? []);
  const [evaluated, setEvaluated] = useState(Boolean(draft));
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const patientSearch = usePatientSearch(patientQuery);
  const context = usePatientContext(patient?.id ?? null);
  const candidates = patientSearch.data?.data ?? [];
  const type = typeFromItems(items);
  const isRegulated = type !== "STANDARD";
  const canSave = Boolean(patient) && items.length > 0 && items.every((item) => getItemIssues(item).length === 0);
  const durationDays = items.reduce((longest, item) => Math.max(longest, Number(item.durationDays) || 0), 0);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [busy, onClose]);

  const changeItems = (next: ItemDraft[]) => {
    setItems(next);
    setNeedsConfirmation(false);
  };

  // Creates the draft, or updates the one already saved from this drawer.
  const persist = async () => {
    const lines = items.map(toItemInput);
    const regulatory = isRegulated ? { acknowledgement: acknowledged, carnetReference: carnetReference.trim() || undefined } : undefined;
    if (savedId) {
      return update.mutateAsync({ id: savedId, input: { encounterId: encounterId || null, items: lines, regulatory, type } });
    }
    return create.mutateAsync({ encounterId: encounterId || undefined, items: lines, patientId: (patient as PatientChoice).id, regulatory, type });
  };

  const run = async (mode: "draft" | "validate") => {
    setBusy(true);
    setErrorKey(null);
    try {
      // Submitted already (a previous validation failed afterwards): the
      // content is frozen for editing, only the validation is left.
      if (pendingId) {
        onDone({ prescription: await validate.mutateAsync(pendingId), validated: true });
        return;
      }
      let saved = await persist();
      setSavedId(saved.id);
      setAlerts(saved.alerts);
      setEvaluated(true);
      if (mode === "draft") {
        onDone({ prescription: saved, validated: false });
        return;
      }
      // Alerts the prescriber has not seen yet stop the validation once: the
      // panel shows them, and the next click confirms them.
      const critical = saved.alerts.some((alert) => !alert.resolved && alert.level === "critical");
      if (critical && !needsConfirmation) {
        setNeedsConfirmation(true);
        return;
      }
      if (saved.status === "DRAFT") {
        saved = await submit.mutateAsync(saved.id);
        setPendingId(saved.id);
      }
      saved = await validate.mutateAsync(saved.id);
      onDone({ prescription: saved, validated: true });
    } catch (error) {
      setErrorKey(getPrescriptionErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  const reimbursable = items.map((item) => item.reimbursable);
  const priorApproval = items.map((item) => item.requiresPriorApproval);
  const insurance = context.data?.patient;
  return (
    <div className="fixed inset-0 z-50 bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="absolute inset-y-0 end-0 flex w-full max-w-[1500px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="new-prescription-title">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
          <div><p className="text-[.68rem] font-medium text-[var(--medical)]">{t("prescriptions.page.context")}</p><h2 id="new-prescription-title" className="mt-1 text-lg font-semibold">{t("prescriptions.builder.title")}</h2><p className="mt-1 text-[.72rem] text-[var(--text-secondary)]">{t("prescriptions.builder.subtitle")}</p>{draft?.basedOnPrescriptionNumber ? <p className="mt-2 inline-flex rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-[.68rem] font-semibold text-[var(--accent-dark)]">{t("prescriptions.common.basedOn")} <bdi dir="ltr" className="ms-1">{draft.basedOnPrescriptionNumber}</bdi></p> : null}</div>
          <button type="button" className="clinical-icon-button shrink-0" onClick={onClose} disabled={busy} aria-label={t("prescriptions.actions.close")}><X size={20} aria-hidden="true" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isRegulated ? (
            <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-[var(--warning-ink)]">
              <div className="flex items-start gap-3"><ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><div><p className="text-sm font-semibold">{t("prescriptions.regulated.title")}</p><p className="mt-1 text-[.72rem]">{type === "NARCOTIC" ? t("prescriptions.regulated.narcotic") : t("prescriptions.regulated.psychotropic")}</p><p className="mt-1 text-[.68rem] font-semibold">{t("prescriptions.regulated.support")}</p><p className="mt-1 text-[.66rem]">{t("prescriptions.regulated.notOfficialBook")}</p></div></div>
              <label className="mt-3 flex items-start gap-2 text-[.72rem] font-medium"><Checkbox checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t("prescriptions.regulated.acknowledgement")}</label>
              <label className="mt-3 block max-w-sm"><span className="mb-1.5 block text-[.66rem] font-medium">{t("prescriptions.regulated.carnetReference")}</span><Input className="h-10 rounded-[var(--radius-sm)] bg-[var(--surface)] text-[.76rem] shadow-none" value={carnetReference} maxLength={120} onChange={(event) => setCarnetReference(event.target.value)} /></label>
            </div>
          ) : null}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,.82fr)_minmax(420px,1.45fr)_minmax(280px,.82fr)]">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">{t("prescriptions.builder.areas.patient")}</h3>
              <label className="block"><span className="mb-1.5 block text-[.68rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.searchPatient")} *</span><span className="relative block"><Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} aria-hidden="true" /><Input className="h-10 rounded-[var(--radius-sm)] ps-9 text-[.76rem] shadow-none" list={listId} value={patientQuery} disabled={Boolean(savedId) || Boolean(given)} onBlur={() => setPatientQuery(patient?.label ?? "")} onChange={(event) => { const value = event.target.value; setPatientQuery(value); const match = candidates.find((candidate) => patientLabel(candidate, locale) === value); if (match) { setPatient({ id: match.id, label: value }); setEncounterId(""); } }} /></span><datalist id={listId}>{candidates.map((candidate) => <option key={candidate.id} value={patientLabel(candidate, locale)} />)}</datalist>{patientSearch.isError ? <span className="mt-1 block text-[.64rem] text-[var(--danger-ink)]" role="alert">{t("prescriptions.states.searchError")}</span> : null}</label>
              <label className="block"><span className="mb-1.5 block text-[.68rem] font-medium text-[var(--text-secondary)]">{t("prescriptions.builder.associatedConsultation")}</span><Select className="h-10 rounded-[var(--radius-sm)] text-[.76rem] shadow-none" value={encounterId} disabled={Boolean(given)} onChange={(event) => setEncounterId(event.target.value)}><option value="">{t("prescriptions.builder.noEncounter")}</option>{given && !(context.data?.encounters ?? []).some((encounter) => encounter.id === given.encounterId) ? <option value={given.encounterId}>{given.encounterLabel}</option> : null}{(context.data?.encounters ?? []).map((encounter) => <option key={encounter.id} value={encounter.id}>{formatPrescriptionDate(encounter.date, locale)} — {encounter.label}</option>)}</Select></label>
              <PatientContextCard context={context.data} errorKey={context.isError ? getPrescriptionErrorKey(context.error) : undefined} isLoading={context.isLoading} locale={locale} t={t} />
              <InsuranceContext maskedInsuredNumber={insurance?.maskedInsuredNumber ?? null} organization={insurance?.insurance ?? null} priorApproval={priorApproval} reimbursable={reimbursable} t={t} />
            </section>
            <MedicationComposer items={items} onChange={changeItems} t={t} />
            <section className="space-y-4 lg:sticky lg:top-0">
              <h3 className="text-sm font-semibold">{t("prescriptions.builder.areas.review")}</h3>
              <ClinicalSafetyPanel alerts={alerts} evaluated={evaluated} t={t} />
              <PrescriptionReview alerts={alerts} busy={busy} canSave={canSave} capabilities={capabilities} credentialsComplete={prescriber.data?.credentialsComplete ?? true} durationDays={durationDays} itemCount={items.length} locale={locale} needsConfirmation={needsConfirmation} onSave={() => void run("draft")} onValidate={() => void run("validate")} patientLabel={patient?.label ?? ""} prescriberLabel={formatDoctorName(prescriber.data?.fullName)} t={t} validationBlocked={isRegulated && !acknowledged} />
              {errorKey ? <PrescriptionActionError errorKey={errorKey} t={t} /> : null}
              {needsConfirmation && !errorKey ? <p className="rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-[.72rem] text-[var(--danger-ink)]" role="alert">{t("prescriptions.safety.confirmCritical")}</p> : null}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
