"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Menu, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type DashboardNavSection, type DashboardUserSummary } from "@/types/dashboard";
import { DashboardThemeControl } from "./DashboardThemeControl";
import { WorkspaceSearch } from "./WorkspaceSearch";

type DashboardHeaderProps = {
  breadcrumbLabel?: string;
  direction: Direction;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onMenuOpen: () => void;
  isMenuOpen: boolean;
  navSections: DashboardNavSection[];
  t: TranslationFunction;
  title: string;
  user: DashboardUserSummary;
};

export function DashboardHeader({ breadcrumbLabel, locale, onLocaleChange, onMenuOpen, isMenuOpen, navSections, t, title, user }: DashboardHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const accountPath = user.accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  // The account menu repeats the verification and subscription entries of the
  // menu it shares the page with: an entry the caller's workspace access does
  // not hold stays out of it too (the sections arrive already filtered — a
  // doctor menu holds both, untagged, so a doctor keeps both links).
  const menuHrefs = new Set(
    navSections.flatMap((section) => section.items.map((item) => item.href)),
  );
  const showVerificationLink = menuHrefs.has(`${accountPath}/verification`);
  const showSubscriptionLink = menuHrefs.has(`${accountPath}/subscription`);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (event.target instanceof Node && !details.contains(event.target)) details.open = false;
      });
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        details.open = false;
        details.querySelector("summary")?.focus();
      });
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  return (
    <header ref={headerRef} className="clinical-header" aria-label={title}>
      <div className="clinical-header-inner">
        <button type="button" className="clinical-icon-button clinical-mobile-only shrink-0" onClick={onMenuOpen}
          aria-label={t("dashboard.common.actions.menu")} aria-expanded={isMenuOpen} aria-controls="clinical-sidebar">
          <Menu size={20} strokeWidth={1.8} />
        </button>
        <div className="clinical-header-context hidden min-w-0 shrink-0 md:block">
          <p className="text-[.68rem] text-[var(--text-secondary)]">{t(user.roleKey)}</p>
          <p className="mt-0.5 text-sm font-medium">{breadcrumbLabel ?? title}</p>
        </div>
        <div className="min-w-0 flex-1"><WorkspaceSearch sections={navSections} t={t} /></div>
        <LanguageSwitcher locale={locale} onLocaleChange={onLocaleChange} t={t} variant="compact" />
        <NotificationBell account={user.accountType === "ESTABLISHMENT" ? "establishment" : "doctor"} locale={locale} t={t} />
        <details className="relative shrink-0">
          <summary className="clinical-icon-button gap-1" aria-label={t("dashboard.clinical.userMenu")} title={t("dashboard.clinical.userMenu")}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--medical-soft)] text-[.65rem] font-semibold text-[var(--medical)]">{user.initials}</span>
            <ChevronDown size={12} className="hidden xl:block" />
          </summary>
          <div className="clinical-popover">
            <p className="break-words text-sm font-semibold">{user.name}</p>
            <p className="clinical-caption mb-4 mt-1">{t(user.roleKey)}</p>
            <DashboardThemeControl t={t} />
            {showVerificationLink ? (
              <Link href={accountPath + "/verification"} className="clinical-link mt-3 flex"><ShieldCheck size={16} strokeWidth={1.8} />{t("dashboard.clinical.actions.verification")}</Link>
            ) : null}
            {showSubscriptionLink ? (
              <Link href={accountPath + "/subscription"} className={`clinical-link${showVerificationLink ? "" : " mt-3"}`}>{t("dashboard.clinical.actions.subscription")}</Link>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  );
}
