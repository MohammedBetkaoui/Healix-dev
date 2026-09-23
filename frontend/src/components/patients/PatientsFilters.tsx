"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  patientAgeFilterValues,
  patientBloodGroupValues,
  patientGenderValues,
  patientLastVisitFilterValues,
  patientStatusValues,
} from "@/features/patients/patients.constants";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type PatientFilterState } from "@/types/patient";

type PatientsFiltersProps = {
  direction: Direction;
  filters: PatientFilterState;
  onFilterChange: (key: keyof PatientFilterState, value: string) => void;
  onReset: () => void;
  t: TranslationFunction;
};

function SelectFilter({
  children,
  direction,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  direction: Direction;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <Select
        className={cn("rounded-2xl", direction === "rtl" && "text-right")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </Select>
    </label>
  );
}

export function PatientsFilters({
  direction,
  filters,
  onFilterChange,
  onReset,
  t,
}: PatientsFiltersProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-[var(--accent-dark)] ring-1 ring-border">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          {t("patients.actions.viewRecord")}
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          {t("patients.filters.reset")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SelectFilter
          direction={direction}
          label={t("patients.filters.gender")}
          value={filters.gender}
          onChange={(value) => onFilterChange("gender", value)}
        >
          <option value="">{t("patients.filters.all")}</option>
          {patientGenderValues.map((gender) => (
            <option key={gender} value={gender}>
              {t(`patients.genders.${gender}`)}
            </option>
          ))}
        </SelectFilter>
        <SelectFilter
          direction={direction}
          label={t("patients.filters.age")}
          value={filters.ageGroup}
          onChange={(value) => onFilterChange("ageGroup", value)}
        >
          <option value="">{t("patients.filters.all")}</option>
          {patientAgeFilterValues.map((ageGroup) => (
            <option key={ageGroup} value={ageGroup}>
              {t(`patients.filters.ageGroups.${ageGroup}`)}
            </option>
          ))}
        </SelectFilter>
        <SelectFilter
          direction={direction}
          label={t("patients.filters.registeredAt")}
          value={filters.registeredAt}
          onChange={(value) => onFilterChange("registeredAt", value)}
        >
          <option value="">{t("patients.filters.all")}</option>
          {patientLastVisitFilterValues.map((period) => (
            <option key={period} value={period}>
              {t(`patients.filters.lastVisits.${period}`)}
            </option>
          ))}
        </SelectFilter>
        <SelectFilter
          direction={direction}
          label={t("patients.filters.bloodGroup")}
          value={filters.bloodGroup}
          onChange={(value) => onFilterChange("bloodGroup", value)}
        >
          <option value="">{t("patients.filters.all")}</option>
          {patientBloodGroupValues.map((bloodGroup) => (
            <option key={bloodGroup} value={bloodGroup}>
              {bloodGroup}
            </option>
          ))}
        </SelectFilter>
        <SelectFilter
          direction={direction}
          label={t("patients.filters.status")}
          value={filters.status}
          onChange={(value) => onFilterChange("status", value)}
        >
          <option value="">{t("patients.filters.all")}</option>
          {patientStatusValues.map((status) => (
            <option key={status} value={status}>
              {t(`patients.statuses.${status}`)}
            </option>
          ))}
        </SelectFilter>
        <SelectFilter
          direction={direction}
          label={t("patients.filters.lastVisit")}
          value={filters.lastVisit}
          onChange={(value) => onFilterChange("lastVisit", value)}
        >
          <option value="">{t("patients.filters.all")}</option>
          {patientLastVisitFilterValues.map((period) => (
            <option key={period} value={period}>
              {t(`patients.filters.lastVisits.${period}`)}
            </option>
          ))}
        </SelectFilter>
      </div>
    </section>
  );
}
