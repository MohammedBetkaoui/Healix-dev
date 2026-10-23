"use client";

import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { useCreateReport, useFinalizeReport, useUpdateReport } from "../hooks/use-report-mutations";
import { reportCategoryKeys } from "../reports.copy";
import { type ClinicalReport, type ReportCapabilities, type WrittenReportCategory } from "../types/report.types";
import { getReportErrorKey } from "../utils/report-errors";
import { canFinalizeForm, canSaveReport, emptyReportForm, formFromReport, REPORT_SECTION_FIELDS, sectionsFromForm, type ReportFormValues } from "../utils/report-form";
import { DrawerShell } from "./DrawerShell";
import { patientChoiceLabel, ReportPatientPicker, type PatientChoice } from "./ReportPatientPicker";
import { ReportActionError } from "./ReportStateViews";

export type ReportDraftResult = { finalized: boolean; report: ClinicalReport };

const categories: WrittenReportCategory[] = ["CONSULTATION_NOTE", "RADIOLOGY", "LABORATORY_RESULT", "OTHER_CLINICAL"];

type CreateReportDrawerProps = {
  capabilities: ReportCapabilities;
  /** A draft to continue (or an amendment just started by the API). */
  draft?: ClinicalReport;
  locale: Locale;
  onClose: () => void;
  onDone: (result: ReportDraftResult) => void;
  t: TranslationFunction;
};

// A written report: saved as a draft, then finalized (PDF, number, frozen
// content). A draft can be edited as long as it is not finalized.
export function CreateReportDrawer({ capabilities, draft, locale, onClose, onDone, t }: CreateReportDrawerProps) {
  const create = useCreateReport();
  const update = useUpdateReport();
  const finalize = useFinalizeReport();
  const [patient, setPatient] = useState<PatientChoice | null>(() => draft ? { id: draft.patient.id, label: patientChoiceLabel(draft.patient, locale) } : null);
  const [category, setCategory] = useState<WrittenReportCategory>(() => (draft && categories.includes(draft.category as WrittenReportCategory) ? (draft.category as WrittenReportCategory) : "CONSULTATION_NOTE"));
  const [form, setForm] = useState<ReportFormValues>(() => (draft ? formFromReport(draft) : emptyReportForm));
  const [savedId, setSavedId] = useState<string | null>(draft?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const setField = (key: keyof ReportFormValues, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const canSave = Boolean(patient) && canSaveReport(form);
  const canFinish = Boolean(patient) && canFinalizeForm(form) && capabilities.canFinalizeReports;

  // Creates the draft, or updates the one already saved from this drawer.
  const persist = async () => {
    const body = { category, conclusion: form.conclusion.trim() || null, sections: sectionsFromForm(form), title: form.title.trim() };
    if (savedId) return update.mutateAsync({ id: savedId, input: body });
    return create.mutateAsync({ ...body, conclusion: body.conclusion ?? undefined, patientId: (patient as PatientChoice).id });
  };

  const run = async (finalizeNow: boolean) => {
    setBusy(true);
    setErrorKey(null);
    try {
      let report = await persist();
      setSavedId(report.id);
      if (finalizeNow) report = await finalize.mutateAsync(report.id);
      onDone({ finalized: finalizeNow, report });
    } catch (error) {
      setErrorKey(getReportErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerShell busy={busy} onClose={onClose} title={draft?.replaces ? t("reports.create.amendTitle", { version: draft.version }) : draft ? t("reports.create.editTitle") : t("reports.create.title")} t={t}>
      <div className="mb-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-3 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.create.notice")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ReportPatientPicker disabled={Boolean(savedId)} locale={locale} onChange={setPatient} t={t} value={patient} />
        <label><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.create.category")}</span><Select value={category} onChange={(event) => setCategory(event.target.value as WrittenReportCategory)}>{categories.map((value) => <option key={value} value={value}>{t(reportCategoryKeys[value])}</option>)}</Select></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.create.reportTitle")} *</span><Input maxLength={200} value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder={t("reports.create.titlePlaceholder")} /></label>
        {REPORT_SECTION_FIELDS.map((key) => <label key={key} className={key === "recommendations" ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t(`reports.create.fields.${key}`)}</span><Textarea className="min-h-24" maxLength={8000} value={form[key]} onChange={(event) => setField(key, event.target.value)} /></label>)}
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.create.fields.conclusion")}</span><Textarea className="min-h-24" maxLength={8000} value={form.conclusion} onChange={(event) => setField("conclusion", event.target.value)} /></label>
      </div>
      {errorKey ? <div className="mt-4"><ReportActionError errorKey={errorKey} t={t} /></div> : null}
      {canSave && !canFinalizeForm(form) ? <p className="mt-3 text-[0.68rem] text-[var(--text-secondary)]">{t("reports.create.contentRequired")}</p> : null}
      <div className="sticky bottom-0 mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] py-3">
        <button type="button" className="clinical-button" disabled={busy} onClick={onClose}>{t("reports.actions.back")}</button>
        <button type="button" className="clinical-button" disabled={!canSave || busy || !capabilities.canCreateReports} onClick={() => void run(false)}><Save size={15} aria-hidden="true" />{t("reports.create.saveDraft")}</button>
        {capabilities.canFinalizeReports ? <button type="button" className="clinical-button clinical-button-primary" disabled={!canFinish || busy} onClick={() => void run(true)}><CheckCircle2 size={15} aria-hidden="true" />{t("reports.create.finalize")}</button> : null}
      </div>
    </DrawerShell>
  );
}
