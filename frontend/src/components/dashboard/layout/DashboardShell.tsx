"use client";

import { useMemo, useState, type ReactNode } from "react";

import { type AccountType } from "@/types/auth";
import {
  type DashboardNavSection,
  type DashboardUserSummary,
} from "@/types/dashboard";
import { useDashboardSidebarPreference } from "@/lib/dashboard-preferences";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

  const shellClasses = useMemo(
    () => "bg-[linear-gradient(180deg,#fafcfd_0%,#f6fafb_100%)] text-slate-950",
    [],
  );

  return (
    <main
      lang={locale}
      dir={direction}
      className={cn("min-h-screen", shellClasses)}
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
