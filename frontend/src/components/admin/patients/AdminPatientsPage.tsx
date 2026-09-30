"use client";

import { CalendarDays, Phone, Search, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { PatientsFilters } from "@/components/patients/PatientsFilters";
import { PatientsHeader } from "@/components/patients/PatientsHeader";
import { PatientsSearch } from "@/components/patients/PatientsSearch";
import { PatientsStats } from "@/components/patients/PatientsStats";
import {
  toAdminPatientViewModel,
  toPatientBloodGroupCode,
} from "@/features/admin/api/admin-patients.api";
import { useAdminPatients } from "@/features/admin/hooks/use-admin-patients";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type AdminPatientsQuery } from "@/types/admin";
import {
  type Patient,
  type PatientAdministrativeStatus,
  type PatientFilterState,
  type PatientGender,
  type PatientInsurance,
  type PatientSector,
  type PatientStatus,
} from "@/types/patient";

const initialFilters: PatientFilterState = {
  administrativeStatus: "",
  ageGroup: "",
  bloodGroup: "",
  gender: "",
  insurance: "",
  lastVisit: "",
  registeredAt: "",
  sector: "",
  status: "",
  wilaya: "",
};

const patientsPageSize = 20;

function formatDate(value: string, locale: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getAge(birthDate: string) {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();

  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

function getAgeGroup(birthDate: string) {
  const age = getAge(birthDate);

  if (age < 18) {
    return "UNDER_18";
  }

  if (age <= 40) {
    return "18_40";
  }

  if (age <= 60) {
    return "41_60";
  }

  return "OVER_60";
}

function matchesPeriod(value: string, period: string) {
  if (!period) {
    return true;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (period === "LAST_7_DAYS") {
    return diffInDays <= 7;
  }

  if (period === "LAST_30_DAYS") {
    return diffInDays <= 30;
  }

  if (period === "LAST_90_DAYS") {
    return diffInDays <= 90;
  }

  return true;
}

function statusClasses(status: Patient["status"]) {
  if (status === "URGENT") {
    return "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]";
  }

  if (status === "FOLLOW_UP") {
    return "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]";
  }

  if (status === "NEW") {
    return "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]";
  }

  return "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]";
}

export function AdminPatientsPage() {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);

  // Any change to what is queried restarts from the first page.
  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const updateFilter = (key: keyof PatientFilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setSearch("");
    setPage(1);
  };

  // Filter values are the option values rendered by PatientsFilters, i.e.
  // members of these unions; bloodGroup is the exception ("A+" is displayed,
  // the backend expects "A_POS").
  const query = useMemo<AdminPatientsQuery>(
    () => ({
      administrativeStatus:
        (filters.administrativeStatus as PatientAdministrativeStatus) || undefined,
      bloodGroup: toPatientBloodGroupCode(filters.bloodGroup),
      gender: (filters.gender as PatientGender) || undefined,
      insurance: (filters.insurance as PatientInsurance) || undefined,
      limit: patientsPageSize,
      page,
      search: search.trim() || undefined,
      sector: (filters.sector as PatientSector) || undefined,
      status: (filters.status as PatientStatus) || undefined,
      wilaya: filters.wilaya.trim() || undefined,
    }),
    [
      filters.administrativeStatus,
      filters.bloodGroup,
      filters.gender,
      filters.insurance,
      filters.sector,
      filters.status,
      filters.wilaya,
      page,
      search,
    ],
  );

  const { data, error, isLoading } = useAdminPatients(query);

  const patients = useMemo(
    () => (data?.data ?? []).map(toAdminPatientViewModel),
    [data?.data],
  );

  // Only the filters with no server-side counterpart remain here, applied to
  // the current page: ageGroup (from birthDate) and registeredAt (from
  // createdAt). lastVisit has no data source yet, so its control has no
  // effect rather than always returning zero results.
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      if (filters.ageGroup && getAgeGroup(patient.birthDate) !== filters.ageGroup) {
        return false;
      }

      if (
        filters.registeredAt &&
        !matchesPeriod(patient.registeredAt, filters.registeredAt)
      ) {
        return false;
      }

      return true;
    });
  }, [filters.ageGroup, filters.registeredAt, patients]);

  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("patients.page.breadcrumb")}`}
      titleKey="patients.page.title"
    >
      <div className="space-y-6">
        <PatientsHeader
          accountType="ESTABLISHMENT"
          onAddPatient={() => undefined}
          t={t}
        />

        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-[var(--accent-dark)] ring-1 ring-border">
                  <Search className="h-4 w-4" />
                </span>
                {t("patients.actions.viewRecord")}
              </div>
              <PatientsSearch
                direction={direction}
                onSearchChange={updateSearch}
                search={search}
                t={t}
              />
            </div>
            <div className="rounded-2xl border border-border bg-muted/80 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{t("patients.page.title")}</p>
              <p className="mt-2 leading-6">{t("patients.security.note")}</p>
            </div>
          </div>
        </section>

        <PatientsStats patients={filteredPatients} t={t} />

        <PatientsFilters
          direction={direction}
          filters={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          t={t}
        />

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
            {t("patients.states.loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
            {t("patients.states.error")}
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
              <div className="border-b border-border/70 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {t("patients.page.title")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("patients.states.results", { count: filteredPatients.length })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    {t("patients.actions.viewRecord")}
                  </Button>
                </div>
              </div>

              {filteredPatients.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {t("patients.states.empty")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.fullName")}
                        </th>
                        <th className="px-5 py-4 text-start">{t("patients.table.columns.id")}</th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.gender")}
                        </th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.birthDate")}
                        </th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.assignedDoctor")}
                        </th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.status")}
                        </th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.lastVisit")}
                        </th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.phone")}
                        </th>
                        <th className="px-5 py-4 text-start">
                          {t("patients.table.columns.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredPatients.map((patient) => (
                        <tr key={patient.id} className="align-top">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-foreground">
                              {patient.firstName} {patient.lastName}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{patient.email}</div>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">{patient.id}</td>
                          <td className="px-5 py-4 text-muted-foreground">
                            {t(`patients.genders.${patient.gender}`)}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            {formatDate(patient.birthDate, locale)}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-dark)]" />
                              <span>{patient.assignedDoctor}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                                statusClasses(patient.status),
                              )}
                            >
                              {t(`patients.statuses.${patient.status}`)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>{formatDate(patient.lastVisit, locale)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>{patient.phone}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm">
                                {t("patients.actions.view")}
                              </Button>
                              <Button type="button" variant="ghost" size="sm">
                                {t("patients.actions.edit")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("patients.table.pagination", {
                  page: data?.meta.page ?? page,
                  totalPages,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoPrevious}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                >
                  {t("admin.actions.previous")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoNext}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  {t("admin.actions.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
