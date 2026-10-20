import { CalendarRange, CircleAlert, FileClock, FileX2, RefreshCw } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type PrescriptionStatsProps = {
  alerts: number;
  canceled: number;
  drafts: number;
  month: number;
  renewSoon: number;
  t: TranslationFunction;
};

const stats = [
  { key: "month", label: "prescriptions.stats.month", icon: CalendarRange },
  { key: "drafts", label: "prescriptions.stats.drafts", icon: FileClock },
  { key: "renewSoon", label: "prescriptions.stats.renewSoon", icon: RefreshCw },
  { key: "canceled", label: "prescriptions.stats.canceled", icon: FileX2 },
  { key: "alerts", label: "prescriptions.stats.alerts", icon: CircleAlert },
] as const;

export function PrescriptionStats(props: PrescriptionStatsProps) {
  return (
    <dl className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-2 xl:grid-cols-5">
      {stats.map(({ key, label, icon: Icon }, index) => (
        <div key={key} className="min-w-0 border-b border-[var(--border)] p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-e sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-e xl:last:border-e-0">
          <dt className="flex items-center gap-2 text-[.72rem] font-medium text-[var(--text-secondary)]">
            <Icon className={index === 4 ? "text-[var(--warning-ink)]" : "text-[var(--medical)]"} size={15} strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{props.t(label)}</span>
          </dt>
          <dd className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xl font-semibold text-[var(--text-primary)]">{new Intl.NumberFormat().format(props[key])}</span>
            <span className="text-[.64rem] text-[var(--text-muted)]">{props.t("prescriptions.stats.clinicalScope")}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

