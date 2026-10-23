"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { usePatientSearch } from "@/features/prescriptions/hooks/use-patient-context";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { getReportPatientName } from "../utils/report-utils";

export type PatientChoice = { id: string; label: string };

type Candidate = Parameters<typeof getReportPatientName>[0] & { hospitalRecordNumber: string | null };

export const patientChoiceLabel = (patient: Candidate, locale: Locale) =>
  `${getReportPatientName(patient, locale)}${patient.hospitalRecordNumber ? ` · ${patient.hospitalRecordNumber}` : ""}`;

type ReportPatientPickerProps = {
  disabled?: boolean;
  locale: Locale;
  onChange: (patient: PatientChoice) => void;
  t: TranslationFunction;
  value: PatientChoice | null;
};

// Patients of the workspace matching what is typed (GET /patients?search=,
// after a 300 ms pause); choosing a suggestion selects the patient.
export function ReportPatientPicker({ disabled, locale, onChange, t, value }: ReportPatientPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState(value?.label ?? "");
  const search = usePatientSearch(query);
  const candidates = search.data?.data ?? [];
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.create.patient")} *</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} aria-hidden="true" />
        <Input
          className="ps-9"
          disabled={disabled}
          list={listId}
          placeholder={t("reports.create.patientPlaceholder")}
          value={query}
          onBlur={() => setQuery(value?.label ?? "")}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            const match = candidates.find((candidate) => patientChoiceLabel(candidate, locale) === next);
            if (match) onChange({ id: match.id, label: next });
          }}
        />
      </span>
      <datalist id={listId}>{candidates.map((candidate) => <option key={candidate.id} value={patientChoiceLabel(candidate, locale)} />)}</datalist>
      {search.isError ? <span className="mt-1 block text-[0.64rem] text-[var(--danger-ink)]" role="alert">{t("reports.states.searchError")}</span> : null}
    </label>
  );
}
