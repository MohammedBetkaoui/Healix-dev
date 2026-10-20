import { FileHeart, ShieldCheck } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localizeReport } from "../reports.copy";
import { type ClinicalReport } from "../types/report.types";

function ageAtDate(birthDate: string | undefined, at: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const date = new Date(at);
  let age = date.getFullYear() - birth.getFullYear();
  if (date.getMonth() < birth.getMonth() || (date.getMonth() === birth.getMonth() && date.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function ReportPreview({ locale, report, t }: { locale: Locale; report: ClinicalReport; t: TranslationFunction }) {
  const format = (value: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
  const age = ageAtDate(report.subject.birthDate, report.effectiveDate);
  return (
    <article className="mx-auto min-h-[70rem] w-full max-w-[210mm] bg-white p-6 text-slate-900 ring-1 ring-slate-200 sm:p-10 print:min-h-0 print:max-w-none print:p-0 print:ring-0" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-5 border-b border-slate-300 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"><FileHeart size={21} strokeWidth={1.7} aria-hidden="true" /></span><div><h2 className="text-base font-bold">{localizeReport(report.organization.name, locale)}</h2><p className="mt-1 text-xs text-slate-600">{localizeReport(report.organization.type, locale)} · {localizeReport(report.organization.wilaya, locale)}</p><p className="mt-1 max-w-sm text-[0.68rem] leading-5 text-slate-500">{localizeReport(report.organization.address, locale)}{report.organization.phone ? ` · ${report.organization.phone}` : ""}{report.organization.email ? ` · ${report.organization.email}` : ""}</p></div></div>
        <div className="sm:text-end"><p className="text-sm font-bold">{report.validator ? localizeReport(report.validator.displayName, locale) : report.author ? localizeReport(report.author.displayName, locale) : "—"}</p><p className="mt-1 text-xs text-slate-600">{report.validator?.specialty ? localizeReport(report.validator.specialty, locale) : report.author?.specialty ? localizeReport(report.author.specialty, locale) : ""}</p>{(report.validator?.professionalNumber ?? report.author?.professionalNumber) ? <p className="mt-1 text-[0.68rem] text-slate-500">{t("reports.preview.professionalNumber")} : <bdi dir="ltr">{report.validator?.professionalNumber ?? report.author?.professionalNumber}</bdi></p> : null}</div>
      </header>
      <div className="py-7 text-center"><p className="text-lg font-bold tracking-[0.12em]">{t("reports.preview.title")}</p><p className="mt-2 font-mono text-xs text-slate-500" dir="ltr">{report.identifier ?? t("reports.common.pendingReference")}</p></div>
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
        <div><p className="text-slate-500">{t("reports.preview.patient")}</p><p className="mt-1 font-semibold">{localizeReport(report.subject.fullName, locale)}</p><p className="mt-1 text-slate-600">{report.subject.birthDate ? `${format(report.subject.birthDate)}${age === null ? "" : ` · ${age} ${t("reports.preview.years")}`}` : t("reports.common.notProvided")}</p></div>
        <div className="sm:text-end"><p className="text-slate-500">{t("reports.preview.fileAndDate")}</p><p className="mt-1 font-semibold" dir="ltr">{report.subject.fileNumber ?? "—"}</p><p className="mt-1 text-slate-600">{format(report.effectiveDate)}</p></div>
      </section>
      <div className="mt-7 space-y-6">
        {report.sections.map((section) => <section key={section.id}><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{localizeReport(section.title, locale)}</h3><p className="mt-3 whitespace-pre-line text-xs leading-6 text-slate-700">{localizeReport(section.body, locale)}</p></section>)}
        {report.aiContext ? <section><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{t("reports.ai.result")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{report.aiContext.results.map((result) => <div key={result.code} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-xs"><span className="font-semibold">{result.label[locale]}</span><span className="font-mono text-slate-500">{result.score === undefined ? result.value : new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" }).format(result.score)}</span></div>)}</div></section> : null}
        {report.conclusion ? <section><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{t("reports.preview.conclusion")}</h3><p className="mt-3 text-xs leading-6 text-slate-700">{localizeReport(report.conclusion, locale)}</p></section> : null}
      </div>
      <footer className="mt-10 border-t border-slate-300 pt-5"><div className="flex items-start gap-2 text-[0.68rem] leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><p>{t("reports.preview.confidential")}{report.aiContext ? ` ${t("reports.ai.disclaimer")}` : ""}</p></div><div className="mt-7 flex items-end justify-between gap-6 text-[0.68rem] text-slate-500"><p>{t("reports.preview.generatedAt", { date: format(report.issuedAt ?? report.createdAt), wilaya: localizeReport(report.organization.wilaya, locale) })}</p><div className="min-w-36 border-t border-slate-300 pt-2 text-center">{t("reports.preview.signature")}</div></div></footer>
    </article>
  );
}

