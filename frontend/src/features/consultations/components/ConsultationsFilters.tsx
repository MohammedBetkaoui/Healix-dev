import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ConsultationDoctor, type ConsultationPatient, type ConsultationStatus } from "../types/consultation.types";
import { type ConsultationFilterValue } from "../utils/consultation-utils";

type ConsultationsFiltersProps = {
  filters: ConsultationFilterValue;
  doctors: ConsultationDoctor[];
  locale: Locale;
  onChange: (filters: ConsultationFilterValue) => void;
  onReset: () => void;
  patients: ConsultationPatient[];
  resultCount: number;
  t: TranslationFunction;
};

const statuses: ConsultationStatus[] = ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELED"];

export function ConsultationsFilters({ doctors, filters, locale, onChange, onReset, patients, resultCount, t }: ConsultationsFiltersProps) {
  const id = useId();
  const update = <Key extends keyof ConsultationFilterValue>(key: Key, value: ConsultationFilterValue[Key]) => onChange({ ...filters, [key]: value });
  const active = Object.values(filters).some(Boolean);

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1" htmlFor={`${id}-search`}>
          <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.searchLabel")}</span>
          <span className="relative block">
            <Search size={16} strokeWidth={1.8} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <Input id={`${id}-search`} className="border-[var(--border)] bg-[var(--surface)] ps-10 shadow-none" placeholder={t("consultations.filters.searchPlaceholder")} value={filters.query} onChange={(event) => update("query", event.target.value)} />
          </span>
        </label>
        <div className="flex items-center justify-between gap-3 lg:pb-0.5">
          <span aria-live="polite" className="clinical-figure whitespace-nowrap text-xs font-semibold text-[var(--text-secondary)]">{t("consultations.filters.count", { count: resultCount })}</span>
          <button type="button" className="clinical-button min-h-10" disabled={!active} onClick={onReset}>
            <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
            {t("consultations.filters.reset")}
          </button>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
        <div className="mb-3 flex items-center gap-2 text-[0.7rem] font-semibold text-[var(--text-secondary)]"><SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" />{t("consultations.filters.label")}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label htmlFor={`${id}-patient`}>
            <span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.patient")}</span>
            <Select id={`${id}-patient`} className="border-[var(--border)] text-xs shadow-none" value={filters.patient} onChange={(event) => update("patient", event.target.value)}>
              <option value="">{t("consultations.filters.all")}</option>
              {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientDisplayName(patient, locale)}</option>)}
            </Select>
          </label>
          <label htmlFor={`${id}-doctor`}>
            <span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.doctor")}</span>
            <Select id={`${id}-doctor`} className="border-[var(--border)] text-xs shadow-none" value={filters.doctor} onChange={(event) => update("doctor", event.target.value)}>
              <option value="">{t("consultations.filters.all")}</option>
              {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName}</option>)}
            </Select>
          </label>
          <label htmlFor={`${id}-status`}>
            <span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.status")}</span>
            <Select id={`${id}-status`} className="border-[var(--border)] text-xs shadow-none" value={filters.status} onChange={(event) => update("status", event.target.value as ConsultationFilterValue["status"])}>
              <option value="">{t("consultations.filters.all")}</option>
              {statuses.map((status) => <option key={status} value={status}>{t(`consultations.statuses.${status}`)}</option>)}
            </Select>
          </label>
          <label htmlFor={`${id}-prescription`}>
            <span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.prescription")}</span>
            <Select id={`${id}-prescription`} className="border-[var(--border)] text-xs shadow-none" value={filters.prescription} onChange={(event) => update("prescription", event.target.value as ConsultationFilterValue["prescription"])}>
              <option value="">{t("consultations.filters.all")}</option>
              <option value="with">{t("consultations.filters.withPrescription")}</option>
              <option value="without">{t("consultations.filters.withoutPrescription")}</option>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={`${id}-from`}><span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.from")}</span><Input id={`${id}-from`} type="date" className="border-[var(--border)] px-2 text-xs shadow-none" value={filters.from} max={filters.to || undefined} onChange={(event) => update("from", event.target.value)} /></label>
            <label htmlFor={`${id}-to`}><span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("consultations.filters.to")}</span><Input id={`${id}-to`} type="date" className="border-[var(--border)] px-2 text-xs shadow-none" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} /></label>
          </div>
          <label className="flex items-end gap-2 pb-2 text-xs font-medium" htmlFor={`${id}-mine`}>
            <Checkbox id={`${id}-mine`} checked={filters.mine} onChange={(event) => update("mine", event.target.checked)} />
            {t("consultations.filters.mine")}
          </label>
        </div>
      </div>
    </section>
  );
}
