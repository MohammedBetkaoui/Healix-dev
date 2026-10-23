import { ChevronDown, FileSearch, Printer, RefreshCw, XCircle } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { prescriptionTypeTranslationKeys } from "../prescriptions.copy";
import { type PrescriptionCapabilities, type PrescriptionListItem } from "../types/prescription.types";
import { formatDoctorName, formatPrescriptionDate, getPatientDisplayName } from "../utils/prescription-format";
import { getDisplayStatus, isCancelable, isRenewable } from "../utils/prescription-status";
import { PrescriptionStatusBadge } from "./PrescriptionStatusBadge";

type PrescriptionsTableProps = {
  capabilities: PrescriptionCapabilities;
  locale: Locale;
  onCancel: (prescription: PrescriptionListItem) => void;
  onOpen: (prescription: PrescriptionListItem) => void;
  onPrint: (prescription: PrescriptionListItem) => void;
  onRenew: (prescription: PrescriptionListItem) => void;
  prescriptions: PrescriptionListItem[];
  t: TranslationFunction;
};

const columns = ["number", "patient", "date", "prescriber", "medications", "type", "status", "actions"] as const;

function TypeBadge({ prescription, t }: { prescription: PrescriptionListItem; t: TranslationFunction }) {
  const regulated = prescription.type !== "STANDARD";
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[.66rem] font-medium", regulated ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]")}>{t(prescriptionTypeTranslationKeys[prescription.type])}</span>;
}

function PrescriptionActions(props: PrescriptionsTableProps & { prescription: PrescriptionListItem }) {
  const { capabilities, onCancel, onOpen, onPrint, onRenew, prescription, t } = props;
  const canPrint = capabilities.canPrintPrescription && prescription.documentAvailable;
  const canRenew = capabilities.canCreatePrescription && isRenewable(prescription);
  const canCancel = capabilities.canCancelPrescription && isCancelable(prescription);
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="clinical-button min-h-9 cursor-pointer list-none px-2.5" aria-label={t("prescriptions.actions.menu")}>
        {t("prescriptions.actions.open")}
        <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
      </summary>
      <div className="absolute end-0 z-20 mt-1 w-64 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 text-start shadow-[var(--shadow-raised)]">
        <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onOpen(prescription)}><FileSearch size={15} aria-hidden="true" />{t("prescriptions.actions.open")}</button>
        {canPrint ? <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onPrint(prescription)}><Printer size={15} aria-hidden="true" />{t("prescriptions.actions.print")}</button> : null}
        {canRenew ? <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onRenew(prescription)}><RefreshCw size={15} aria-hidden="true" />{t("prescriptions.actions.renew")}</button> : null}
        {canCancel ? <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]" onClick={() => onCancel(prescription)}><XCircle size={15} aria-hidden="true" />{t("prescriptions.actions.cancel")}</button> : null}
      </div>
    </details>
  );
}

function MedicationSummary({ prescription }: { prescription: PrescriptionListItem }) {
  const shown = prescription.medications.slice(0, 2);
  const more = prescription.itemCount - shown.length;
  return (
    <div className="max-w-48">
      {shown.map((item, index) => <p key={`${item.dci}-${index}`} className="truncate font-medium text-[var(--text-primary)]">{item.dci} {item.brandName ? <span className="font-normal text-[var(--text-secondary)]">{item.brandName}</span> : null}</p>)}
      {more > 0 ? <span className="text-[.68rem] font-semibold text-[var(--accent-dark)]">+{more}</span> : null}
    </div>
  );
}

export function PrescriptionsTable(props: PrescriptionsTableProps) {
  if (props.prescriptions.length === 0) {
    return <section className="surface-section flex flex-col items-center px-6 py-14 text-center"><FileSearch className="text-[var(--medical)]" size={28} strokeWidth={1.6} aria-hidden="true" /><h2 className="mt-3 text-sm font-semibold">{props.t("prescriptions.empty.title")}</h2><p className="clinical-caption mt-1">{props.t("prescriptions.empty.description")}</p></section>;
  }

  return (
    <section className="surface-section overflow-visible">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-start text-[.76rem]">
          <thead><tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
            {columns.map((column) => <th key={column} className={cn("px-3 py-3 font-semibold", column === "date" && "hidden lg:table-cell", column === "prescriber" && "hidden xl:table-cell", column === "actions" && "text-end")}>{props.t(`prescriptions.columns.${column}`)}</th>)}
          </tr></thead>
          <tbody>
            {props.prescriptions.map((prescription) => (
              <tr key={prescription.id} className="cursor-pointer border-b border-[var(--line-soft)] align-middle last:border-0 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]" tabIndex={0} onClick={() => props.onOpen(prescription)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onOpen(prescription); } }}>
                <td className="clinical-figure whitespace-nowrap px-3 py-3.5 font-semibold text-[var(--accent-dark)]" dir="ltr">{prescription.number ?? props.t("prescriptions.common.draftNumber")}</td>
                <td className="px-3 py-3.5"><p className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{getPatientDisplayName(prescription.patient, props.locale)}</p>{prescription.patient.hospitalRecordNumber ? <p className="mt-0.5 whitespace-nowrap text-[.66rem] text-[var(--text-secondary)]" dir="ltr">{prescription.patient.hospitalRecordNumber}</p> : null}</td>
                <td className="hidden whitespace-nowrap px-3 py-3.5 text-[var(--text-secondary)] lg:table-cell">{formatPrescriptionDate(prescription.prescribedAt, props.locale)}</td>
                <td className="hidden px-3 py-3.5 xl:table-cell"><p className="whitespace-nowrap font-medium">{formatDoctorName(prescription.prescriber.fullName)}</p></td>
                <td className="px-3 py-3.5"><MedicationSummary prescription={prescription} /></td>
                <td className="px-3 py-3.5"><TypeBadge prescription={prescription} t={props.t} /></td>
                <td className="px-3 py-3.5"><PrescriptionStatusBadge status={getDisplayStatus(prescription)} t={props.t} /></td>
                <td className="px-3 py-3.5 text-end"><PrescriptionActions {...props} prescription={prescription} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--line-soft)] md:hidden">
        {props.prescriptions.map((prescription) => (
          <article key={prescription.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="clinical-figure text-[.72rem] font-semibold text-[var(--accent-dark)]" dir="ltr">{prescription.number ?? props.t("prescriptions.common.draftNumber")}</p><h2 className="mt-1 text-sm font-semibold">{getPatientDisplayName(prescription.patient, props.locale)}</h2><p className="mt-0.5 text-[.68rem] text-[var(--text-secondary)]">{formatPrescriptionDate(prescription.prescribedAt, props.locale)}</p></div>
              <PrescriptionStatusBadge status={getDisplayStatus(prescription)} t={props.t} />
            </div>
            <div className="mt-3"><MedicationSummary prescription={prescription} /></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><TypeBadge prescription={prescription} t={props.t} /><PrescriptionActions {...props} prescription={prescription} /></div>
          </article>
        ))}
      </div>
    </section>
  );
}
