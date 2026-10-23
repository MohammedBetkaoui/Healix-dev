import { Bot, CheckCircle2, FileClock, FilePenLine, Files } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type ReportStats } from "../types/report.types";

const items = [
  { icon: Files, key: "month" },
  { icon: FileClock, key: "toFinalize" },
  { icon: CheckCircle2, key: "final" },
  { icon: FilePenLine, key: "amended" },
  { icon: Bot, key: "aiValidated" },
] as const;

export function ReportsStats({ isLoading, stats, t }: { isLoading: boolean; stats?: ReportStats; t: TranslationFunction }) {
  return (
    <section aria-label={t("reports.stats.label")} aria-busy={isLoading} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map(({ icon: Icon, key }) => (
        <article key={key} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.7rem] font-medium leading-5 text-[var(--text-secondary)]">{t(`reports.stats.${key}`)}</p>
            <Icon size={16} strokeWidth={1.8} className="shrink-0 text-[var(--medical)]" aria-hidden="true" />
          </div>
          {stats ? <p className="clinical-figure mt-2 text-xl font-semibold text-[var(--text-primary)]">{new Intl.NumberFormat().format(stats[key])}</p> : <p className={isLoading ? "mt-2 h-7 w-10 animate-pulse rounded bg-[var(--surface-muted)]" : "clinical-figure mt-2 text-xl font-semibold text-[var(--text-muted)]"} aria-hidden="true">{isLoading ? "" : "—"}</p>}
        </article>
      ))}
    </section>
  );
}
