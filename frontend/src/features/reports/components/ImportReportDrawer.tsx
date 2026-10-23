"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePatientContext } from "@/features/prescriptions/hooks/use-patient-context";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { useImportReport } from "../hooks/use-report-mutations";
import { type ClinicalReport, type ImportedReportCategory } from "../types/report.types";
import { getReportErrorKey } from "../utils/report-errors";
import { DrawerShell } from "./DrawerShell";
import { ReportPatientPicker, type PatientChoice } from "./ReportPatientPicker";
import { ReportActionError } from "./ReportStateViews";

const categories: ImportedReportCategory[] = ["EXTERNAL_MEDICAL", "RADIOLOGY", "OTHER_CLINICAL"];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

type ImportReportDrawerProps = {
  locale: Locale;
  onClose: () => void;
  onDone: (report: ClinicalReport) => void;
  t: TranslationFunction;
};

const today = () => new Date().toISOString().slice(0, 10);

// An external document (PDF, JPEG or PNG) filed in the record as a final
// report: the API stores the file and gives it a number.
export function ImportReportDrawer({ locale, onClose, onDone, t }: ImportReportDrawerProps) {
  const importer = useImportReport();
  const [patient, setPatient] = useState<PatientChoice | null>(null);
  const [category, setCategory] = useState<ImportedReportCategory>("EXTERNAL_MEDICAL");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [author, setAuthor] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [notes, setNotes] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<"fileType" | "fileTooLarge" | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const context = usePatientContext(patient?.id ?? null);
  const canSubmit = Boolean(patient && title.trim() && date && author.trim() && file && !fileError);

  const pick = (selected: File | undefined) => {
    setFile(selected ?? null);
    if (!selected) return setFileError(null);
    if (!ACCEPTED_TYPES.includes(selected.type)) return setFileError("fileType");
    setFileError(selected.size > MAX_FILE_BYTES ? "fileTooLarge" : null);
  };

  const submit = () => {
    if (!canSubmit || !patient || !file) return;
    setErrorKey(null);
    importer.mutate(
      {
        category,
        effectiveDate: date,
        encounterId: encounterId || undefined,
        externalAuthor: author.trim(),
        file,
        notes: notes.trim() || undefined,
        patientId: patient.id,
        specialty: specialty.trim() || undefined,
        title: title.trim(),
      },
      { onError: (error) => setErrorKey(getReportErrorKey(error)), onSuccess: onDone },
    );
  };

  return (
    <DrawerShell busy={importer.isPending} onClose={onClose} title={t("reports.import.title")} t={t}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <ReportPatientPicker locale={locale} onChange={(choice) => { setPatient(choice); setEncounterId(""); }} t={t} value={patient} />
        <Field label={t("reports.import.type")}><Select value={category} onChange={(event) => setCategory(event.target.value as ImportedReportCategory)}>{categories.map((value) => <option key={value} value={value}>{t(`reports.categories.${value}`)}</option>)}</Select></Field>
        <Field label={`${t("reports.import.documentTitle")} *`}><Input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label={`${t("reports.import.date")} *`}><Input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label={`${t("reports.import.author")} *`}><Input maxLength={160} value={author} onChange={(event) => setAuthor(event.target.value)} /></Field>
        <Field label={t("reports.import.specialty")}><Input maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} /></Field>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.import.file")} *</span><Input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => pick(event.target.files?.[0])} />{fileError ? <span className="mt-1 block text-[0.68rem] text-[var(--danger-ink)]" role="alert">{t(`reports.errors.${fileError}`)}</span> : null}</label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.import.notes")}</span><Textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.import.encounter")}</span><Select value={encounterId} disabled={!patient} onChange={(event) => setEncounterId(event.target.value)}><option value="">{t("reports.import.noEncounter")}</option>{(context.data?.encounters ?? []).map((encounter) => <option key={encounter.id} value={encounter.id}>{new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(new Date(encounter.date))} — {encounter.label}</option>)}</Select></label>
        {errorKey ? <div className="sm:col-span-2"><ReportActionError errorKey={errorKey} t={t} /></div> : null}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] py-3 sm:col-span-2"><button type="button" className="clinical-button" disabled={importer.isPending} onClick={onClose}>{t("reports.actions.back")}</button><button type="submit" className="clinical-button clinical-button-primary" disabled={!canSubmit || importer.isPending}><FileUp size={15} aria-hidden="true" />{importer.isPending ? t("reports.import.uploading") : t("reports.import.confirm")}</button></div>
      </form>
    </DrawerShell>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{label}</span>{children}</label>; }
