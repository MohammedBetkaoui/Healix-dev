"use client";

import { Check, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { type PatientChoice } from "@/features/reports/components/ReportPatientPicker";
import { type Direction, type TranslationFunction } from "@/lib/i18n";

import { useConsultationMutations } from "../hooks/use-consultation-mutations";
import { type ConsultationDetail, type ConsultationDiagnosis, type ConsultationVitalSigns, type UpdateConsultationPayload } from "../types/consultation.types";

type Props = {
  consultation?: ConsultationDetail | null;
  direction: Direction;
  onClose: () => void;
  onDone: (consultation: ConsultationDetail) => void;
  patient: PatientChoice;
  t: TranslationFunction;
};

type VitalForm = Record<keyof ConsultationVitalSigns, string>;
type DiagnosisForm = Omit<ConsultationDiagnosis, "id"> & { localId: string };
type ClinicalForm = {
  chiefComplaint: string;
  historyPresentIllness: string;
  clinicalExamination: string;
  assessment: string;
  carePlan: string;
  followUpPlan: string;
  vitalSigns: VitalForm;
  diagnoses: DiagnosisForm[];
};

const emptyVitals: VitalForm = { systolicBp: "", diastolicBp: "", heartRate: "", respiratoryRate: "", oxygenSaturation: "", temperature: "", weightKg: "", heightCm: "" };
const textAreaClass = "min-h-28 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

function initialForm(consultation?: ConsultationDetail | null): ClinicalForm {
  const vital = consultation?.vitalSigns;
  return {
    chiefComplaint: consultation?.chiefComplaint ?? "",
    historyPresentIllness: consultation?.historyPresentIllness ?? "",
    clinicalExamination: consultation?.clinicalExamination ?? "",
    assessment: consultation?.assessment ?? "",
    carePlan: consultation?.carePlan ?? "",
    followUpPlan: consultation?.followUpPlan ?? "",
    vitalSigns: vital ? Object.fromEntries(Object.keys(emptyVitals).map((key) => [key, vital[key as keyof ConsultationVitalSigns] == null ? "" : String(vital[key as keyof ConsultationVitalSigns])])) as VitalForm : { ...emptyVitals },
    diagnoses: consultation?.diagnoses.map((diagnosis, index) => ({ code: diagnosis.code, codeSystem: diagnosis.codeSystem, isPrimary: diagnosis.isPrimary, label: diagnosis.label, localId: diagnosis.id ?? `existing-${index}`, note: diagnosis.note })) ?? [],
  };
}

const toNumber = (value: string) => value.trim() === "" ? null : Number(value);
const toPayload = (form: ClinicalForm): UpdateConsultationPayload => ({
  chiefComplaint: form.chiefComplaint.trim() || null,
  historyPresentIllness: form.historyPresentIllness.trim() || null,
  clinicalExamination: form.clinicalExamination.trim() || null,
  assessment: form.assessment.trim() || null,
  carePlan: form.carePlan.trim() || null,
  followUpPlan: form.followUpPlan.trim() || null,
  vitalSigns: Object.fromEntries(Object.entries(form.vitalSigns).map(([key, value]) => [key, toNumber(value)])) as ConsultationVitalSigns,
  diagnoses: form.diagnoses.filter((diagnosis) => diagnosis.label.trim()).map((diagnosis) => ({ code: diagnosis.code?.trim() || null, codeSystem: diagnosis.codeSystem?.trim() || null, isPrimary: diagnosis.isPrimary, label: diagnosis.label.trim(), note: diagnosis.note?.trim() || null })),
});

function Section({ children, number, open = false, title }: { children: React.ReactNode; number: string; open?: boolean; title: string }) {
  return <details className="group border-b border-[var(--line-soft)] py-4 last:border-0" open={open}><summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold"><span className="clinical-figure text-[0.67rem] text-[var(--medical)]">{number}</span>{title}<span className="ms-auto text-[var(--text-muted)] transition group-open:rotate-45">+</span></summary><div className="mt-4">{children}</div></details>;
}

export function ConsultationEditorDrawer({ consultation, direction, onClose, onDone, patient, t }: Props) {
  const mutations = useConsultationMutations();
  const [form, setForm] = useState(() => initialForm(consultation));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const locked = consultation?.status === "COMPLETED" || consultation?.status === "CANCELED";
  const pending = mutations.create.isPending || mutations.update.isPending || mutations.complete.isPending;
  const savedLabel = useMemo(() => ({ idle: "", saving: t("consultations.editor.saving"), saved: t("consultations.editor.saved"), error: t("consultations.editor.saveError") })[saveState], [saveState, t]);

  const change = <Key extends keyof ClinicalForm>(key: Key, value: ClinicalForm[Key]) => { setForm((current) => ({ ...current, [key]: value })); setDirty(true); setSaveState("idle"); };
  const close = () => { if (!dirty || window.confirm(t("consultations.editor.discardConfirm"))) onClose(); };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });

  const save = async () => {
    setSaveState("saving");
    try {
      const created = consultation ?? await mutations.create.mutateAsync({ patientId: patient.id });
      const updated = await mutations.update.mutateAsync({ id: created.id, payload: toPayload(form) });
      setDirty(false);
      setSaveState("saved");
      return updated;
    } catch (error) {
      setSaveState("error");
      throw error;
    }
  };

  const finalize = async () => {
    if (!window.confirm(t("consultations.editor.finalizeConfirm"))) return;
    try {
      const saved = await save();
      const completed = await mutations.complete.mutateAsync(saved.id);
      onDone(completed);
    } catch { /* the visible save state keeps the editor and the notes open */ }
  };

  const vitalFields: Array<keyof ConsultationVitalSigns> = ["systolicBp", "diastolicBp", "heartRate", "respiratoryRate", "oxygenSaturation", "temperature", "weightKg", "heightCm"];
  return (
    <div className="fixed inset-0 z-50 bg-[var(--scrim)]" dir={direction} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-[900px] flex-col bg-[var(--surface-elevated)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="consultation-editor-title">
        <header className="border-b border-[var(--border)] px-4 py-4 sm:px-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[0.68rem] font-semibold text-[var(--medical)]">{t("consultations.editor.eyebrow")}</p><h2 id="consultation-editor-title" className="mt-1 text-lg font-semibold">{patient.label}</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{t("consultations.editor.patientAlwaysVisible")}</p></div><button type="button" className="clinical-icon-button" onClick={close} aria-label={t("consultations.actions.close")}><X size={19} aria-hidden="true" /></button></div></header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6">
          <fieldset disabled={locked || pending}>
            <Section number="01" open title={t("consultations.editor.sections.patient")}><p className="text-sm font-semibold">{patient.label}</p></Section>
            <Section number="02" open title={t("consultations.editor.sections.complaint")}><div className="grid gap-4"><label className="text-xs font-medium">{t("consultations.editor.fields.chiefComplaint")}<textarea className={`${textAreaClass} mt-1.5`} value={form.chiefComplaint} onChange={(event) => change("chiefComplaint", event.target.value)} /></label><label className="text-xs font-medium">{t("consultations.editor.fields.historyPresentIllness")}<textarea className={`${textAreaClass} mt-1.5`} value={form.historyPresentIllness} onChange={(event) => change("historyPresentIllness", event.target.value)} /></label></div></Section>
            <Section number="03" title={t("consultations.editor.sections.vitals")}><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{vitalFields.map((field) => <label key={field} className="text-[0.7rem] font-medium">{t(`consultations.editor.vitals.${field}`)}<Input className="mt-1.5" inputMode="decimal" type="number" value={form.vitalSigns[field]} onChange={(event) => change("vitalSigns", { ...form.vitalSigns, [field]: event.target.value })} /></label>)}</div></Section>
            <Section number="04" title={t("consultations.editor.sections.examination")}><textarea className={textAreaClass} value={form.clinicalExamination} onChange={(event) => change("clinicalExamination", event.target.value)} /></Section>
            <Section number="05" open title={t("consultations.editor.sections.assessment")}><label className="text-xs font-medium">{t("consultations.editor.fields.assessment")}<textarea className={`${textAreaClass} mt-1.5`} value={form.assessment} onChange={(event) => change("assessment", event.target.value)} /></label><div className="mt-4 space-y-3">{form.diagnoses.map((diagnosis, index) => <div key={diagnosis.localId} className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-3 sm:grid-cols-[1fr_8rem_auto]"><Input aria-label={t("consultations.editor.fields.diagnosisLabel")} placeholder={t("consultations.editor.fields.diagnosisLabel")} value={diagnosis.label} onChange={(event) => change("diagnoses", form.diagnoses.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /><Input aria-label={t("consultations.editor.fields.codeOptional")} placeholder={t("consultations.editor.fields.codeOptional")} value={diagnosis.code ?? ""} onChange={(event) => change("diagnoses", form.diagnoses.map((item, itemIndex) => itemIndex === index ? { ...item, code: event.target.value } : item))} /><button type="button" className="clinical-icon-button" onClick={() => change("diagnoses", form.diagnoses.filter((_, itemIndex) => itemIndex !== index))} aria-label={t("consultations.editor.removeDiagnosis")}><Trash2 size={15} aria-hidden="true" /></button><label className="flex items-center gap-2 text-[0.68rem]"><input type="radio" name="primary-diagnosis" checked={diagnosis.isPrimary} onChange={() => change("diagnoses", form.diagnoses.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })))} />{t("consultations.editor.fields.primary")}</label></div>)}<button type="button" className="clinical-button" onClick={() => change("diagnoses", [...form.diagnoses, { code: null, codeSystem: null, isPrimary: form.diagnoses.length === 0, label: "", localId: crypto.randomUUID(), note: null }])}><Plus size={15} aria-hidden="true" />{t("consultations.editor.addDiagnosis")}</button></div></Section>
            <Section number="06" title={t("consultations.editor.sections.plan")}><textarea className={textAreaClass} value={form.carePlan} onChange={(event) => change("carePlan", event.target.value)} /></Section>
            <Section number="07" title={t("consultations.editor.sections.orders")}><p className="text-xs leading-5 text-[var(--text-secondary)]">{t("consultations.editor.ordersHelp")}</p></Section>
            <Section number="08" title={t("consultations.editor.sections.followUp")}><textarea className={textAreaClass} value={form.followUpPlan} onChange={(event) => change("followUpPlan", event.target.value)} /></Section>
          </fieldset>
        </div>
        <footer className="border-t border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className={`text-xs ${saveState === "error" ? "text-[var(--danger-ink)]" : "text-[var(--text-secondary)]"}`} role={saveState === "error" ? "alert" : "status"}>{locked ? t("consultations.editor.locked") : savedLabel}</span><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="clinical-button" onClick={close}>{t("consultations.actions.cancel")}</button>{!locked ? <><button type="button" className="clinical-button" disabled={pending} onClick={() => { void save().then(onDone).catch(() => undefined); }}><Save size={15} aria-hidden="true" />{t("consultations.editor.saveDraft")}</button><button type="button" className="clinical-button clinical-button-primary" disabled={pending} onClick={() => void finalize()}><Check size={15} aria-hidden="true" />{t("consultations.editor.finalize")}</button></> : null}</div></div></footer>
      </aside>
    </div>
  );
}
