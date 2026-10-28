"use client";

import { ArrowLeft, Activity, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { useModelMonitoring } from "@/features/ai-analyses/hooks/use-model-monitoring";
import {
  DEFAULT_MONITORING_PERIOD,
  monitoringParams,
  type MonitoringMonths,
} from "@/features/ai-analyses/model-monitoring";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { ModelMonitoringContent, MonitoringPeriodSelect } from "./ModelMonitoringContent";

type AiModelMonitoringPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

// "Suivi des modèles": how the physicians of the workspace judge each AI
// model, month after month, to spot a model whose results are more and more
// corrected.
export function AiModelMonitoringPage({ accountType }: AiModelMonitoringPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const account = useAccountProfile();
  const initials = getAccountInitials(currentUser.data?.fullName);
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  const [months, setMonths] = useState<MonitoringMonths>(DEFAULT_MONITORING_PERIOD);
  const params = useMemo(() => monitoringParams(months, new Date()), [months]);
  const query = useModelMonitoring(params);

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: account.data?.establishment?.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  return (
    <DashboardShell
      {...shellProps}
      activeKey="aiMonitoring"
      breadcrumbLabel={t("aiAnalyses.monitoring.breadcrumb")}
      titleKey="aiAnalyses.monitoring.title"
    >
      <div className="space-y-6">
        <section className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                <Activity className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {t("aiAnalyses.monitoring.context")}
                </span>
                <h1 className="mt-1.5 break-words text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">
                  {t("aiAnalyses.monitoring.title")}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{t("aiAnalyses.monitoring.subtitle")}</p>
              </div>
            </div>
            <Link href={`${roleBase}/ai-analyses`} className="clinical-button bg-[var(--panel)] lg:justify-self-end">
              <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
              {t("aiAnalyses.monitoring.backToHub")}
            </Link>
          </div>
        </section>

        <section className="surface-section p-4 sm:p-5">
          <MonitoringPeriodSelect months={months} onChange={setMonths} t={t} />
        </section>

        <ModelMonitoringContent accountType={accountType} locale={locale} query={query} scope="workspace" t={t} />
      </div>
    </DashboardShell>
  );
}
