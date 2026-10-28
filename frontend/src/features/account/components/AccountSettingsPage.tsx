"use client";

import { Bell, Languages, type LucideIcon, MessageSquare, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { type AccountKind } from "../types/account.types";
import { ACCOUNT_TABS, type AccountTab, parseAccountTab, settingsHref } from "../utils/account-utils";
import { LanguageSection } from "./LanguageSection";
import { MessagingSection } from "./MessagingSection";
import { NotificationsSection } from "./NotificationsSection";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";

const TAB_ICONS: Record<AccountTab, LucideIcon> = {
  language: Languages,
  messaging: MessageSquare,
  notifications: Bell,
  profile: UserRound,
  security: ShieldCheck,
};

type AccountSettingsPageProps = { accountType: AccountKind };

export function AccountSettingsPage({ accountType }: AccountSettingsPageProps) {
  const { locale, setLocale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const account = useAccountProfile();
  const initials = getAccountInitials(currentUser.data?.fullName);
  // The address names the section (`?tab=security`): it can be shared.
  const tab = parseAccountTab(useSearchParams()?.get("tab"));

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
    <DashboardShell {...shellProps} activeKey="settings" breadcrumbLabel={t("account.page.breadcrumb")} titleKey="account.page.title">
      <div className="workspace-stack">
        <header>
          <p className="text-[0.7rem] font-semibold text-[var(--medical)]">{t("account.page.breadcrumb")}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[1.75rem]">{t("account.page.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{t("account.page.subtitle")}</p>
        </header>

        <nav aria-label={t("account.tabs.label")} className="-mx-1 overflow-x-auto px-1">
          <ul className="flex min-w-max gap-1 border-b border-[var(--border)]">
            {ACCOUNT_TABS.map((entry) => {
              const Icon = TAB_ICONS[entry];
              const active = entry === tab;
              return (
                <li key={entry}>
                  <Link
                    href={settingsHref(accountType, entry)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${active ? "border-[var(--accent)] text-[var(--accent-dark)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  >
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    {t(`account.tabs.${entry}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div id={`account-panel-${tab}`}>
          {tab === "profile" ? <ProfileSection accountType={accountType} t={t} /> : null}
          {tab === "security" ? <SecuritySection locale={locale} t={t} /> : null}
          {tab === "notifications" ? <NotificationsSection t={t} /> : null}
          {tab === "messaging" ? <MessagingSection accountType={accountType} locale={locale} t={t} /> : null}
          {tab === "language" ? <LanguageSection locale={locale} onChange={setLocale} t={t} /> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
