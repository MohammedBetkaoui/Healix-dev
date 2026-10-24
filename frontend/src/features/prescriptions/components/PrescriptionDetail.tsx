import { ClipboardList, FileCheck2, FileText, Pencil, Printer, RefreshCw, ShieldAlert, Stethoscope, Trash2, UserRound, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { type TranslationFunction } from "@/lib/i18n";

import {
  useCancelPrescription,
  useDeletePrescriptionDraft,
  useSubmitPrescription,
  useValidatePrescription,
} from "../hooks/use-prescription-mutations";
import { usePrescription, usePrescriptionHistory } from "../hooks/use-prescription";
import { prescriptionTypeTranslationKeys } from "../prescriptions.copy";
import { type Prescription, type PrescriptionCapabilities } from "../types/prescription.types";
import { getPrescriptionErrorKey } from "../utils/prescription-errors";
import { formatDoctorName, formatPrescriptionDate, getPatientAge, getPatientDisplayName, getPrescriptionDuration } from "../utils/prescription-format";
import { getDisplayStatus, isCancelable, isDraft, isRenewable, isValidatable } from "../utils/prescription-status";
import { ClinicalSafetyPanel } from "./ClinicalSafetyPanel";
import { InsuranceContext } from "./InsuranceContext";
import { PrescriptionPdfViewer } from "./PrescriptionPdfViewer";
import { PrescriptionActionError, PrescriptionErrorState } from "./PrescriptionStateViews";
import { PrescriptionStatusBadge } from "./PrescriptionStatusBadge";
import { PrescriptionTimeline } from "./PrescriptionTimeline";

type PrescriptionDetailProps = {
  capabilities: PrescriptionCapabilities;
  id: string;
  initialAction?: "cancel" | "preview";
  locale: Locale;
  onClose: () => void;
  /** Continue a draft in the builder. */
  onEdit: (prescription: Prescription) => void;
  onNotice: (message: string) => void;
  onRenew: (id: string) => void;
  t: TranslationFunction;
};

export function PrescriptionDetail({ capabilities, id, initialAction, locale, onClose, onEdit, onNotice, onRenew, t }: PrescriptionDetailProps) {
  const write = useReadOnlyAction(t);
  const query = usePrescription(id);
  const history = usePrescriptionHistory(id);
  const cancel = useCancelPrescription();
  const remove = useDeletePrescriptionDraft();
  const submit = useSubmitPrescription();
  const validate = useValidatePrescription();
  const [cancelOpen, setCancelOpen] = useState(initialAction === "cancel");
  const [previewOpen, setPreviewOpen] = useState(initialAction === "preview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const prescription = query.data;

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !previewOpen) onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, previewOpen]);

  const fail = (error: unknown) => setActionError(getPrescriptionErrorKey(error));
  const confirmCancel = () => {
    setActionError(null);
    cancel.mutate({ id, reason: reason.trim() }, {
      onError: fail,
      onSuccess: () => { onNotice(t("prescriptions.notices.canceled")); onClose(); },
    });
  };
  const deleteDraft = () => {
    setActionError(null);
    remove.mutate(id, {
      onError: fail,
      onSuccess: () => { onNotice(t("prescriptions.notices.draftDeleted")); onClose(); },
    });
  };
  const validateNow = async () => {
    setActionError(null);
    try {
      if (prescription?.status === "DRAFT") await submit.mutateAsync(id);
      const validated = await validate.mutateAsync(id);
      const at = new Date(validated.validatedAt ?? Date.now());
      const tag = locale === "ar" ? "ar-DZ" : "fr-DZ";
      onNotice(t("prescriptions.notices.validated", {
        date: new Intl.DateTimeFormat(tag).format(at),
        doctor: formatDoctorName(validated.prescriber.fullName),
        time: new Intl.DateTimeFormat(tag, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).format(at),
      }));
    } catch (error) {
      fail(error);
    }
  };

  const busy = cancel.isPending || remove.isPending || submit.isPending || validate.isPending;
  const missing = t("prescriptions.common.notProvided");
  const status = prescription ? getDisplayStatus(prescription) : undefined;
  const canCancel = Boolean(prescription) && capabilities.canCancelPrescription && isCancelable(prescription as Prescription);
  const canRenew = Boolean(prescription) && capabilities.canCreatePrescription && isRenewable(prescription as Prescription);
  const canPrint = Boolean(prescription?.documentAvailable) && capabilities.canPrintPrescription;
  const canEditDraft = Boolean(prescription) && capabilities.canEditPrescription && isDraft(prescription as Prescription);
  const canValidate = Boolean(prescription) && capabilities.canSignPrescription && isValidatable(prescription as Prescription);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <aside className="absolute inset-y-0 end-0 flex w-full max-w-[920px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="prescription-detail-title">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
            <div><p className="text-[.68rem] font-medium text-[var(--medical)]">{t("prescriptions.detail.title")}</p><h2 id="prescription-detail-title" className="clinical-figure mt-1 text-lg font-semibold" dir="ltr">{prescription ? (prescription.number ?? t("prescriptions.common.draftNumber")) : "…"}</h2>{prescription && status ? <div className="mt-2 flex flex-wrap gap-2"><PrescriptionStatusBadge status={status} t={t} /><span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[.68rem] font-medium">{t(prescriptionTypeTranslationKeys[prescription.type])}</span></div> : null}</div>
            <div className="flex items-center gap-1"><button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("prescriptions.actions.close")}><X size={19} aria-hidden="true" /></button></div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
            {query.isLoading ? <div className="space-y-4" role="status" aria-busy="true" aria-label={t("prescriptions.states.loading")}>{[0, 1, 2].map((row) => <span key={row} className="block h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-muted)]" aria-hidden="true" />)}</div> : null}
            {query.isError ? <PrescriptionErrorState errorKey={getPrescriptionErrorKey(query.error)} onRetry={() => void query.refetch()} t={t} /> : null}
            {prescription ? (
              <>
                {prescription.basedOnPrescriptionNumber ? <p className="mb-4 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2 text-[.72rem] text-[var(--accent-dark)]">{t("prescriptions.common.basedOn")} <bdi dir="ltr" className="font-semibold">{prescription.basedOnPrescriptionNumber}</bdi></p> : null}
                {prescription.type !== "STANDARD" ? <section className="mb-5 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-[var(--warning-ink)]"><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert size={17} aria-hidden="true" />{t("prescriptions.regulated.title")}</h3><p className="mt-1 text-[.72rem] leading-5">{prescription.type === "NARCOTIC" ? t("prescriptions.regulated.narcotic") : t("prescriptions.regulated.psychotropic")}</p><p className="mt-2 text-[.68rem] font-semibold">{t("prescriptions.regulated.support")}</p><p className="mt-1 text-[.66rem]">{t("prescriptions.regulated.notOfficialBook")}</p>{prescription.regulatoryDetails?.carnetReference ? <p className="mt-2 text-[.68rem]">{t("prescriptions.regulated.carnetReference")} : <bdi dir="ltr">{prescription.regulatoryDetails.carnetReference}</bdi></p> : null}</section> : null}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.8fr)]">
                  <div className="space-y-5">
                    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.summary")}</h3><dl className="mt-3 grid gap-3 text-[.72rem] sm:grid-cols-3"><div><dt className="text-[var(--text-muted)]">{t("prescriptions.columns.date")}</dt><dd className="mt-1 font-semibold">{formatPrescriptionDate(prescription.prescribedAt, locale)}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.review.medicationCount")}</dt><dd className="mt-1 font-semibold">{prescription.items.length}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.review.overallDuration")}</dt><dd className="mt-1 font-semibold">{getPrescriptionDuration(prescription)} {t("prescriptions.common.days")}</dd></div></dl></section>

                    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.medications")}</h3><ol className="mt-3 divide-y divide-[var(--line-soft)]">{prescription.items.map((item, index) => <li key={item.id} className="grid grid-cols-[1.5rem_1fr] gap-2 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[.62rem] font-semibold text-[var(--medical)]">{index + 1}</span><div><p className="text-[.78rem] font-semibold">{item.medication.dci} <span className="font-normal text-[var(--text-secondary)]">{item.medication.brandName ? `· ${item.medication.brandName}` : ""}</span></p><p className="mt-1 text-[.7rem]">{item.medication.strength} · {t(`prescriptions.forms.${item.medication.pharmaceuticalForm}`)} · {t(`prescriptions.routes.${item.medication.route}`)}</p><p className="mt-1 text-[.7rem] text-[var(--text-secondary)]">{[item.dosePerIntake, item.frequency, item.intakeMoment, item.durationDays ? `${item.durationDays} ${t("prescriptions.common.days")}` : null].filter(Boolean).join(", ")} · {item.quantity}</p>{item.patientInstructions ? <p className="mt-1 text-[.68rem] text-[var(--text-secondary)]">{item.patientInstructions}</p> : null}</div></li>)}</ol></section>

                    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.patient")}</h3><dl className="mt-3 grid gap-3 text-[.72rem] sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">{t("prescriptions.review.patient")}</dt><dd className="mt-1 font-semibold">{getPatientDisplayName(prescription.patient, locale)}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.patient.birthAge")}</dt><dd className="mt-1 font-semibold">{prescription.patient.birthDate ? `${formatPrescriptionDate(prescription.patient.birthDate, locale)} · ${getPatientAge(prescription.patient.birthDate)} ${t("prescriptions.common.years")}` : missing}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.patient.fileNumber")}</dt><dd className="mt-1 font-semibold" dir="ltr">{prescription.patient.hospitalRecordNumber ?? missing}</dd></div>{prescription.encounter ? <div><dt className="text-[var(--text-muted)]">{t("prescriptions.builder.associatedConsultation")}</dt><dd className="mt-1 font-semibold">{formatPrescriptionDate(prescription.encounter.date, locale)} — {prescription.encounter.label}</dd></div> : null}</dl></section>
                    <InsuranceContext maskedInsuredNumber={prescription.insurance?.maskedInsuredNumber ?? null} organization={prescription.insurance?.organization ?? null} priorApproval={[]} reimbursable={[]} t={t} />
                  </div>

                  <div className="space-y-5">
                    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Stethoscope size={16} className="text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.detail.prescriber")}</h3><p className="mt-3 text-[.78rem] font-semibold">{formatDoctorName(prescription.prescriber.fullName)}</p><p className="mt-1 text-[.7rem] text-[var(--text-secondary)]">{prescription.prescriber.speciality ?? missing}</p><dl className="mt-3 space-y-2 text-[.68rem]"><div><dt className="text-[var(--text-muted)]">{t("prescriptions.detail.orderNumber")}</dt><dd className="mt-0.5 font-semibold" dir="ltr">{prescription.prescriber.registrationNumber ?? missing}</dd></div><div><dt className="text-[var(--text-muted)]">{t("prescriptions.detail.regionalCouncil")}</dt><dd className="mt-0.5 font-semibold">{prescription.prescriber.regionalCouncil ?? missing}</dd></div></dl></section>
                    <ClinicalSafetyPanel alerts={prescription.alerts} evaluated t={t} />
                    <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><PrescriptionTimeline events={history.data} isError={history.isError} isLoading={history.isLoading} locale={locale} onRetry={() => void history.refetch()} t={t} /></section>
                    {prescription.status === "CANCELED" ? <section className="rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-[var(--danger-ink)]"><h3 className="text-sm font-semibold">{t("prescriptions.detail.cancellation")}</h3>{prescription.cancellationReason ? <p className="mt-2 text-[.72rem] leading-5">{prescription.cancellationReason}</p> : null}{prescription.canceledAt ? <p className="mt-2 text-[.66rem]">{t("prescriptions.detail.canceledOn", { date: formatPrescriptionDate(prescription.canceledAt, locale, true) })}</p> : null}</section> : null}
                    {cancelOpen && canCancel ? <section className="rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4"><h3 className="text-sm font-semibold text-[var(--danger-ink)]">{t("prescriptions.detail.cancellation")}</h3><label className="mt-3 block"><span className="mb-1.5 block text-[.68rem] text-[var(--text-secondary)]">{t("prescriptions.detail.cancellationReason")}</span><Textarea className="bg-[var(--surface)]" maxLength={1000} placeholder={t("prescriptions.detail.cancellationPlaceholder")} value={reason} onChange={(event) => setReason(event.target.value)} /></label><p className="mt-1 text-[.64rem] text-[var(--text-secondary)]">{t("prescriptions.detail.cancellationMinimum")}</p><button type="button" className="clinical-button mt-3 border-[var(--danger-line)] text-[var(--danger-ink)]" disabled={reason.trim().length < 5 || busy} onClick={confirmCancel}><XCircle size={15} aria-hidden="true" />{t("prescriptions.actions.confirmCancel")}</button></section> : null}
                    {actionError ? <PrescriptionActionError errorKey={actionError} t={t} /> : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {prescription ? (
            <footer className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-3 sm:px-6">
              {canEditDraft ? <button type="button" className="clinical-button text-[var(--danger-ink)]" disabled={busy} onClick={() => confirmDelete ? deleteDraft() : setConfirmDelete(true)}><Trash2 size={15} aria-hidden="true" />{confirmDelete ? t("prescriptions.actions.confirmDeleteDraft") : t("prescriptions.actions.deleteDraft")}</button> : null}
              {canCancel ? <button type="button" className="clinical-button text-[var(--danger-ink)]" onClick={() => setCancelOpen((value) => !value)}><XCircle size={15} aria-hidden="true" />{t("prescriptions.actions.cancel")}</button> : null}
              {canRenew ? <button type="button" className="clinical-button" disabled={write.disabled} title={write.title} onClick={() => onRenew(prescription.id)}><RefreshCw size={15} aria-hidden="true" />{t("prescriptions.actions.renew")}</button> : null}
              {canPrint ? <button type="button" className="clinical-button clinical-button-primary" onClick={() => setPreviewOpen(true)}><Printer size={15} aria-hidden="true" />{t("prescriptions.actions.print")}</button> : null}
              {canEditDraft ? <button type="button" className="clinical-button clinical-button-primary" disabled={busy} onClick={() => onEdit(prescription)}><Pencil size={15} aria-hidden="true" />{t("prescriptions.actions.edit")}</button> : null}
              {canValidate && !canEditDraft ? <button type="button" className="clinical-button clinical-button-primary" disabled={busy || write.disabled} title={write.title} onClick={() => void validateNow()}><FileCheck2 size={15} aria-hidden="true" />{t("prescriptions.actions.validate")}</button> : null}
            </footer>
          ) : null}
        </aside>
      </div>
      {previewOpen && prescription ? <PrescriptionPdfViewer id={prescription.id} number={prescription.number} onClose={() => setPreviewOpen(false)} onError={setActionError} onNotice={onNotice} t={t} /> : null}
    </>
  );
}
