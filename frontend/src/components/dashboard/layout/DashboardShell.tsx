"use client";

import { useState, type ReactNode } from "react";

import { type AccountType } from "@/types/auth";
import {
  type DashboardNavSection,
  type DashboardUserSummary,
} from "@/types/dashboard";
import { useDashboardSidebarPreference } from "@/lib/dashboard-preferences";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { DashboardContent } from "./DashboardContent";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";

type DashboardShellProps = {
  accountType: AccountType;
  activeKey: string;
  breadcrumbLabel?: string;
  children: ReactNode;
  navSections: DashboardNavSection[];
  titleKey: string;
  user: DashboardUserSummary;
};

export function DashboardShell({
  accountType,
  activeKey,
  breadcrumbLabel,
  children,
  navSections,
  titleKey,
  user,
}: DashboardShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const { isSidebarCollapsed, toggleSidebarCollapsed } =
    useDashboardSidebarPreference();
  const { locale, setLocale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);

  return (
    <main
      lang={locale}
      dir={direction}
      className="relative isolate min-h-screen overflow-x-clip bg-[var(--bg)] font-[var(--font-auth-sans)] text-[var(--ink)] before:fixed before:inset-0 before:-z-10 before:bg-[repeating-linear-gradient(103deg,rgba(71,63,47,0.024)_0,rgba(71,63,47,0.024)_1px,transparent_1px,transparent_8px)] before:opacity-70 before:content-[''] after:fixed after:inset-0 after:-z-20 after:bg-[radial-gradient(circle_at_8%_10%,rgba(255,255,255,0.76),transparent_28rem),radial-gradient(circle_at_92%_78%,rgba(31,111,92,0.075),transparent_34rem)] after:content-['']"
    >
      <div className="min-h-screen lg:flex lg:flex-row">
        <DashboardSidebar
          activeKey={activeKey}
          direction={direction}
          isCollapsed={isSidebarCollapsed}
          isOpen={isSidebarOpen}
          navSections={navSections}
          onClose={() => setSidebarOpen(false)}
          onToggleCollapse={toggleSidebarCollapsed}
          t={t}
          user={user}
        />
        <div className="min-w-0 flex-1">
          <DashboardHeader
            breadcrumbLabel={breadcrumbLabel}
            direction={direction}
            locale={locale}
            onLocaleChange={setLocale}
            onMenuOpen={() => setSidebarOpen(true)}
            t={t}
            title={t(titleKey)}
            user={{ ...user, accountType }}
          />
          <DashboardContent>{children}</DashboardContent>
        </div>
      </div>
    </main>
  );
}
