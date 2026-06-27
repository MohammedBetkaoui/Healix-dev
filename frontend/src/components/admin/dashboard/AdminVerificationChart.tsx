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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {t("admin.dashboard.chart.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("admin.dashboard.chart.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0b3b5f]" />
            {t("admin.dashboard.chart.pending")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            {t("admin.dashboard.chart.verified")}
          </span>
        </div>
      </div>

      <div className="mt-8 flex h-64 items-end gap-4 border-b border-slate-200 px-2">
        {activity.map((item) => (
          <div key={item.date} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-52 w-full items-end justify-center gap-2">
              <span
                className="w-5 rounded-t-lg bg-[#0b3b5f]"
                style={{ height: `${(item.pending / maxValue) * 100}%` }}
              />
              <span
                className="w-5 rounded-t-lg bg-cyan-300"
                style={{ height: `${(item.verified / maxValue) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-500">
              {item.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
