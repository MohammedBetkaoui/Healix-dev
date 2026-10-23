import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { reportCategoryKeys, reportSourceKeys, reportStatusKeys } from "../reports.copy";
import { type ReportCategory, type ReportListItem, type ReportSourceType, type ReportStatus } from "../types/report.types";
import { getReportPatientName, type ReportFilterValue } from "../utils/report-utils";

type ReportsFiltersProps = {
  authors: Array<ReportListItem["author"]>;
  filters: ReportFilterValue;
  locale: Locale;
  onChange: (filters: ReportFilterValue) => void;
  onReset: () => void;
  patients: Array<ReportListItem["patient"]>;
  resultCount: number;
  t: TranslationFunction;
};

const statuses: ReportStatus[] = ["DRAFT", "FINAL", "AMENDED", "CANCELED"];
const sources: ReportSourceType[] = ["AI_ANALYSIS", "CONSULTATION", "IMAGING", "LABORATORY", "EXTERNAL_DOCUMENT", "OTHER"];
const categories: ReportCategory[] = ["AI_BRAIN", "AI_ECG", "AI_PATHOLOGY", "AI_CARDIAC_MRI", "CONSULTATION_NOTE", "RADIOLOGY", "LABORATORY_RESULT", "EXTERNAL_MEDICAL", "OTHER_CLINICAL"];

export function ReportsFilters({ authors, filters, locale, onChange, onReset, patients, resultCount, t }: ReportsFiltersProps) {
  const id = useId();
  const update = <Key extends keyof ReportFilterValue>(key: Key, value: ReportFilterValue[Key]) => onChange({ ...filters, [key]: value });
  const active = Object.values(filters).some(Boolean);

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1" htmlFor={`${id}-search`}>
          <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--text-secondary)]">{t("reports.filters.searchLabel")}</span>
          <span className="relative block">
            <Search size={16} strokeWidth={1.8} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <Input id={`${id}-search`} className="border-[var(--border)] bg-[var(--surface)] ps-10 shadow-none" placeholder={t("reports.filters.searchPlaceholder")} value={filters.query} onChange={(event) => update("query", event.target.value)} />
          </span>
        </label>
        <div className="flex items-center justify-between gap-3 lg:pb-0.5">
          <span aria-live="polite" className="clinical-figure whitespace-nowrap text-xs font-semibold text-[var(--text-secondary)]">{t("reports.filters.count", { count: resultCount })}</span>
          <button type="button" className="clinical-button min-h-10" disabled={!active} onClick={onReset}>
            <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
            {t("reports.filters.reset")}
          </button>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
        <div className="mb-3 flex items-center gap-2 text-[0.7rem] font-semibold text-[var(--text-secondary)]"><SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" />{t("reports.filters.label")}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect id={`${id}-category`} label={t("reports.filters.type")} value={filters.category} onChange={(value) => update("category", value as ReportFilterValue["category"])} options={categories.map((value) => ({ label: t(reportCategoryKeys[value]), value }))} t={t} />
          <FilterSelect id={`${id}-status`} label={t("reports.filters.status")} value={filters.status} onChange={(value) => update("status", value as ReportFilterValue["status"])} options={statuses.map((value) => ({ label: t(reportStatusKeys[value]), value }))} t={t} />
          <FilterSelect id={`${id}-patient`} label={t("reports.filters.patient")} value={filters.patient} onChange={(value) => update("patient", value)} options={patients.map((patient) => ({ label: getReportPatientName(patient, locale), value: patient.id }))} t={t} />
          <FilterSelect id={`${id}-author`} label={t("reports.filters.author")} value={filters.author} onChange={(value) => update("author", value)} options={authors.map((person) => ({ label: person.fullName, value: person.id }))} t={t} />
          <FilterSelect id={`${id}-source`} label={t("reports.filters.source")} value={filters.source} onChange={(value) => update("source", value as ReportFilterValue["source"])} options={sources.map((value) => ({ label: t(reportSourceKeys[value]), value }))} t={t} />
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={`${id}-from`}><span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("reports.filters.from")}</span><Input id={`${id}-from`} type="date" className="border-[var(--border)] px-2 text-xs shadow-none" value={filters.from} max={filters.to || undefined} onChange={(event) => update("from", event.target.value)} /></label>
            <label htmlFor={`${id}-to`}><span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{t("reports.filters.to")}</span><Input id={`${id}-to`} type="date" className="border-[var(--border)] px-2 text-xs shadow-none" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} /></label>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterSelect({ id, label, onChange, options, t, value }: { id: string; label: string; onChange: (value: string) => void; options: { label: string; value: string }[]; t: TranslationFunction; value: string }) {
  return (
    <label htmlFor={id}>
      <span className="mb-1.5 block text-[0.65rem] font-semibold text-[var(--text-secondary)]">{label}</span>
      <Select id={id} className="border-[var(--border)] text-xs shadow-none" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("reports.filters.all")}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label>
  );
}
