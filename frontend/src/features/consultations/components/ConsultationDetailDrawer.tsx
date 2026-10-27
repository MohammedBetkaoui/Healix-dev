"use client";

import { Activity, Brain, CalendarCheck, FileEdit, FilePenLine, FileText, FolderOpen, Images, Pill, Plus, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PrescriptionStatusBadge } from "@/features/prescriptions/components/PrescriptionStatusBadge";
import { prescriptionTypeTranslationKeys } from "@/features/prescriptions/prescriptions.copy";
import { formatDoctorName, getPatientAge, getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { ReportStatusBadge } from "@/features/reports/components/ReportStatusBadge";
import { reportCategoryKeys } from "@/features/reports/reports.copy";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { useConsultation, useConsultationClinicalContext } from "../hooks/use-consultation";
import { useConsultationMutations } from "../hooks/use-consultation-mutations";
import { type ConsultationDetail } from "../types/consultation.types";
import { getConsultationErrorKey } from "../utils/consultation-utils";
import { ConsultationBlockSkeleton, ConsultationErrorState } from "./ConsultationStateViews";

type Props = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  canAddAddendum: boolean;
  canEdit: boolean;
  canPrescribe: boolean;
  canWriteReport: boolean;
  closeOnEscape?: boolean;
  id: string;
  locale: Locale;
  onClose: () => void;
  onEdit: (consultation: ConsultationDetail) => void;
  onPrescribe: (consultation: ConsultationDetail) => void;
  onWriteReport: (consultation: ConsultationDetail) => void;
  t: TranslationFunction;
};

const base = (accountType: Props["accountType"]) => accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
function Section({ children, icon: Icon, title }: { children: React.ReactNode; icon: typeof Pill; title: string }) {
  return <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} className="text-[var(--medical)]" aria-hidden="true" />{title}</h3><div className="mt-3">{children}</div></section>;
}
const display = (value: string | null, fallback: string) => value || fallback;

