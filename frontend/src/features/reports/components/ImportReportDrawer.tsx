"use client";

import { FileUp, X } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localizeReport } from "../reports.copy";
import { type ReportPatient } from "../types/report.types";

export type ImportReportInput = {
  author: string;
  date: string;
  fileName: string;
  notes: string;
  patientId: string;
  specialty: string;
  title: string;
  type: "EXTERNAL_MEDICAL" | "RADIOLOGY" | "OTHER_CLINICAL";
};

export function ImportReportDrawer({ locale, onClose, onImport, patients, t }: { locale: Locale; onClose: () => void; onImport: (input: ImportReportInput) => void; patients: ReportPatient[]; t: TranslationFunction }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [type, setType] = useState<ImportReportInput["type"]>("EXTERNAL_MEDICAL");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("2026-10-20");
  const [author, setAuthor] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [fileName, setFileName] = useState("");
  const [notes, setNotes] = useState("");
  const canSubmit = patientId && title.trim() && date && author.trim() && fileName;
  return (
    <DrawerShell onClose={onClose} title={t("reports.import.title")} t={t}>
      <div className="mb-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-3 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.import.demoNotice")}</div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (canSubmit) onImport({ author: author.trim(), date, fileName, notes: notes.trim(), patientId, specialty: specialty.trim(), title: title.trim(), type }); }}>
        <Field label={t("reports.import.patient")}><Select value={patientId} onChange={(event) => setPatientId(event.target.value)}>{patients.map((patient) => <option key={patient.id} value={patient.id}>{localizeReport(patient.fullName, locale)}</option>)}</Select></Field>
        <Field label={t("reports.import.type")}><Select value={type} onChange={(event) => setType(event.target.value as ImportReportInput["type"])}><option value="EXTERNAL_MEDICAL">{t("reports.categories.EXTERNAL_MEDICAL")}</option><option value="RADIOLOGY">{t("reports.categories.RADIOLOGY")}</option><option value="OTHER_CLINICAL">{t("reports.categories.OTHER_CLINICAL")}</option></Select></Field>
        <Field label={t("reports.import.documentTitle")}><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label={t("reports.import.date")}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label={t("reports.import.author")}><Input value={author} onChange={(event) => setAuthor(event.target.value)} /></Field>
        <Field label={t("reports.import.specialty")}><Input value={specialty} onChange={(event) => setSpecialty(event.target.value)} /></Field>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.import.file")}</span><Input type="file" accept="application/pdf,.pdf" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.import.notes")}</span><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.import.encounter")}</span><Select><option>{t("reports.import.noEncounter")}</option><option>{t("reports.import.demoEncounter")}</option></Select></label>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] py-3 sm:col-span-2"><button type="button" className="clinical-button" onClick={onClose}>{t("reports.actions.back")}</button><button type="submit" className="clinical-button clinical-button-primary" disabled={!canSubmit}><FileUp size={15} aria-hidden="true" />{t("reports.import.confirm")}</button></div>
      </form>
    </DrawerShell>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{label}</span>{children}</label>; }

export function DrawerShell({ children, onClose, t, title }: { children: React.ReactNode; onClose: () => void; t: TranslationFunction; title: string }) {
  return <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 end-0 flex w-full max-w-[840px] flex-col border-s border-[var(--border)] bg-[var(--surface-elevated)]"><header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6"><div><p className="text-[0.68rem] font-semibold text-[var(--medical)]">{t("reports.common.clinicalReportsCenter")}</p><h2 className="mt-1 text-lg font-semibold">{title}</h2></div><button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("reports.actions.close")}><X size={19} aria-hidden="true" /></button></header><div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6">{children}</div></aside></div>;
}

