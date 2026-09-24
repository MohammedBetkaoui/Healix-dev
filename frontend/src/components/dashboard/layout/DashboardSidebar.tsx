"use client";

import { useEffect, useRef } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { WorkspaceLink as Link } from "./WorkspaceLink";

import { HealixLogo } from "@/components/shared/HealixLogo";

import { useLogout } from "@/features/auth/hooks/use-logout";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardNavItem, type DashboardNavSection, type DashboardUserSummary } from "@/types/dashboard";

type DashboardSidebarProps = {
  activeKey: string;
  direction: Direction;
  isCollapsed: boolean;
  isOpen: boolean;
  navSections: DashboardNavSection[];
  onClose: () => void;
  onToggleCollapse: () => void;
  t: TranslationFunction;
  user: DashboardUserSummary;
};

function NavRow({ item, active, collapsed, onNavigate, t }: {
  item: DashboardNavItem; active: boolean; collapsed: boolean; onNavigate: () => void; t: TranslationFunction;
}) {
  const Icon = item.icon;
  const label = t(item.labelKey);
  return (
    <Link href={item.href} className={cn("clinical-nav-row", collapsed && "lg:justify-center lg:px-0")}
      title={label} aria-label={label} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{label}</span>
    </Link>
  );
}

export function DashboardSidebar({ activeKey, direction, isCollapsed, isOpen, navSections, onClose, onToggleCollapse, t, user }: DashboardSidebarProps) {
  const { isLoading: isLogoutLoading, logout } = useLogout();
  const asideRef = useRef<HTMLElement>(null);
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  const logoutItem = navSections.flatMap((section) => section.items).find((item) => item.key === "logout");
  // Navbar ouverte (étendue ou drawer mobile) -> logo avec titre, sinon logo sans titre.
  const showFullLogo = !isCollapsed || isOpen;

  useEffect(() => {
    if (!isOpen) return;
    const aside = asideRef.current;
    if (!aside) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) onClose(); };
    const focusables = () => Array.from(aside.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'))
      .filter((element) => element.getClientRects().length > 0);
    document.body.style.overflow = "hidden";
    focusables()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    aside.addEventListener("keydown", handleKey);
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.body.style.overflow = previousOverflow;
      aside.removeEventListener("keydown", handleKey);
      desktop.removeEventListener("change", closeOnDesktop);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <>
      {isOpen ? <button type="button" tabIndex={-1} className="fixed inset-0 z-30 bg-[var(--scrim)] lg:hidden"
        onClick={onClose} aria-label={t("dashboard.clinical.close")} /> : null}
      <aside ref={asideRef} id="clinical-sidebar" data-collapsed={isCollapsed}
        role={isOpen ? "dialog" : undefined} aria-modal={isOpen ? true : undefined}
        aria-label={t("dashboard.clinical.navigation")}
        className={cn("dashboard-chrome clinical-sidebar fixed inset-y-0 z-40 flex flex-col transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:translate-x-0 lg:self-start lg:visible",
          direction === "rtl" ? "right-0" : "left-0",
          isOpen ? "visible translate-x-0" : direction === "rtl" ? "invisible translate-x-full" : "invisible -translate-x-full")}>
        <div className="border-b border-[var(--line)] px-4 py-4">
          <div className={cn("flex items-center gap-2", isCollapsed && !isOpen && "lg:justify-center lg:flex-col")}>
            {showFullLogo ? (
              <span className={cn("min-w-0 flex-1", isCollapsed && "lg:hidden")}>
                <HealixLogo variant="full" priority />
              </span>
            ) : (
              <HealixLogo variant="mark" priority />
            )}
            <button type="button" className="clinical-icon-button clinical-desktop-only" onClick={onToggleCollapse}
              aria-label={t(isCollapsed ? "dashboard.sidebar.expand" : "dashboard.sidebar.collapse")}
              title={t(isCollapsed ? "dashboard.sidebar.expand" : "dashboard.sidebar.collapse")} aria-expanded={!isCollapsed}>
              <CollapseIcon size={17} strokeWidth={1.8} className="clinical-directional" />
            </button>
            <button type="button" className="clinical-icon-button clinical-mobile-only" onClick={onClose} aria-label={t("dashboard.clinical.close")}>
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
          <div className={cn("mt-4 border-s-2 border-[var(--accent-line)] ps-3", isCollapsed && "lg:hidden")}>
            <p className="truncate text-sm font-medium" title={user.workspaceSubtitle}>{user.workspaceSubtitle}</p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">{t(user.roleKey)}</p>
          </div>
        </div>
        <nav className={cn("dashboard-sidebar-scroll flex-1 overflow-y-auto px-3 py-4", isCollapsed && "lg:px-2")}>
          {navSections.map((section) => (
            <section key={section.key} className="mb-4 last:mb-0">
              <h2 className={cn("clinical-nav-heading", isCollapsed && "lg:sr-only")}>{t(section.titleKey)}</h2>
              {section.items.filter((item) => item.key !== "logout").map((item) => (
                <NavRow key={item.key} item={item} active={item.key === activeKey} collapsed={isCollapsed} onNavigate={onClose} t={t} />
              ))}
            </section>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--line)] p-3">
          <div className={cn("mb-2 flex items-center gap-3 px-2 py-1", isCollapsed && "lg:justify-center lg:px-0")}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--panel-soft)] text-xs font-semibold">{user.initials}</span>
            <div className={cn("min-w-0", isCollapsed && "lg:hidden")}>
              <p className="truncate text-xs font-medium" title={user.name}>{user.name}</p>
              <p className="mt-1 truncate text-[.65rem] text-[var(--ink-faint)]">{user.footerSubtitle}</p>
            </div>
          </div>
          {logoutItem ? <button type="button" className={cn("clinical-nav-row w-full disabled:opacity-60", isCollapsed && "lg:justify-center")}
            disabled={isLogoutLoading} onClick={() => { void logout(); }} aria-label={t(logoutItem.labelKey)} title={t(logoutItem.labelKey)}>
            <logoutItem.icon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className={cn(isCollapsed && "lg:hidden")}>{t(logoutItem.labelKey)}{isLogoutLoading ? "…" : ""}</span>
          </button> : null}
        </div>
      </aside>
    </>
  );
}