export function ConsultationDetailDrawer({ accountType, canAddAddendum, canEdit, canPrescribe, canWriteReport, closeOnEscape = true, id, locale, onClose, onEdit, onPrescribe, onWriteReport, t }: Props) {
  const query = useConsultation(id);
  const context = useConsultationClinicalContext(id);
  const mutations = useConsultationMutations();
  const [addendum, setAddendum] = useState("");
  const consultation = query.data;
  const prefix = base(accountType);
  const tag = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const dateTime = new Intl.DateTimeFormat(tag, { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "long", year: "numeric" });
  const day = new Intl.DateTimeFormat(tag, { day: "2-digit", month: "short", year: "numeric" });
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape" && closeOnEscape) onClose(); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [closeOnEscape, onClose]);

  const submitAddendum = async () => {
    if (!addendum.trim()) return;
    try {
      await mutations.addendum.mutateAsync({ id, content: addendum.trim() });
      setAddendum("");
    } catch { /* the textarea keeps its content: the failure is already visible */ }
  };
  return (
    <div className="fixed inset-0 z-40 bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-[860px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="consultation-detail-title">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6"><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-[0.68rem] font-semibold text-[var(--medical)]">{t("consultations.detail.title")}</p>{consultation ? <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.62rem] font-semibold">{t(`consultations.statuses.${consultation.status}`)}</span> : null}</div><h2 id="consultation-detail-title" className="mt-1 truncate text-lg font-semibold">{consultation ? getPatientDisplayName(consultation.patient, locale) : "…"}</h2>{consultation ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{dateTime.format(new Date(consultation.startedAt ?? consultation.createdAt))} · {formatDoctorName(consultation.doctor.fullName)}</p> : null}</div><button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("consultations.actions.close")}><X size={19} aria-hidden="true" /></button></header>
        <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {query.isLoading ? <ConsultationBlockSkeleton t={t} /> : null}
          {query.isError ? <ConsultationErrorState errorKey={getConsultationErrorKey(query.error)} onRetry={() => void query.refetch()} t={t} /> : null}
          {consultation ? <>
            <Section icon={FolderOpen} title={t("consultations.detail.patient")}><dl className="grid gap-3 text-xs sm:grid-cols-3"><div><dt className="text-[var(--text-muted)]">{t("consultations.detail.patientName")}</dt><dd className="mt-1 font-semibold">{getPatientDisplayName(consultation.patient, locale)}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.detail.age")}</dt><dd className="mt-1 font-semibold">{getPatientAge(consultation.patient.birthDate)} {t("consultations.detail.years")}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.detail.fileNumber")}</dt><dd className="mt-1 font-semibold" dir="ltr">{consultation.patient.hospitalRecordNumber ?? t("consultations.common.notProvided")}</dd></div></dl><Link href={`${prefix}/patients/${encodeURIComponent(consultation.patient.id)}`} className="clinical-link mt-3 inline-flex text-xs font-semibold">{t("consultations.detail.openPatient")}</Link></Section>
            <Section icon={Stethoscope} title={t("consultations.detail.clinical")}><dl className="space-y-4 text-xs"><div><dt className="text-[var(--text-muted)]">{t("consultations.editor.fields.chiefComplaint")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{display(consultation.chiefComplaint, t("consultations.common.notProvided"))}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.editor.fields.historyPresentIllness")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{display(consultation.historyPresentIllness, t("consultations.common.notProvided"))}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.editor.sections.examination")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{display(consultation.clinicalExamination, t("consultations.common.notProvided"))}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.editor.fields.assessment")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{display(consultation.assessment, t("consultations.common.notProvided"))}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.editor.sections.plan")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{display(consultation.carePlan, t("consultations.common.notProvided"))}</dd></div><div><dt className="text-[var(--text-muted)]">{t("consultations.editor.sections.followUp")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{display(consultation.followUpPlan, t("consultations.common.notProvided"))}</dd></div></dl>{consultation.status === "COMPLETED" ? <p className="mt-4 border-t border-[var(--line-soft)] pt-3 text-[0.66rem] text-[var(--text-muted)]">{t("consultations.detail.recordNotice")}</p> : null}</Section>
            {consultation.vitalSigns ? <Section icon={Activity} title={t("consultations.editor.sections.vitals")}><dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">{Object.entries(consultation.vitalSigns).filter(([key]) => !["id", "consultationId", "createdAt", "updatedAt"].includes(key)).map(([key, value]) => <div key={key}><dt className="text-[var(--text-muted)]">{t(`consultations.editor.vitals.${key}`)}</dt><dd className="mt-1 font-semibold">{value == null ? "—" : String(value)}</dd></div>)}</dl></Section> : null}
            <Section icon={FileEdit} title={t("consultations.detail.diagnoses")}>{consultation.diagnoses.length ? <ul className="space-y-2">{consultation.diagnoses.map((diagnosis) => <li key={diagnosis.id ?? diagnosis.label} className="text-xs"><span className="font-semibold">{diagnosis.label}</span>{diagnosis.isPrimary ? <span className="ms-2 text-[0.64rem] text-[var(--medical)]">{t("consultations.editor.fields.primary")}</span> : null}{diagnosis.code ? <span className="clinical-figure ms-2 text-[var(--text-muted)]">{diagnosis.codeSystem ? `${diagnosis.codeSystem} · ` : ""}{diagnosis.code}</span> : null}</li>)}</ul> : <p className="text-xs text-[var(--text-secondary)]">{t("consultations.detail.noDiagnosis")}</p>}</Section>
            <Section icon={Pill} title={t("consultations.detail.prescriptions")}>{consultation.prescriptions.length ? <ul className="divide-y divide-[var(--line-soft)]">{consultation.prescriptions.map((prescription) => <li key={prescription.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><Link href={`${prefix}/prescriptions?prescription=${encodeURIComponent(prescription.id)}`} className="clinical-figure text-xs font-semibold text-[var(--accent-dark)] hover:underline" dir="ltr">{prescription.number ?? t("consultations.common.draftNumber")}</Link><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{day.format(new Date(prescription.prescribedAt))} · {t(prescriptionTypeTranslationKeys[prescription.type])}</p></div><PrescriptionStatusBadge status={prescription.effectiveStatus} t={t} /></li>)}</ul> : <p className="text-xs text-[var(--text-secondary)]">{t("consultations.detail.noPrescription")}</p>}</Section>
            <Section icon={FileText} title={t("consultations.detail.reports")}>{consultation.reports.length ? <ul className="divide-y divide-[var(--line-soft)]">{consultation.reports.map((report) => <li key={report.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><Link href={`${prefix}/reports?report=${encodeURIComponent(report.id)}`} className="clinical-figure text-xs font-semibold text-[var(--accent-dark)] hover:underline" dir="ltr">{report.number ?? t("consultations.common.draftNumber")}</Link><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{report.title} · {t(reportCategoryKeys[report.category])}</p></div><ReportStatusBadge status={report.status} t={t} /></li>)}</ul> : <p className="text-xs text-[var(--text-secondary)]">{t("consultations.detail.noReport")}</p>}</Section>
            <div className="grid gap-5 sm:grid-cols-3"><Section icon={FileText} title={t("consultations.detail.documents")}><p className="text-xs text-[var(--text-secondary)]">{context.data?.recentDocuments.length ?? 0}</p></Section><Section icon={Brain} title={t("consultations.detail.aiAnalyses")}><p className="text-xs text-[var(--text-secondary)]">{context.data?.recentAiAnalyses.length ?? 0}</p></Section><Section icon={Images} title={t("consultations.detail.dicom")}><p className="text-xs text-[var(--text-secondary)]">{context.data?.recentDicomStudies.length ?? 0}</p></Section></div>
            {consultation.appointment ? <Section icon={CalendarCheck} title={t("consultations.detail.appointment")}><p className="text-xs font-semibold">{dateTime.format(new Date(consultation.appointment.scheduledAt))}</p></Section> : null}
            {consultation.status === "COMPLETED" ? <Section icon={Plus} title={t("consultations.detail.addenda")}><div className="space-y-3">{consultation.addenda.map((item) => <article key={item.id} className="border-s-2 border-[var(--accent-line)] ps-3 text-xs"><p className="whitespace-pre-line leading-5">{item.content}</p><p className="mt-1 text-[0.64rem] text-[var(--text-muted)]">{item.author.fullName} · {dateTime.format(new Date(item.createdAt))}</p></article>)}</div>{canAddAddendum ? <div className="mt-4"><textarea className="min-h-24 w-full rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-xs" value={addendum} onChange={(event) => setAddendum(event.target.value)} placeholder={t("consultations.detail.addendumPlaceholder")} /><button type="button" className="clinical-button mt-2" disabled={!addendum.trim() || mutations.addendum.isPending} onClick={() => void submitAddendum()}>{t("consultations.detail.addAddendum")}</button></div> : null}</Section> : null}
          </> : null}
        </div>
        {consultation ? <footer className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-3 sm:px-6">{canEdit && ["DRAFT", "IN_PROGRESS"].includes(consultation.status) ? <button type="button" className="clinical-button" onClick={() => onEdit(consultation)}><FileEdit size={15} aria-hidden="true" />{t("consultations.actions.edit")}</button> : null}{canWriteReport ? <button type="button" className="clinical-button" onClick={() => onWriteReport(consultation)}><FilePenLine size={15} aria-hidden="true" />{t("consultations.actions.writeReport")}</button> : null}{canPrescribe ? <button type="button" className="clinical-button clinical-button-primary" onClick={() => onPrescribe(consultation)}><Pill size={15} aria-hidden="true" />{t("consultations.actions.prescribe")}</button> : null}</footer> : null}
      </aside>
    </div>
  );
}
