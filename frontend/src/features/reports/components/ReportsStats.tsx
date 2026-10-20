import { Bot, CheckCircle2, FileClock, FilePenLine, Files } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";

export function ReportsStats({ reports, t }: { reports: ClinicalReport[]; t: TranslationFunction }) {
  const values = [
    { icon: Files, key: "month", value: reports.filter((report) => report.effectiveDate.startsWith("2026-10")).length },
    { icon: FileClock, key: "toFinalize", value: reports.filter((report) => report.status === "DRAFT" || report.status === "PRELIMINARY").length },
    { icon: CheckCircle2, key: "final", value: reports.filter((report) => report.status === "FINAL").length },
    { icon: FilePenLine, key: "amended", value: reports.filter((report) => report.status === "AMENDED" || report.status === "CORRECTED").length },
    { icon: Bot, key: "aiValidated", value: reports.filter((report) => report.aiContext && ["FINAL", "CORRECTED"].includes(report.status)).length },
  ];

  return (
    <section aria-label={t("reports.stats.label")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {values.map(({ icon: Icon, key, value }) => (
        <article key={key} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.7rem] font-medium leading-5 text-[var(--text-secondary)]">{t(`reports.stats.${key}`)}</p>
            <Icon size={16} strokeWidth={1.8} className="shrink-0 text-[var(--medical)]" aria-hidden="true" />
          </div>
          <p className="clinical-figure mt-2 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
        </article>
      ))}
    </section>
  );
}

