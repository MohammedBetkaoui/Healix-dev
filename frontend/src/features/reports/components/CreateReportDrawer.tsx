"use client";

import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localizeReport } from "../reports.copy";
import { type ReportCapabilities, type ReportPatient, type ReportStatus } from "../types/report.types";
import { DrawerShell } from "./ImportReportDrawer";

export type CreateReportInput = {
  conclusion: string;
  context: string;
  findings: string;
  interpretation: string;
  patientId: string;
  reason: string;
  recommendations: string;
  results: string;
  status: Extract<ReportStatus, "DRAFT" | "FINAL">;
  title: string;
};

export function CreateReportDrawer({ capabilities, locale, onClose, onCreate, patients, t }: { capabilities: ReportCapabilities; locale: Locale; onClose: () => void; onCreate: (input: CreateReportInput) => void; patients: ReportPatient[]; t: TranslationFunction }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState({ conclusion: "", context: "", findings: "", interpretation: "", reason: "", recommendations: "", results: "" });
  const update = (key: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [key]: value }));
  const submit = (status: CreateReportInput["status"]) => {
    if (!patientId || !title.trim() || !fields.reason.trim()) return;
    onCreate({ ...fields, patientId, status, title: title.trim() });
  };
  const canSubmit = Boolean(patientId && title.trim() && fields.reason.trim());
  return (
    <DrawerShell onClose={onClose} title={t("reports.create.title")} t={t}>
      <div className="mb-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-3 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.create.demoNotice")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.create.patient")}</span><Select value={patientId} onChange={(event) => setPatientId(event.target.value)}>{patients.map((patient) => <option key={patient.id} value={patient.id}>{localizeReport(patient.fullName, locale)}</option>)}</Select></label>
        <label><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.create.reportTitle")}</span><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("reports.create.titlePlaceholder")} /></label>
        {(["reason", "context", "findings", "results", "interpretation", "conclusion", "recommendations"] as const).map((key) => <label key={key} className={key === "recommendations" ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t(`reports.create.fields.${key}`)}</span><Textarea className="min-h-24" value={fields[key]} onChange={(event) => update(key, event.target.value)} /></label>)}
      </div>
      <div className="sticky bottom-0 mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] py-3"><button type="button" className="clinical-button" onClick={onClose}>{t("reports.actions.back")}</button><button type="button" className="clinical-button" disabled={!canSubmit} onClick={() => submit("DRAFT")}><Save size={15} aria-hidden="true" />{t("reports.create.saveDraft")}</button>{capabilities.canFinalizeReports ? <button type="button" className="clinical-button clinical-button-primary" disabled={!canSubmit} onClick={() => submit("FINAL")}><CheckCircle2 size={15} aria-hidden="true" />{t("reports.create.finalize")}</button> : null}</div>
    </DrawerShell>
  );
}

