"use client";

import { CalendarCheck, FilePenLine, FileText, FolderOpen, Pill, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { PrescriptionStatusBadge } from "@/features/prescriptions/components/PrescriptionStatusBadge";
import { prescriptionTypeTranslationKeys } from "@/features/prescriptions/prescriptions.copy";
import { formatDoctorName, getPatientAge, getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { ReportStatusBadge } from "@/features/reports/components/ReportStatusBadge";
import { reportCategoryKeys } from "@/features/reports/reports.copy";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { useConsultation } from "../hooks/use-consultation";
import { type ConsultationDetail } from "../types/consultation.types";
import { getConsultationErrorKey } from "../utils/consultation-utils";
import { ConsultationBlockSkeleton, ConsultationErrorState } from "./ConsultationStateViews";

type ConsultationDetailDrawerProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  /** Rights to act from the consultation: each action is hidden without its right. */
  canPrescribe: boolean;
  canWriteReport: boolean;
  /** False while a drawer opened from this one is on top: Escape closes that one only. */
  closeOnEscape?: boolean;
  id: string;
  locale: Locale;
  onClose: () => void;
  onPrescribe: (consultation: ConsultationDetail) => void;
  onWriteReport: (consultation: ConsultationDetail) => void;
  t: TranslationFunction;
};

const base = (accountType: ConsultationDetailDrawerProps["accountType"]) => (accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor");

function Section({ children, icon: Icon, title }: { children: React.ReactNode; icon: typeof Pill; title: string }) {
  return <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} className="text-[var(--medical)]" aria-hidden="true" />{title}</h3><div className="mt-3">{children}</div></section>;
}

export function ConsultationDetailDrawer({ accountType, canPrescribe, canWriteReport, closeOnEscape = true, id, locale, onClose, onPrescribe, onWriteReport, t }: ConsultationDetailDrawerProps) {
  const query = useConsultation(id);
  const consultation = query.data;
  const tag = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const dateTime = new Intl.DateTimeFormat(tag, { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "long", year: "numeric" });
  const day = new Intl.DateTimeFormat(tag, { day: "2-digit", month: "short", year: "numeric" });
  const prefix = base(accountType);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && closeOnEscape) onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [closeOnEscape, onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-[860px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="consultation-detail-title">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold text-[var(--medical)]">{t("consultations.detail.title")}</p>
            <h2 id="consultation-detail-title" className="mt-1 truncate text-lg font-semibold">{consultation ? getPatientDisplayName(consultation.patient, locale) : "…"}</h2>
            {consultation ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{dateTime.format(new Date(consultation.date))}{consultation.doctor ? ` · ${formatDoctorName(consultation.doctor.fullName)}` : ""}</p> : null}
          </div>
          <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("consultations.actions.close")}><X size={19} aria-hidden="true" /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {query.isLoading ? <ConsultationBlockSkeleton t={t} /> : null}
          {query.isError ? <ConsultationErrorState errorKey={getConsultationErrorKey(query.error)} onRetry={() => void query.refetch()} t={t} /> : null}
          {consultation ? (
            <>
              <Section icon={Stethoscope} title={t("consultations.detail.clinical")}>
                <dl className="space-y-4 text-xs">
                  <div><dt className="text-[var(--text-muted)]">{t("consultations.detail.reason")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{consultation.reason}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">{t("consultations.detail.diagnosis")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{consultation.diagnosis}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">{t("consultations.detail.treatment")}</dt><dd className="mt-1 whitespace-pre-line leading-6">{consultation.treatment}</dd></div>
                </dl>
                <p className="mt-4 border-t border-[var(--line-soft)] pt-3 text-[0.66rem] text-[var(--text-muted)]">{t("consultations.detail.recordNotice")}</p>
              </Section>

              <Section icon={FolderOpen} title={t("consultations.detail.patient")}>
                <dl className="grid gap-3 text-xs sm:grid-cols-3">
                  <div><dt className="text-[var(--text-muted)]">{t("consultations.detail.patientName")}</dt><dd className="mt-1 font-semibold">{getPatientDisplayName(consultation.patient, locale)}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">{t("consultations.detail.age")}</dt><dd className="mt-1 font-semibold">{getPatientAge(consultation.patient.birthDate)} {t("consultations.detail.years")}</dd></div>
                  <div><dt className="text-[var(--text-muted)]">{t("consultations.detail.fileNumber")}</dt><dd className="mt-1 font-semibold" dir="ltr">{consultation.patient.hospitalRecordNumber ?? t("consultations.common.notProvided")}</dd></div>
                </dl>
                <Link href={`${prefix}/patients/${encodeURIComponent(consultation.patient.id)}`} className="clinical-link mt-3 inline-flex text-xs font-semibold">{t("consultations.detail.openPatient")}</Link>
              </Section>

              <Section icon={CalendarCheck} title={t("consultations.detail.appointment")}>
                {consultation.appointment ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div><p className="font-semibold">{dateTime.format(new Date(consultation.appointment.scheduledAt))}</p><p className="mt-1 text-[var(--text-secondary)]">{consultation.appointment.reason} · {consultation.appointment.durationMinutes} {t("consultations.detail.minutes")}</p></div>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[0.66rem] font-semibold">{t(`consultations.appointmentStatuses.${consultation.appointment.status}`)}</span>
                    <Link href={`${prefix}/appointments`} className="clinical-link font-semibold">{t("consultations.detail.openAgenda")}</Link>
                  </div>
                ) : <p className="text-xs text-[var(--text-secondary)]">{t("consultations.detail.noAppointment")}</p>}
              </Section>

              <Section icon={Pill} title={t("consultations.detail.prescriptions")}>
                {consultation.prescriptions.length ? (
                  <ul className="divide-y divide-[var(--line-soft)]">
                    {consultation.prescriptions.map((prescription) => (
                      <li key={prescription.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div><Link href={`${prefix}/prescriptions?prescription=${encodeURIComponent(prescription.id)}`} className="clinical-figure text-xs font-semibold text-[var(--accent-dark)] hover:underline" dir="ltr">{prescription.number ?? t("consultations.common.draftNumber")}</Link><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{day.format(new Date(prescription.prescribedAt))} · {t(prescriptionTypeTranslationKeys[prescription.type])} · {t("consultations.detail.medications", { count: prescription.itemCount })}</p></div>
                        <PrescriptionStatusBadge status={prescription.effectiveStatus} t={t} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-[var(--text-secondary)]">{t("consultations.detail.noPrescription")}</p>}
              </Section>

              <Section icon={FileText} title={t("consultations.detail.reports")}>
                {consultation.reports.length ? (
                  <ul className="divide-y divide-[var(--line-soft)]">
                    {consultation.reports.map((report) => (
                      <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div><Link href={`${prefix}/reports?report=${encodeURIComponent(report.id)}`} className="clinical-figure text-xs font-semibold text-[var(--accent-dark)] hover:underline" dir="ltr">{report.number ?? t("consultations.common.draftNumber")}</Link><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{report.title} · {t(reportCategoryKeys[report.category])} · v{report.version}</p></div>
                        <ReportStatusBadge status={report.status} t={t} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-[var(--text-secondary)]">{t("consultations.detail.noReport")}</p>}
              </Section>
            </>
          ) : null}
        </div>

        {consultation && (canPrescribe || canWriteReport) ? (
          <footer className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-3 sm:px-6">
            {canWriteReport ? <button type="button" className="clinical-button" onClick={() => onWriteReport(consultation)}><FilePenLine size={15} aria-hidden="true" />{t("consultations.actions.writeReport")}</button> : null}
            {canPrescribe ? <button type="button" className="clinical-button clinical-button-primary" onClick={() => onPrescribe(consultation)}><Pill size={15} aria-hidden="true" />{t("consultations.actions.prescribe")}</button> : null}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
