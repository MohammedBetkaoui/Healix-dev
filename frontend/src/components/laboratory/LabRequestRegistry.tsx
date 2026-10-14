"use client";

import { AlertTriangle, Beaker, ChevronRight, FilterX, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { laboratoryCopy } from "@/features/laboratory/laboratory.copy";
import { type LabCategory, type LabLocalizedText, type LabRequest, type LabRequestStatus } from "@/features/laboratory/laboratory.types";
import { type Locale } from "@/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

const inputClassName = "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const categories: LabCategory[] = ["HEMATOLOGY", "BIOCHEMISTRY", "MICROBIOLOGY", "IMMUNOLOGY", "HORMONOLOGY", "PARASITOLOGY"];
const statuses: LabRequestStatus[] = ["PRESCRIBED", "TO_COLLECT", "COLLECTED", "RECEIVED", "IN_ANALYSIS", "TO_VALIDATE", "VALIDATED", "AVAILABLE", "NON_CONFORMING"];
const statusTone: Record<LabRequestStatus, DashboardStatusTone> = {
  AVAILABLE: "success", COLLECTED: "info", IN_ANALYSIS: "info", NON_CONFORMING: "danger", PRESCRIBED: "neutral",
  RECEIVED: "info", TO_COLLECT: "warning", TO_VALIDATE: "warning", VALIDATED: "success",
};

function localized(value: LabLocalizedText, locale: Locale) { return value[locale]; }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

type LabRequestRegistryProps = { locale: Locale; onSelect: (requestId: string) => void; requests: LabRequest[] };

export function LabRequestRegistry({ locale, onSelect, requests }: LabRequestRegistryProps) {
  const copy = laboratoryCopy[locale];
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const doctors = useMemo(() => Array.from(new Map(requests.map((request) => [request.doctor.fr, request.doctor])).values()), [requests]);
  const services = useMemo(() => Array.from(new Map(requests.map((request) => [request.service.fr, request.service])).values()), [requests]);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    return requests.filter((request) => {
      if (doctorFilter && request.doctor.fr !== doctorFilter) return false;
      if (serviceFilter && request.service.fr !== serviceFilter) return false;
      if (categoryFilter && request.category !== categoryFilter) return false;
      if (priorityFilter && request.priority !== priorityFilter) return false;
      if (statusFilter && request.status !== statusFilter) return false;
      if (periodFilter === "today" && dateKey(new Date(request.createdAt)) !== dateKey(now)) return false;
      if (periodFilter === "7days" && new Date(request.createdAt) < sevenDaysAgo) return false;
      if (!query) return true;
      return [request.reference, request.patient.firstName, request.patient.lastName, request.patient.firstNameAr, request.patient.lastNameAr, `${request.patient.firstName} ${request.patient.lastName}`, `${request.patient.firstNameAr} ${request.patient.lastNameAr}`, request.patient.internalRecordNumber]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [categoryFilter, doctorFilter, periodFilter, priorityFilter, requests, search, serviceFilter, statusFilter]);

  const hasFilters = Boolean(search.trim() || doctorFilter || serviceFilter || categoryFilter || priorityFilter || statusFilter || periodFilter);
  const resetFilters = () => { setSearch(""); setDoctorFilter(""); setServiceFilter(""); setCategoryFilter(""); setPriorityFilter(""); setStatusFilter(""); setPeriodFilter(""); };

  return (
    <>
      <section className="surface-section p-4 sm:p-5" aria-labelledby="lab-filters-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" /><h2 id="lab-filters-title" className="text-sm font-semibold text-[var(--ink)]">{copy.filtersTitle}</h2></div>
          {hasFilters ? <button type="button" className="clinical-button h-9 bg-[var(--panel)] text-xs" onClick={resetFilters}><FilterX className="h-3.5 w-3.5" aria-hidden="true" />{copy.reset}</button> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2"><span className="sr-only">{copy.search}</span><Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-[var(--ink-faint)]" strokeWidth={1.8} aria-hidden="true" /><input className={cn(inputClassName, "ps-10")} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} /></label>
          <label><span className="sr-only">{copy.prescribingDoctor}</span><select className={inputClassName} value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}><option value="">{copy.allDoctors}</option>{doctors.map((doctor) => <option key={doctor.fr} value={doctor.fr}>{localized(doctor, locale)}</option>)}</select></label>
          <label><span className="sr-only">{copy.drawer.service}</span><select className={inputClassName} value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="">{copy.allServices}</option>{services.map((service) => <option key={service.fr} value={service.fr}>{localized(service, locale)}</option>)}</select></label>
          <label><span className="sr-only">{copy.drawer.category}</span><select className={inputClassName} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">{copy.allCategories}</option>{categories.map((category) => <option key={category} value={category}>{copy.categories[category]}</option>)}</select></label>
          <label><span className="sr-only">{copy.priority}</span><select className={inputClassName} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">{copy.allPriorities}</option><option value="ROUTINE">{copy.routine}</option><option value="URGENT">{copy.urgent}</option></select></label>
          <label><span className="sr-only">{copy.status}</span><select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{copy.allStatuses}</option>{statuses.map((status) => <option key={status} value={status}>{copy.statuses[status]}</option>)}</select></label>
          <label><span className="sr-only">{copy.allPeriods}</span><select className={inputClassName} value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="">{copy.allPeriods}</option><option value="today">{copy.today}</option><option value="7days">{copy.last7Days}</option></select></label>
        </div>
      </section>

      <section className="surface-section overflow-hidden" aria-labelledby="lab-requests-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><Beaker className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span><div><h2 id="lab-requests-title" className="text-sm font-semibold text-[var(--ink)]">{copy.requests}</h2><p className="mt-0.5 text-xs text-[var(--ink-faint)]">{copy.workflow}</p></div></div>
          <span className="clinical-figure rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-[0.68rem] font-medium text-[var(--ink-soft)]">{filteredRequests.length} {copy.results}</span>
        </div>
        {filteredRequests.length ? (
          <>
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {filteredRequests.map((request) => {
                const patientName = locale === "ar" ? `${request.patient.firstNameAr} ${request.patient.lastNameAr}` : `${request.patient.firstName} ${request.patient.lastName}`;
                const hasCritical = request.results.some((result) => result.indicator === "CRITICAL");
                return (
                  <button key={request.id} type="button" className={cn("block w-full p-4 text-start transition hover:bg-[var(--panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]", hasCritical && "border-s-2 border-s-[var(--danger)]")} onClick={() => onSelect(request.id)}>
                    <span className="flex items-start justify-between gap-3"><span><span className="clinical-figure block text-xs font-medium text-[var(--medical)]" dir="ltr">{request.reference}</span><span className="mt-1 block font-semibold text-[var(--ink)]">{patientName}</span><span className="mt-0.5 block text-xs text-[var(--ink-soft)]" dir="ltr">{request.patient.internalRecordNumber}</span></span><StatusBadge label={copy.statuses[request.status]} tone={statusTone[request.status]} /></span>
                    <span className="mt-3 grid gap-2 text-xs text-[var(--ink-soft)] sm:grid-cols-2"><span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{copy.categories[request.category]} · {request.exams.map((exam) => localized(exam, locale)).join(", ")}</span><span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{localized(request.doctor, locale)} · {localized(request.service, locale)}</span><span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{localized(request.sample.type, locale)}</span><span className="rounded-[var(--radius-xs)] bg-[var(--panel-soft)] px-3 py-2">{formatDateTime(request.createdAt, locale)} · {request.priority === "URGENT" ? copy.urgent : copy.routine}</span></span>
                    {hasCritical ? <span className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--danger-ink)]"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{copy.drawer.critical}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1180px] border-collapse text-sm">
                <thead className="bg-[var(--panel-soft)]"><tr className="border-b border-[var(--line)] text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]"><th scope="col" className="px-4 py-3 text-start">{copy.requestReference}</th><th scope="col" className="px-4 py-3 text-start">{copy.patient}</th><th scope="col" className="px-4 py-3 text-start">{copy.requestedExams}</th><th scope="col" className="px-4 py-3 text-start">{copy.prescribingDoctor}</th><th scope="col" className="px-4 py-3 text-start">{copy.sampleType}</th><th scope="col" className="px-4 py-3 text-start">{copy.dateTime}</th><th scope="col" className="px-4 py-3 text-start">{copy.priority}</th><th scope="col" className="px-4 py-3 text-start">{copy.status}</th><th scope="col" className="px-4 py-3 text-end"><span className="sr-only">{copy.open}</span></th></tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredRequests.map((request) => {
                    const patientName = locale === "ar" ? `${request.patient.firstNameAr} ${request.patient.lastNameAr}` : `${request.patient.firstName} ${request.patient.lastName}`;
                    const secondaryName = locale === "ar" ? `${request.patient.firstName} ${request.patient.lastName}` : `${request.patient.firstNameAr} ${request.patient.lastNameAr}`;
                    const hasCritical = request.results.some((result) => result.indicator === "CRITICAL");
                    return (
                      <tr key={request.id} className={cn("transition hover:bg-[var(--panel-soft)]", hasCritical && "bg-[var(--danger-soft)]")}>
                        <td className="px-4 py-4"><button type="button" className="clinical-figure font-semibold text-[var(--medical)] hover:underline" dir="ltr" onClick={() => onSelect(request.id)}>{request.reference}</button>{hasCritical ? <span className="mt-1 flex items-center gap-1 text-[0.66rem] font-semibold text-[var(--danger-ink)]"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{copy.drawer.critical}</span> : null}</td>
                        <th scope="row" className="px-4 py-4 text-start font-normal"><button type="button" className="text-start" onClick={() => onSelect(request.id)}><span className="block font-semibold text-[var(--ink)]">{patientName}</span><span className="block text-xs text-[var(--ink-soft)]" dir={locale === "ar" ? "ltr" : "rtl"}>{secondaryName}</span><span className="clinical-figure mt-1 block text-[0.65rem] text-[var(--ink-faint)]" dir="ltr">{request.patient.internalRecordNumber}</span></button></th>
                        <td className="max-w-[15rem] px-4 py-4"><span className="text-xs font-medium text-[var(--medical)]">{copy.categories[request.category]}</span><span className="mt-1 block text-xs leading-5 text-[var(--ink-soft)]">{request.exams.map((exam) => localized(exam, locale)).join(" · ")}</span></td>
                        <td className="max-w-[13rem] px-4 py-4 text-xs leading-5 text-[var(--ink-soft)]">{localized(request.doctor, locale)}<span className="mt-0.5 block text-[var(--ink-faint)]">{localized(request.service, locale)}</span></td>
                        <td className="max-w-[12rem] px-4 py-4 text-xs leading-5 text-[var(--ink-soft)]">{localized(request.sample.type, locale)}</td>
                        <td className="clinical-figure px-4 py-4 text-xs text-[var(--ink-soft)]">{formatDateTime(request.createdAt, locale)}</td>
                        <td className="px-4 py-4"><StatusBadge label={request.priority === "URGENT" ? copy.urgent : copy.routine} tone={request.priority === "URGENT" ? "danger" : "neutral"} /></td>
                        <td className="px-4 py-4"><StatusBadge label={copy.statuses[request.status]} tone={statusTone[request.status]} /></td>
                        <td className="px-4 py-4 text-end"><button type="button" className="clinical-icon-button" onClick={() => onSelect(request.id)} aria-label={`${copy.open} — ${request.reference}`}><ChevronRight className="clinical-directional h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : <div className="px-6 py-14 text-center"><Search className="mx-auto h-7 w-7 text-[var(--ink-faint)]" strokeWidth={1.5} aria-hidden="true" /><p className="mt-3 text-sm text-[var(--ink-soft)]">{copy.noRequest}</p><button type="button" className="clinical-button mt-4 bg-[var(--panel)]" onClick={resetFilters}>{copy.reset}</button></div>}
      </section>
    </>
  );
}
