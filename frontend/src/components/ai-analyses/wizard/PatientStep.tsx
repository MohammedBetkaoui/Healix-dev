"use client";

import { Check, CircleCheck, Loader2, Search, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { formatPatientDate } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { type Patient } from "@/types/patient";

export type ConsentState = "idle" | "loading" | "signed" | "missing" | "error";

type PatientStepProps = {
  consentState: ConsentState;
  /** Consents tab of the selected patient's record. */
  consentsHref: string | null;
  isLoading: boolean;
  isError: boolean;
  locale: Locale;
  onSearchChange: (value: string) => void;
  onSelect: (patient: Patient) => void;
  patients: Patient[];
  preselectedError: boolean;
  search: string;
  selected: Patient | null;
  t: TranslationFunction;
};

export function getPatientDisplayName(
  patient: Pick<Patient, "firstName" | "lastName" | "firstNameAr" | "lastNameAr">,
  locale: Locale,
) {
  const latin = [patient.firstName, patient.lastName].filter(Boolean).join(" ");
  const arabic = [patient.firstNameAr, patient.lastNameAr].filter(Boolean).join(" ");

  return locale === "ar" ? arabic || latin : latin || arabic;
}

export function PatientStep({
  consentState,
  consentsHref,
  isError,
  isLoading,
  locale,
  onSearchChange,
  onSelect,
  patients,
  preselectedError,
  search,
  selected,
  t,
}: PatientStepProps) {
  const id = useId();
  // The selected patient stays listed even when the search no longer finds it.
  const listed = selected && !patients.some((patient) => patient.id === selected.id)
    ? [selected, ...patients]
    : patients;

  return (
    <div className="ai-patient-step">
      {preselectedError ? (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning-ink)]">
          <TriangleAlert size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("aiAnalyses.wizard.patient.preselectedError")}
        </p>
      ) : null}

      <div className="ai-patient-search">
        <label htmlFor={`${id}-search`} className="text-[.8rem] font-medium text-[var(--text-primary)]">
          {t("aiAnalyses.wizard.patient.searchLabel")}
        </label>
        <div className="relative">
          <Search size={16} strokeWidth={1.8} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("aiAnalyses.wizard.patient.searchPlaceholder")}
            className="h-[42px] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] ps-9 pe-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <fieldset className="ai-patient-results">
        <legend className="mb-2 text-[.8rem] font-medium text-[var(--text-primary)]">
          {t("aiAnalyses.wizard.patient.resultsLabel")}
        </legend>
        {isLoading && listed.length === 0 ? (
          <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("aiAnalyses.wizard.patient.loading")}
          </p>
        ) : isError ? (
          <p role="alert" className="text-sm text-[var(--danger-ink)]">{t("aiAnalyses.wizard.patient.error")}</p>
        ) : listed.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">{t("aiAnalyses.wizard.patient.empty")}</p>
        ) : (
          <ul className="ai-patient-list">
            {listed.map((patient) => {
              const isSelected = patient.id === selected?.id;

              return (
                <li key={patient.id}>
                  <label className="ai-patient-option" data-selected={isSelected}>
                    <input
                      type="radio"
                      name={`${id}-patient`}
                      className="accent-[var(--medical)]"
                      checked={isSelected}
                      onChange={() => onSelect(patient)}
                    />
                    <span className="ai-patient-avatar" aria-hidden="true">{getAccountInitials(getPatientDisplayName(patient, locale))}</span>
                    <span className="ai-patient-identity">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                        <bdi>{getPatientDisplayName(patient, locale)}</bdi>
                      </span>
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {t("aiAnalyses.wizard.patient.born", { date: formatPatientDate(patient.birthDate, locale) })}
                      </span>
                      {patient.internalId ? <span className="ai-patient-record">{t("aiAnalyses.wizard.workspace.recordNumber", { number: patient.internalId })}</span> : null}
                    </span>
                    {isSelected ? <Check size={16} aria-hidden="true" className="ai-patient-selected" /> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {selected ? (
        <div aria-live="polite">
          {consentState === "loading" ? (
            <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              {t("aiAnalyses.wizard.patient.consentLoading")}
            </p>
          ) : consentState === "signed" ? (
            <p className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--success-line)] bg-[var(--success-soft)] px-3 py-2.5 text-sm text-[var(--success-ink)]">
              <CircleCheck size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
              {t("aiAnalyses.wizard.patient.consentSigned")}
            </p>
          ) : consentState === "missing" || consentState === "error" ? (
            <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm text-[var(--danger-ink)]">
                <ShieldAlert size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
                {consentState === "missing"
                  ? t("aiAnalyses.wizard.patient.consentMissing")
                  : t("aiAnalyses.wizard.patient.consentError")}
              </p>
              {consentState === "missing" && consentsHref ? (
                <Link href={consentsHref} className="clinical-button shrink-0">
                  {t("aiAnalyses.wizard.patient.openConsents")}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
