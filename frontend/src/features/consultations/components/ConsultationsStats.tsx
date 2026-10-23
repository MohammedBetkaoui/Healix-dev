import { CalendarCheck, CalendarDays, CalendarRange, Pill } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type ConsultationStats } from "../types/consultation.types";

const items = [
  { icon: CalendarCheck, key: "today" },
  { icon: CalendarDays, key: "week" },
  { icon: CalendarRange, key: "month" },
  { icon: Pill, key: "prescriptionShare" },
] as const;

export function ConsultationsStats({ isLoading, stats, t }: { isLoading: boolean; stats?: ConsultationStats; t: TranslationFunction }) {
  return (
    <section aria-label={t("consultations.stats.label")} aria-busy={isLoading} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ icon: Icon, key }) => (
        <article key={key} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.7rem] font-medium leading-5 text-[var(--text-secondary)]">{t(`consultations.stats.${key}`)}</p>
            <Icon size={16} strokeWidth={1.8} className="shrink-0 text-[var(--medical)]" aria-hidden="true" />
          </div>
          {stats ? (
            <p className="clinical-figure mt-2 text-xl font-semibold text-[var(--text-primary)]">
              {key === "prescriptionShare" ? `${stats.prescriptionShare} %` : new Intl.NumberFormat().format(stats[key])}
            </p>
          ) : <p className={isLoading ? "mt-2 h-7 w-10 animate-pulse rounded bg-[var(--surface-muted)]" : "clinical-figure mt-2 text-xl font-semibold text-[var(--text-muted)]"} aria-hidden="true">{isLoading ? "" : "—"}</p>}
          {key === "prescriptionShare" ? <p className="mt-1 text-[0.64rem] text-[var(--text-muted)]">{t("consultations.stats.prescriptionShareHelp")}</p> : null}
        </article>
      ))}
    </section>
  );
}
