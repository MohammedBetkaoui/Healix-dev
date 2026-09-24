"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

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
import { WorkspaceNavigationContext } from "./WorkspaceLink";

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
  const [unavailableModule, setUnavailableModule] = useState("");
  const moduleDialog = useRef<HTMLDialogElement>(null);
  const moduleTrigger = useRef<HTMLElement | null>(null);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const showUnavailableModule = useCallback((label: string) => {
    moduleTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setUnavailableModule(label);
    moduleDialog.current?.showModal();
  }, []);
  const restoreModuleFocus = () => {
    const trigger = moduleTrigger.current;
    if (trigger?.isConnected && trigger.getClientRects().length && getComputedStyle(trigger).visibility === "visible" && !trigger.closest("[inert]")) {
      trigger.focus();
    } else {
      // A link in the mobile drawer is hidden once its placeholder dialog closes.
      document.querySelector<HTMLButtonElement>('button[aria-controls="clinical-sidebar"]')?.focus();
    }
  };
  const { isSidebarCollapsed, toggleSidebarCollapsed } =
    useDashboardSidebarPreference();
  const { locale, setLocale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);

  return (
    <WorkspaceNavigationContext value={showUnavailableModule}>
      <main
        lang={locale}
        dir={direction}
        className="dashboard-theme clinical-theme relative isolate min-h-screen overflow-x-clip"
      >
        <a href="#clinical-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:p-3">{t("dashboard.clinical.skip")}</a>
        <div className="min-h-screen lg:flex lg:flex-row">
          <DashboardSidebar
            activeKey={activeKey}
            direction={direction}
            isCollapsed={isSidebarCollapsed}
            isOpen={isSidebarOpen}
            navSections={navSections}
            onClose={closeSidebar}
            onToggleCollapse={toggleSidebarCollapsed}
            t={t}
            user={user}
          />
          <div className="min-w-0 flex-1" inert={isSidebarOpen}>
            <DashboardHeader
              breadcrumbLabel={breadcrumbLabel}
              direction={direction}
              locale={locale}
              onLocaleChange={setLocale}
              onMenuOpen={() => setSidebarOpen(true)}
              isMenuOpen={isSidebarOpen}
              navSections={navSections}
              t={t}
              title={t(titleKey)}
              user={{ ...user, accountType }}
            />
            <DashboardContent>
              {activeKey === "verification" || (activeKey === "dashboard" && accountType !== "ESTABLISHMENT") ? (
                <h1 className="mb-5 text-xl font-semibold text-[var(--text-primary)]">{t(titleKey)}</h1>
              ) : null}
              {children}
            </DashboardContent>
          </div>
        </div>
        <dialog ref={moduleDialog} onClose={restoreModuleFocus} className="workspace-search-dialog surface-raised" aria-labelledby="module-title" aria-describedby="module-description">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="module-title" className="text-base font-semibold">{unavailableModule}</h2>
            <button type="button" className="clinical-icon-button" onClick={() => moduleDialog.current?.close()} aria-label={t("dashboard.clinical.close")}><X size={18} /></button>
          </div>
          <p className="mb-2 text-sm font-medium text-[var(--medical)]">{t("dashboard.clinical.comingSoon")}</p>
          <p id="module-description" className="clinical-caption">{t("dashboard.clinical.moduleNotice")}</p>
        </dialog>
      </main>
    </WorkspaceNavigationContext>
  );
}
