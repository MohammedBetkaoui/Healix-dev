"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { ModelMonitoringContent, MonitoringPeriodSelect } from "@/components/ai-analyses/monitoring/ModelMonitoringContent";
import { useAdminModelMonitoring } from "@/features/admin/hooks/use-admin-model-monitoring";
import {
  DEFAULT_MONITORING_PERIOD,
  monitoringParams,
  type MonitoringMonths,
} from "@/features/ai-analyses/model-monitoring";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

// The same board over every workspace: a model whose results are more and
// more corrected shows here before any single workspace has enough decisions.
export function AdminAiMonitoringPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [months, setMonths] = useState<MonitoringMonths>(DEFAULT_MONITORING_PERIOD);
  const params = useMemo(() => monitoringParams(months, new Date()), [months]);
  const query = useAdminModelMonitoring(params);

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.aiMonitoring")}`}
      titleKey="admin.aiMonitoring.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("admin.aiMonitoring.page.subtitle")}</p>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <MonitoringPeriodSelect months={months} onChange={setMonths} t={t} />
        </section>
        <ModelMonitoringContent locale={locale} query={query} scope="global" t={t} />
      </div>
    </AdminShell>
  );
}
