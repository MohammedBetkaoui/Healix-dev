import { FileHeart, ShieldCheck } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";
import { aiResults, getReportAge, getReportPatientName } from "../utils/report-utils";

// What the report says, laid out as a page. The PDF itself is the archived
// document (see ReportPdfViewer); this is the content the API holds.
export function ReportPreview({ locale, report, t }: { locale: Locale; report: ClinicalReport; t: TranslationFunction }) {
  const tag = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const format = (value: string) => new Intl.DateTimeFormat(tag, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
  const age = getReportAge(report.patient.birthDate, report.effectiveDate);
  const who = report.validator ?? { fullName: report.author.fullName, registrationNumber: null, speciality: report.author.speciality };
  const organization = report.organization;
  const results = report.ai ? aiResults(report.ai) : [];
  const percent = new Intl.NumberFormat(tag, { maximumFractionDigits: 1, style: "percent" });
  return (
    <article className="mx-auto min-h-[70rem] w-full max-w-[210mm] bg-white p-6 text-slate-900 ring-1 ring-slate-200 sm:p-10 print:min-h-0 print:max-w-none print:p-0 print:ring-0" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-5 border-b border-slate-300 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"><FileHeart size={21} strokeWidth={1.7} aria-hidden="true" /></span><div><h2 className="text-base font-bold">{organization?.name ?? (report.finalizedAt ? "HealixDz" : t("reports.preview.organizationPending"))}</h2>{organization ? <p className="mt-1 text-xs text-slate-600">{[organization.type, organization.wilaya].filter(Boolean).join(" · ")}</p> : null}{organization?.address ? <p className="mt-1 max-w-sm text-[0.68rem] leading-5 text-slate-500">{organization.address}{organization.phone ? ` · ${organization.phone}` : ""}</p> : null}</div></div>
        <div className="sm:text-end"><p className="text-sm font-bold">{who.fullName ?? "—"}</p><p className="mt-1 text-xs text-slate-600">{who.speciality ?? ""}</p>{who.registrationNumber ? <p className="mt-1 text-[0.68rem] text-slate-500">{t("reports.preview.professionalNumber")} : <bdi dir="ltr">{who.registrationNumber}</bdi></p> : null}</div>
      </header>
      <div className="py-7 text-center"><p className="text-lg font-bold tracking-[0.12em]">{report.title}</p><p className="mt-2 font-mono text-xs text-slate-500" dir="ltr">{report.number ?? t("reports.common.pendingReference")}{report.version > 1 ? ` · v${report.version}` : ""}</p></div>
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
        <div><p className="text-slate-500">{t("reports.preview.patient")}</p><p className="mt-1 font-semibold">{getReportPatientName(report.patient, locale)}</p><p className="mt-1 text-slate-600">{report.patient.birthDate ? `${format(report.patient.birthDate)}${age === null ? "" : ` · ${age} ${t("reports.preview.years")}`}` : t("reports.common.notProvided")}</p></div>
        <div className="sm:text-end"><p className="text-slate-500">{t("reports.preview.fileAndDate")}</p><p className="mt-1 font-semibold" dir="ltr">{report.patient.hospitalRecordNumber ?? "—"}</p><p className="mt-1 text-slate-600">{format(report.effectiveDate)}</p></div>
      </section>
      <div className="mt-7 space-y-6">
        {report.sections.map((section) => <section key={section.id}><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{t(`reports.create.fields.${section.id}`)}</h3><p className="mt-3 whitespace-pre-line text-xs leading-6 text-slate-700">{section.body}</p></section>)}
        {report.ai ? <section><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{t("reports.ai.result")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{results.map((result) => <div key={result.code} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-xs"><span className="font-semibold">{result.label}</span><span className="font-mono text-slate-500">{result.score === undefined ? result.value : percent.format(result.score)}</span></div>)}</div></section> : null}
        {report.conclusion ?? report.ai?.clinicianImpression ? <section><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{t("reports.preview.conclusion")}</h3><p className="mt-3 whitespace-pre-line text-xs leading-6 text-slate-700">{report.conclusion ?? report.ai?.clinicianImpression}</p></section> : null}
        {report.external?.notes ? <section><h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{t("reports.import.notes")}</h3><p className="mt-3 whitespace-pre-line text-xs leading-6 text-slate-700">{report.external.notes}</p></section> : null}
      </div>
      <footer className="mt-10 border-t border-slate-300 pt-5"><div className="flex items-start gap-2 text-[0.68rem] leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><p>{t("reports.preview.confidential")}{report.ai ? ` ${t("reports.ai.disclaimer")}` : ""}</p></div><div className="mt-7 flex items-end justify-between gap-6 text-[0.68rem] text-slate-500"><p>{report.finalizedAt ? (organization?.wilaya ? t("reports.preview.generatedAt", { date: format(report.finalizedAt), wilaya: organization.wilaya }) : t("reports.preview.issuedOn", { date: format(report.finalizedAt) })) : t("reports.preview.notFinalized")}</p><div className="min-w-36 border-t border-slate-300 pt-2 text-center">{t("reports.preview.signature")}</div></div></footer>
    </article>
  );
}
