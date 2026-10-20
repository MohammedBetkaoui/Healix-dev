import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { prescriptionStatusTranslationKeys, prescriptionTypeTranslationKeys } from "../prescriptions.copy";
import {
  type Medication,
  type Practitioner,
  type PrescriptionPatient,
  type PrescriptionStatus,
  type PrescriptionType,
} from "../types/prescription.types";
import { getPatientDisplayName } from "../utils/prescription-format";

export type PrescriptionFilterState = {
  medicationId: string;
  patientId: string;
  period: string;
  prescriberId: string;
  query: string;
  status: "" | PrescriptionStatus;
  type: "" | PrescriptionType;
};

type PrescriptionFiltersProps = {
  filters: PrescriptionFilterState;
  locale: Locale;
  medications: Medication[];
  onChange: (filters: PrescriptionFilterState) => void;
  onReset: () => void;
  patients: PrescriptionPatient[];
  practitioners: Practitioner[];
  resultCount: number;
  t: TranslationFunction;
};

const statuses: PrescriptionStatus[] = ["DRAFT", "PENDING_VALIDATION", "VALIDATED", "PRINTED", "CANCELED", "EXPIRED"];
const types: PrescriptionType[] = ["STANDARD", "REGULATED", "PSYCHOTROPIC", "NARCOTIC"];

function FilterFields({ filters, locale, medications, onChange, patients, practitioners, t }: Omit<PrescriptionFiltersProps, "onReset" | "resultCount">) {
  const update = (key: keyof PrescriptionFilterState, value: string) => onChange({ ...filters, [key]: value });

  return (
    <>
      <Select aria-label={t("prescriptions.filters.status")} value={filters.status} onChange={(event) => update("status", event.target.value)}>
        <option value="">{t("prescriptions.filters.allStatuses")}</option>
        {statuses.map((status) => <option key={status} value={status}>{t(prescriptionStatusTranslationKeys[status])}</option>)}
      </Select>
      <Select aria-label={t("prescriptions.filters.prescriber")} value={filters.prescriberId} onChange={(event) => update("prescriberId", event.target.value)}>
        <option value="">{t("prescriptions.filters.allPrescribers")}</option>
        {practitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>Dr. {practitioner.firstName} {practitioner.lastName}</option>)}
      </Select>
      <Select aria-label={t("prescriptions.filters.patient")} value={filters.patientId} onChange={(event) => update("patientId", event.target.value)}>
        <option value="">{t("prescriptions.filters.allPatients")}</option>
        {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientDisplayName(patient, locale)}</option>)}
      </Select>
      <Select aria-label={t("prescriptions.filters.period")} value={filters.period} onChange={(event) => update("period", event.target.value)}>
        <option value="">{t("prescriptions.filters.periods.all")}</option>
        <option value="7">{t("prescriptions.filters.periods.week")}</option>
        <option value="30">{t("prescriptions.filters.periods.month")}</option>
        <option value="90">{t("prescriptions.filters.periods.quarter")}</option>
      </Select>
      <Select aria-label={t("prescriptions.filters.type")} value={filters.type} onChange={(event) => update("type", event.target.value)}>
        <option value="">{t("prescriptions.filters.allTypes")}</option>
        {types.map((type) => <option key={type} value={type}>{t(prescriptionTypeTranslationKeys[type])}</option>)}
      </Select>
      <Select aria-label={t("prescriptions.filters.medication")} value={filters.medicationId} onChange={(event) => update("medicationId", event.target.value)}>
        <option value="">{t("prescriptions.filters.allMedications")}</option>
        {medications.map((medication) => <option key={medication.id} value={medication.id}>{medication.dci}{medication.brandName ? ` — ${medication.brandName}` : ""}</option>)}
      </Select>
    </>
  );
}

export function PrescriptionFilters(props: PrescriptionFiltersProps) {
  return (
    <section className="surface-section p-4" aria-label={props.t("prescriptions.filters.more")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{props.t("prescriptions.filters.searchLabel")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={17} strokeWidth={1.8} aria-hidden="true" />
          <Input className="h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] ps-10 shadow-none" placeholder={props.t("prescriptions.filters.searchPlaceholder")} value={props.filters.query} onChange={(event) => props.onChange({ ...props.filters, query: event.target.value })} />
        </label>
        <span className="shrink-0 text-[.7rem] text-[var(--text-secondary)]">{props.resultCount} {props.t("prescriptions.common.results")}</span>
        <button type="button" className="clinical-button hidden xl:inline-flex" onClick={props.onReset}>
          <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
          {props.t("prescriptions.actions.resetFilters")}
        </button>
      </div>

      <div className="mt-3 hidden grid-cols-3 gap-2 xl:grid">
        <FilterFields {...props} />
      </div>

      <details className="mt-3 xl:hidden">
        <summary className="clinical-button w-full cursor-pointer list-none">
          <SlidersHorizontal size={15} strokeWidth={1.8} aria-hidden="true" />
          {props.t("prescriptions.filters.more")}
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <FilterFields {...props} />
          <button type="button" className="clinical-button sm:col-span-2" onClick={props.onReset}>
            <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
            {props.t("prescriptions.actions.resetFilters")}
          </button>
        </div>
      </details>
    </section>
  );
}

