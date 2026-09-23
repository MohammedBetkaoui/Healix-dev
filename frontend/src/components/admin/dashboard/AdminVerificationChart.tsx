import { type TranslationFunction } from "@/lib/i18n";
import { type AdminWeeklyVerificationActivity } from "@/types/admin";

type AdminVerificationChartProps = {
  activity: AdminWeeklyVerificationActivity[];
  t: TranslationFunction;
};

export function AdminVerificationChart({
  activity,
  t,
}: AdminVerificationChartProps) {
  const maxValue = Math.max(
    1,
    ...activity.flatMap((item) => [
      item.pending,
      item.verified,
      item.rejected,
    ]),
  );

  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("admin.dashboard.chart.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.dashboard.chart.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--warning)]" />
            {t("admin.dashboard.chart.pending")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
            {t("admin.dashboard.chart.verified")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
            {t("admin.dashboard.stats.rejected")}
          </span>
        </div>
      </div>

      <div className="mt-8 flex h-64 items-end gap-2 border-b border-border px-2" aria-hidden="true">
        {activity.map((item) => (
          <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-3">
            <div className="flex h-52 w-full items-end justify-center gap-1">
              <span
                className="w-3 max-w-full rounded-t-sm bg-[var(--warning)] sm:w-5"
                style={{ height: `${(item.pending / maxValue) * 100}%` }}
                title={`${t("admin.dashboard.chart.pending")}: ${item.pending}`}
              />
              <span
                className="w-3 max-w-full rounded-t-sm bg-[var(--success)] sm:w-5"
                style={{ height: `${(item.verified / maxValue) * 100}%` }}
                title={`${t("admin.dashboard.chart.verified")}: ${item.verified}`}
              />
              <span
                className="w-3 max-w-full rounded-t-sm bg-[var(--danger)] sm:w-5"
                style={{ height: `${(item.rejected / maxValue) * 100}%` }}
                title={`${t("admin.dashboard.stats.rejected")}: ${item.rejected}`}
              />
            </div>
            <span className="text-[0.65rem] font-medium text-muted-foreground">
              {item.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t("admin.dashboard.chart.title")}</caption>
        <thead><tr><th scope="col">{t("admin.dashboard.chart.title")}</th><th scope="col">{t("admin.dashboard.chart.pending")}</th><th scope="col">{t("admin.dashboard.chart.verified")}</th><th scope="col">{t("admin.dashboard.stats.rejected")}</th></tr></thead>
        <tbody>{activity.map((item) => <tr key={item.date}><th scope="row">{item.date}</th><td>{item.pending}</td><td>{item.verified}</td><td>{item.rejected}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
