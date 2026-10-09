"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import {
  buildTrackingSearch,
  parseTrackingState,
  TRACKING_TABS,
  type TrackingState,
} from "@/features/ai-analyses/runs-tracking";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { AiRunsAgreement } from "./AiRunsAgreement";
import { AiRunsWorklist } from "./AiRunsWorklist";

type AiRunsTrackingPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

// "Suivi des analyses": the AI analyses of the whole workspace. Its state
// (tab, filters, page, period) lives in the URL, so a view can be shared,
// bookmarked or reloaded as is.
export function AiRunsTrackingPage({ accountType }: AiRunsTrackingPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = parseTrackingState(searchParams);

  const update = (changes: Partial<TrackingState>) => {
    router.replace(`${pathname}${buildTrackingSearch({ ...state, ...changes })}`, { scroll: false });
  };

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  return (
    <DashboardShell
      {...shellProps}
      activeKey="aiTracking"
      breadcrumbLabel={t("aiAnalyses.tracking.breadcrumb")}
      titleKey="aiAnalyses.tracking.title"
    >
      <div className="workspace-stack">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{t("aiAnalyses.tracking.context")}</p>
            <h1 className="break-words">{t("aiAnalyses.tracking.title")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">{t("aiAnalyses.tracking.subtitle")}</p>
          </div>
          <Link href={`${roleBase}/ai-analyses`} className="clinical-button">
            <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
            {t("aiAnalyses.tracking.backToHub")}
          </Link>
        </header>

        <nav aria-label={t("aiAnalyses.tracking.tabsLabel")} className="flex flex-wrap gap-1 border-b border-[var(--border)]">
          {TRACKING_TABS.map((tab) => {
            const isCurrent = state.tab === tab;
            return (
              <Link
                key={tab}
                href={`${pathname}${buildTrackingSearch({ ...state, page: 1, tab })}`}
                replace
                scroll={false}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium",
                  isCurrent
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {t(`aiAnalyses.tracking.tabs.${tab}`)}
              </Link>
            );
          })}
        </nav>

        {state.tab === "worklist" ? (
          <AiRunsWorklist accountType={accountType} locale={locale} roleBase={roleBase} state={state} t={t} update={update} />
        ) : (
          <AiRunsAgreement accountType={accountType} locale={locale} state={state} t={t} update={update} />
        )}
      </div>
    </DashboardShell>
  );
}
