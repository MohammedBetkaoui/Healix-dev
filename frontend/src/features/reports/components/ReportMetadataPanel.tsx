import { Copy, ShieldCheck } from "lucide-react";

import { type Locale } from "@/i18n";
import { formatFileSize } from "@/lib/format/format-file-size";
import { type TranslationFunction } from "@/lib/i18n";

import { reportCategoryKeys, reportSourceKeys } from "../reports.copy";
import { type ClinicalReport } from "../types/report.types";
import { getReportPatientName } from "../utils/report-utils";
import { ReportStatusBadge } from "./ReportStatusBadge";

export function ReportMetadataPanel({ locale, onCopy, report, t }: { locale: Locale; onCopy: (value: string) => void; report: ClinicalReport; t: TranslationFunction }) {
  const checksum = report.presentedForm?.sha256 ?? report.contentFingerprint;
  const format = (value?: string | null) => value ? new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : t("reports.common.notProvided");
  const missing = t("reports.common.notProvided");
  const rows: Array<[string, string]> = [
    [t("reports.metadata.reference"), report.number ?? t("reports.common.pendingReference")],
    [t("reports.metadata.patient"), getReportPatientName(report.patient, locale)],
    [t("reports.metadata.fileNumber"), report.patient.hospitalRecordNumber ?? missing],
    [t("reports.metadata.type"), t(reportCategoryKeys[report.category])],
    [t("reports.metadata.category"), t(reportSourceKeys[report.sourceType])],
    [t("reports.metadata.version"), `v${report.version}`],
    [t("reports.metadata.createdAt"), format(report.createdAt)],
    [t("reports.metadata.finalizedAt"), format(report.finalizedAt)],
    [t("reports.metadata.author"), report.external?.author ?? report.author.fullName],
    [t("reports.metadata.validator"), report.validator?.fullName ?? missing],
    [t("reports.metadata.establishment"), report.organization?.name ?? missing],
    [t("reports.metadata.sourceDocument"), report.importedDocument?.fileName ?? missing],
    [t("reports.metadata.fileSize"), report.presentedForm ? formatFileSize(report.presentedForm.sizeBytes) : missing],
  ];
  return (
    <aside className="space-y-4">
      <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t("reports.metadata.title")}</h3><ReportStatusBadge status={report.status} t={t} /></div>
        <dl className="mt-4 divide-y divide-[var(--line-soft)]">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2.5 text-[0.68rem]"><dt className="text-[var(--text-muted)]">{label}</dt><dd className="break-words text-end font-semibold text-[var(--text-primary)]">{value}</dd></div>)}</dl>
        {checksum ? <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3"><p className="flex items-center gap-2 text-[0.7rem] font-semibold text-[var(--accent-dark)]"><ShieldCheck size={15} aria-hidden="true" />{t("reports.metadata.integrity")}</p><div className="mt-2 flex items-center justify-between gap-2"><bdi dir="ltr" className="clinical-figure text-[0.66rem]">{`${checksum.slice(0, 6)}…${checksum.slice(-4)}`}</bdi><button type="button" className="clinical-icon-button h-7 min-w-7" onClick={() => onCopy(checksum)} aria-label={t("reports.actions.copyChecksum")}><Copy size={13} aria-hidden="true" /></button></div></div> : null}
      </section>
    </aside>
  );
}
