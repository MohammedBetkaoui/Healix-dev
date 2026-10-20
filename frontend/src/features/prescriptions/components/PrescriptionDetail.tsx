import { ClipboardList, FileText, Printer, RefreshCw, ShieldAlert, Stethoscope, UserRound, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localize, prescriptionTypeTranslationKeys } from "../prescriptions.copy";
import { type Prescription, type PrescriptionCapabilities } from "../types/prescription.types";
import { formatPrescriptionDate, getPatientAge, getPatientDisplayName, getPrescriptionDuration } from "../utils/prescription-format";
import { ClinicalSafetyPanel } from "./ClinicalSafetyPanel";
import { InsuranceContext } from "./InsuranceContext";
import { PrescriptionPreview } from "./PrescriptionPreview";
import { PrescriptionStatusBadge } from "./PrescriptionStatusBadge";
import { PrescriptionTimeline } from "./PrescriptionTimeline";

type PrescriptionDetailProps = {
  capabilities: PrescriptionCapabilities;
  initialAction?: "cancel" | "preview";
  locale: Locale;
  onCancel: (reason: string) => void;
  onClose: () => void;
  onPrint: () => void;
  onRenew: () => void;
  prescription: Prescription;
  t: TranslationFunction;
};

export function PrescriptionDetail({ capabilities, initialAction, locale, onCancel, onClose, onPrint, onRenew, prescription, t }: PrescriptionDetailProps) {
  const [cancelOpen, setCancelOpen] = useState(initialAction === "cancel");
  const [previewOpen, setPreviewOpen] = useState(initialAction === "preview");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const canCancel = capabilities.canCancelPrescription && !["CANCELED", "EXPIRED"].includes(prescription.status);
  const canRenew = capabilities.canCreatePrescription && !["DRAFT", "CANCELED"].includes(prescription.status);
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <aside className="absolute inset-y-0 end-0 flex w-full max-w-[920px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="prescription-detail-title">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
            <div><p className="text-[.68rem] font-medium text-[var(--medical)]">{t("prescriptions.detail.title")}</p><h2 id="prescription-detail-title" className="clinical-figure mt-1 text-lg font-semibold" dir="ltr">{prescription.number}</h2><div className="mt-2 flex flex-wrap gap-2"><PrescriptionStatusBadge status={prescription.status} t={t} /><span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[.68rem] font-medium">{t(prescriptionTypeTranslationKeys[prescription.type])}</span></div></div>
            <div className="flex items-center gap-1"><button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("prescriptions.actions.close")}><X size={19} aria-hidden="true" /></button></div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
            {prescription.basedOnPrescriptionNumber ? <p className="mb-4 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2 text-[.72rem] text-[var(--accent-dark)]">{t("prescriptions.common.basedOn")} <bdi dir="ltr" className="font-semibold">{prescription.basedOnPrescriptionNumber}</bdi></p> : null}
            {prescription.type !== "STANDARD" ? <section className="mb-5 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-[var(--warning-ink)]"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert size={17} aria-hidden="true" />{t("prescriptions.regulated.title")}</h3><p className="mt-1 text-[.72rem] leading-5">{prescription.type === "NARCOTIC" ? t("prescriptions.regulated.narcotic") : t("prescriptions.regulated.psychotropic")}</p><p className="mt-2 text-[.68rem] font-semibold">{t("prescriptions.regulated.support")}</p><p className="mt-1 text-[.66rem]">{t("prescriptions.regulated.notOfficialBook")}</p>{prescription.regulatoryDetails ? <p className="mt-2 text-[.68rem]">{t("prescriptions.regulated.validity")} : {localize(prescription.regulatoryDetails.validityLabel, locale)}</p> : null}</section> : null}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.8fr)]">
              <div className="space-y-5">
                <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.summary")}</h3><dl className="mt-3 grid gap-3 text-[.72rem] sm:grid-cols-3"><div><dt className="text-[var(--text-muted)]">{t("prescriptions.columns.date")}</dt><dd className="mt-1 font-semibold">{formatPrescriptionDate(prescription.prescribedAt, locale)}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.review.medicationCount")}</dt><dd className="mt-1 font-semibold">{prescription.items.length}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.review.overallDuration")}</dt><dd className="mt-1 font-semibold">{getPrescriptionDuration(prescription)} {t("prescriptions.common.days")}</dd></div></dl></section>

                <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.medications")}</h3><ol className="mt-3 divide-y divide-[var(--line-soft)]">{prescription.items.map((item, index) => <li key={item.id} className="grid grid-cols-[1.5rem_1fr] gap-2 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[.62rem] font-semibold text-[var(--medical)]">{index + 1}</span><div><p className="text-[.78rem] font-semibold">{item.medication.dci} <span className="font-normal text-[var(--text-secondary)]">{item.medication.brandName ? `· ${item.medication.brandName}` : ""}</span></p><p className="mt-1 text-[.7rem]">{item.medication.strength} · {t(`prescriptions.forms.${item.medication.pharmaceuticalForm}`)} · {t(`prescriptions.routes.${item.medication.route}`)}</p><p className="mt-1 text-[.7rem] text-[var(--text-secondary)]">{localize(item.dosePerIntake, locale)}, {localize(item.frequency, locale)}, {localize(item.intakeMoment, locale)}, {item.durationDays} {t("prescriptions.common.days")} · {localize(item.quantity, locale)}</p></div></li>)}</ol></section>

                <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.patient")}</h3><dl className="mt-3 grid gap-3 text-[.72rem] sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">{t("prescriptions.review.patient")}</dt><dd className="mt-1 font-semibold">{getPatientDisplayName(prescription.patient, locale)}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.patient.birthAge")}</dt><dd className="mt-1 font-semibold">{formatPrescriptionDate(prescription.patient.birthDate, locale)} · {getPatientAge(prescription.patient.birthDate)} {t("prescriptions.common.years")}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.patient.fileNumber")}</dt><dd className="mt-1 font-semibold">{prescription.patient.fileNumber}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.patient.phone")}</dt><dd className="mt-1 font-semibold" dir="ltr">{prescription.patient.phone}</dd></div></dl></section>
                <InsuranceContext medications={prescription.items.map((item) => item.medication)} patient={prescription.patient} t={t} />
              </div>

              <div className="space-y-5">
                <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Stethoscope size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.prescriber")}</h3><p className="mt-3 text-[.78rem] font-semibold">Dr. {prescription.prescriber.firstName} {prescription.prescriber.lastName}</p><p className="mt-1 text-[.7rem] text-[var(--text-secondary)]">{localize(prescription.prescriber.specialty, locale)}</p><dl className="mt-3 space-y-2 text-[.68rem]"><div><dt className="text-[var(--text-muted)]">{t("prescriptions.detail.orderNumber")}</dt><dd className="mt-0.5 font-semibold" dir="ltr">{prescription.prescriber.registrationNumber}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.detail.regionalCouncil")}</dt><dd className="mt-0.5 font-semibold">{localize(prescription.prescriber.regionalCouncil, locale)}</dd></div></dl></section>
                <ClinicalSafetyPanel alerts={prescription.alerts} locale={locale} t={t} />
                <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><PrescriptionTimeline events={prescription.auditTrail} locale={locale} t={t} /></section>
                {prescription.status === "CANCELED" && prescription.cancellationReason ? <section className="rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-[var(--danger-ink)]"><h3 className="text-sm font-semibold">{t("prescriptions.detail.cancellation")}</h3><p className="mt-2 text-[.72rem] leading-5">{prescription.cancellationReason}</p>{prescription.canceledBy && prescription.canceledAt ? <p className="mt-2 text-[.66rem]">{t("prescriptions.detail.canceledBy", { actor: prescription.canceledBy, date: formatPrescriptionDate(prescription.canceledAt, locale, true) })}</p> : null}</section> : null}
                {cancelOpen && canCancel ? <section className="rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4"><h3 className="text-sm font-semibold text-[var(--danger-ink)]">{t("prescriptions.detail.cancellation")}</h3><label className="mt-3 block"><span className="mb-1.5 block text-[.68rem] text-[var(--text-secondary)]">{t("prescriptions.detail.cancellationReason")}</span><Textarea className="bg-[var(--surface)]" placeholder={t("prescriptions.detail.cancellationPlaceholder")} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="clinical-button mt-3 border-[var(--danger-line)] text-[var(--danger-ink)]" disabled={!reason.trim()} onClick={() => onCancel(reason.trim())}><XCircle size={15} aria-hidden="true" />{t("prescriptions.actions.confirmCancel")}</button></section> : null}
              </div>
            </div>
          </div>

          <footer className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-3 sm:px-6">
            {canCancel ? <button type="button" className="clinical-button text-[var(--danger-ink)]" onClick={() => setCancelOpen((value) => !value)}><XCircle size={15} aria-hidden="true" />{t("prescriptions.actions.cancel")}</button> : null}
            {canRenew ? <button type="button" className="clinical-button" onClick={onRenew}><RefreshCw size={15} aria-hidden="true" />{t("prescriptions.actions.renew")}</button> : null}
            {capabilities.canPrintPrescription ? <button type="button" className="clinical-button clinical-button-primary" onClick={() => setPreviewOpen(true)}><Printer size={15} aria-hidden="true" />{t("prescriptions.actions.print")}</button> : null}
          </footer>
        </aside>
      </div>
      {previewOpen ? <PrescriptionPreview locale={locale} onClose={() => setPreviewOpen(false)} onPrint={onPrint} prescription={prescription} t={t} /> : null}
    </>
  );
}

