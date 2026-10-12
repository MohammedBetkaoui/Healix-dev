"use client";

import { ArrowLeft, BarChart3, ClipboardList, ShieldCheck } from "lucide-react";
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
      <div className="space-y-6">
        <section className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
                <ClipboardList className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {t("aiAnalyses.tracking.context")}
                </span>
                <h1 className="mt-1.5 break-words text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">
                  {t("aiAnalyses.tracking.title")}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{t("aiAnalyses.tracking.subtitle")}</p>
              </div>
            </div>
            <Link href={`${roleBase}/ai-analyses`} className="clinical-button bg-[var(--panel)] lg:justify-self-end">
              <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
              {t("aiAnalyses.tracking.backToHub")}
            </Link>
          </div>
        </section>

        <nav aria-label={t("aiAnalyses.tracking.tabsLabel")} className="surface-section grid gap-1.5 p-1.5 sm:grid-cols-2">
          {TRACKING_TABS.map((tab) => {
            const isCurrent = state.tab === tab;
            const Icon = tab === "worklist" ? ClipboardList : BarChart3;
            return (
              <Link
                key={tab}
                href={`${pathname}${buildTrackingSearch({ ...state, page: 1, tab })}`}
                replace
                scroll={false}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "group flex min-w-0 items-center gap-3 rounded-[var(--radius-sm)] border px-4 py-3.5 transition",
                  isCurrent
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)] shadow-sm"
                    : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:bg-[var(--panel-soft)] hover:text-[var(--ink)]",
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ring-1",
                  isCurrent
                    ? "bg-[var(--panel)] text-[var(--medical)] ring-[var(--accent-line)]"
                    : "bg-[var(--panel-soft)] text-[var(--ink-faint)] ring-[var(--line)] group-hover:text-[var(--medical)]",
                )}>
                  <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t(`aiAnalyses.tracking.tabs.${tab}`)}</span>
                  <span className="mt-0.5 hidden truncate text-xs font-normal text-[var(--ink-faint)] md:block">
                    {tab === "worklist"
                      ? t("aiAnalyses.tracking.worklist.caption")
                      : t("aiAnalyses.tracking.agreement.help")}
                  </span>
                </span>
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
