import { ChevronDown, FileSearch, Printer, RefreshCw, XCircle } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { localize, prescriptionTypeTranslationKeys } from "../prescriptions.copy";
import { type Prescription, type PrescriptionCapabilities } from "../types/prescription.types";
import { formatPrescriptionDate, getPatientAge, getPatientDisplayName, getPrescriptionDuration } from "../utils/prescription-format";
import { PrescriptionStatusBadge } from "./PrescriptionStatusBadge";

type PrescriptionsTableProps = {
  capabilities: PrescriptionCapabilities;
  locale: Locale;
  onCancel: (prescription: Prescription) => void;
  onOpen: (prescription: Prescription) => void;
  onPrint: (prescription: Prescription) => void;
  onRenew: (prescription: Prescription) => void;
  prescriptions: Prescription[];
  t: TranslationFunction;
};

function AlertLabel({ prescription, t }: { prescription: Prescription; t: TranslationFunction }) {
  const count = prescription.alerts.filter((alert) => !alert.resolved).length;
  const hasCritical = prescription.alerts.some((alert) => !alert.resolved && alert.level === "critical");
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[.66rem] font-semibold", count === 0 ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]" : hasCritical ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]" : "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]")}>
      {count === 0 ? t("prescriptions.alerts.none") : count === 1 ? t("prescriptions.alerts.one") : t("prescriptions.alerts.many", { count })}
    </span>
  );
}

function TypeBadge({ prescription, t }: { prescription: Prescription; t: TranslationFunction }) {
  const regulated = prescription.type !== "STANDARD";
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[.66rem] font-medium", regulated ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]")}>{t(prescriptionTypeTranslationKeys[prescription.type])}</span>;
}

function PrescriptionActions(props: PrescriptionsTableProps & { prescription: Prescription }) {
  const { capabilities, onCancel, onOpen, onPrint, onRenew, prescription, t } = props;
  const canRenew = capabilities.canCreatePrescription && prescription.status !== "DRAFT" && prescription.status !== "CANCELED";
  const canCancel = capabilities.canCancelPrescription && !["CANCELED", "EXPIRED"].includes(prescription.status);
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="clinical-button min-h-9 cursor-pointer list-none px-2.5" aria-label={t("prescriptions.actions.menu")}>
        {t("prescriptions.actions.open")}
        <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
      </summary>
      <div className="absolute end-0 z-20 mt-1 w-64 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 text-start shadow-[var(--shadow-raised)]">
        <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onOpen(prescription)}><FileSearch size={15} aria-hidden="true" />{t("prescriptions.actions.open")}</button>
        {capabilities.canPrintPrescription ? <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onPrint(prescription)}><Printer size={15} aria-hidden="true" />{t("prescriptions.actions.print")}</button> : null}
        {canRenew ? <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]" onClick={() => onRenew(prescription)}><RefreshCw size={15} aria-hidden="true" />{t("prescriptions.actions.renew")}</button> : null}
        {canCancel ? <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]" onClick={() => onCancel(prescription)}><XCircle size={15} aria-hidden="true" />{t("prescriptions.actions.cancel")}</button> : null}
      </div>
    </details>
  );
}

function MedicationSummary({ prescription }: { prescription: Prescription }) {
  return (
    <div className="max-w-48">
      {prescription.items.slice(0, 2).map((item) => <p key={item.id} className="truncate font-medium text-[var(--text-primary)]">{item.medication.dci} <span className="font-normal text-[var(--text-secondary)]">{item.medication.strength}</span></p>)}
      {prescription.items.length > 2 ? <span className="text-[.68rem] font-semibold text-[var(--accent-dark)]">+{prescription.items.length - 2}</span> : null}
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
        <table className="w-full min-w-[980px] border-collapse text-start text-[.76rem]">
          <thead><tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
            {(["number", "patient", "date", "prescriber", "medications", "type", "duration", "status", "alerts", "actions"] as const).map((column) => <th key={column} className={cn("px-3 py-3 font-semibold", ["date", "duration"].includes(column) && "hidden lg:table-cell", column === "prescriber" && "hidden xl:table-cell", column === "actions" && "text-end")}>{props.t(`prescriptions.columns.${column}`)}</th>)}
          </tr></thead>
          <tbody>
            {props.prescriptions.map((prescription) => (
              <tr key={prescription.id} className="cursor-pointer border-b border-[var(--line-soft)] align-middle last:border-0 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]" tabIndex={0} onClick={() => props.onOpen(prescription)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onOpen(prescription); } }}>
                <td className="clinical-figure whitespace-nowrap px-3 py-3.5 font-semibold text-[var(--accent-dark)]" dir="ltr">{prescription.number}</td>
                <td className="px-3 py-3.5"><p className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{getPatientDisplayName(prescription.patient, props.locale)}</p><p className="mt-0.5 whitespace-nowrap text-[.66rem] text-[var(--text-secondary)]">{getPatientAge(prescription.patient.birthDate)} {props.t("prescriptions.common.years")}</p></td>
                <td className="hidden whitespace-nowrap px-3 py-3.5 text-[var(--text-secondary)] lg:table-cell">{formatPrescriptionDate(prescription.prescribedAt, props.locale)}</td>
                <td className="hidden px-3 py-3.5 xl:table-cell"><p className="whitespace-nowrap font-medium">Dr. {prescription.prescriber.firstName} {prescription.prescriber.lastName}</p><p className="mt-0.5 whitespace-nowrap text-[.66rem] text-[var(--text-secondary)]">{localize(prescription.prescriber.specialty, props.locale)}</p></td>
                <td className="px-3 py-3.5"><MedicationSummary prescription={prescription} /></td>
                <td className="px-3 py-3.5"><TypeBadge prescription={prescription} t={props.t} /></td>
                <td className="hidden whitespace-nowrap px-3 py-3.5 text-[var(--text-secondary)] lg:table-cell">{getPrescriptionDuration(prescription)} {props.t("prescriptions.common.days")}</td>
                <td className="px-3 py-3.5"><PrescriptionStatusBadge status={prescription.status} t={props.t} /></td>
                <td className="px-3 py-3.5"><AlertLabel prescription={prescription} t={props.t} /></td>
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
              <div><p className="clinical-figure text-[.72rem] font-semibold text-[var(--accent-dark)]" dir="ltr">{prescription.number}</p><h2 className="mt-1 text-sm font-semibold">{getPatientDisplayName(prescription.patient, props.locale)}</h2><p className="mt-0.5 text-[.68rem] text-[var(--text-secondary)]">{formatPrescriptionDate(prescription.prescribedAt, props.locale)} · {getPatientAge(prescription.patient.birthDate)} {props.t("prescriptions.common.years")}</p></div>
              <PrescriptionStatusBadge status={prescription.status} t={props.t} />
            </div>
            <div className="mt-3"><MedicationSummary prescription={prescription} /></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><TypeBadge prescription={prescription} t={props.t} /><AlertLabel prescription={prescription} t={props.t} /></div><PrescriptionActions {...props} prescription={prescription} /></div>
          </article>
        ))}
      </div>
    </section>
  );
}

