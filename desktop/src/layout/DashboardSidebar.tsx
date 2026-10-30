import { useEffect, useRef, useState } from "react";
import { ExternalLink, LockKeyhole, LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import logo from "../../../frontend/public/HealixDz-logo/logo_avec_titre.svg";
import logoMark from "../../../frontend/public/HealixDz-logo/logo.svg";
import { CountBadge, WebBadge } from "../components/badges";
import { cn, initials } from "../dashboard-ui";
import { fr } from "../i18n/fr";
import { relativeTime } from "../relative-time";
import type { LocalPatient, SyncStatus } from "../types";
import { activeNavKey, navSections, type NavItem, type Route } from "./navigation";

// The Desktop counterpart of frontend/src/components/dashboard/layout/
// DashboardSidebar.tsx: same markup and classes (dashboard-theme.css), with
// buttons instead of Next links and the Desktop's own entries.

export type SidebarProps = {
  route: Route;
  name: string;
  workspace: string;
  patientCount: number;
  recentPatients: LocalPatient[];
  sync: SyncStatus;
  // Address of the Web platform; null hides the Healix AI entry.
  webAppUrl: string | null;
  isCollapsed: boolean;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onNavigate: (route: Route) => void;
  onOpenPatient: (patient: LocalPatient) => void;
  onOpenHealixAi: () => void;
  onLogout: () => void;
};

// While collapsed, a count badge becomes a coloured dot in the row's corner.
const collapsedDot = "lg:absolute lg:end-1.5 lg:top-1.5 lg:h-2 lg:min-w-0 lg:w-2 lg:px-0 lg:text-[0px]";

function connection(sync: SyncStatus) {
  switch (sync.state) {
    case "SYNCING":
      return { label: fr.connection.syncing(sync.processed ?? 0, sync.total ?? sync.pendingCount), tone: "warning" as const };
    case "OFFLINE":
      return { label: fr.connection.offline, tone: "warning" as const };
    case "CONFLICT":
      return { label: fr.connection.conflict, tone: "danger" as const };
    case "AUTH_EXPIRED":
      return { label: fr.connection.expired, tone: "danger" as const };
    case "LOCKED":
    case "SCOPE_REVOKED":
      return { label: fr.connection.outOfScope, tone: "warning" as const };
    default:
      return { label: fr.connection.online, tone: "success" as const };
  }
}

const connectionTones = {
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
} as const;

const connectionDots = {
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--danger)]",
} as const;

// The relative "last sync" text refreshes on its own.
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function NavRow({ item, props }: { item: NavItem; props: SidebarProps }) {
  const { route, isCollapsed: collapsed, sync, patientCount, webAppUrl, onNavigate, onOpenHealixAi, onClose } = props;
  const Icon = item.icon;
  const label = fr.nav.items[item.key];
  const active = !item.external && activeNavKey(route) === item.key;
  const offline = sync.state === "OFFLINE";

  let badge: { count: number; label: string; tone: "medical" | "danger" } | null = null;
  if (item.key === "patients" && patientCount > 0) {
    badge = { count: patientCount, label: fr.nav.patientsOnDevice(patientCount), tone: "medical" };
  } else if (item.key === "sync" && sync.conflictCount > 0) {
    badge = { count: sync.conflictCount, label: fr.nav.conflicts(sync.conflictCount), tone: "danger" };
  } else if (item.key === "sync" && sync.pendingCount > 0) {
    badge = { count: sync.pendingCount, label: fr.nav.pendingOperations(sync.pendingCount), tone: "medical" };
  }

  if (item.external && !webAppUrl) return null;
  const disabled = Boolean(item.external && offline);
  // The badges are part of the name: they stay announced when the row is collapsed.
  const name = [
    item.external ? `${label} (${fr.nav.webBadge}, ${fr.nav.aiOpens})` : label,
    badge?.label,
    disabled ? fr.nav.aiOffline : null,
  ].filter(Boolean).join(", ");

  return (
    <button
      type="button"
      className={cn(
        "clinical-nav-row relative w-full text-start disabled:cursor-not-allowed disabled:opacity-60",
        collapsed && "lg:justify-center lg:px-0",
      )}
      title={disabled ? fr.nav.aiOffline : name}
      aria-label={name}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={() => {
        if (item.external) onOpenHealixAi();
        else onNavigate({ name: item.key } as Route);
        onClose();
      }}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{label}</span>
      {item.external ? (
        <>
          <WebBadge className={cn(collapsed && "lg:hidden")} label={fr.nav.webBadge} />
          <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" className={cn("shrink-0", collapsed && "lg:hidden")} />
        </>
      ) : null}
      {badge ? <CountBadge count={badge.count} label={badge.label} tone={badge.tone} className={cn(collapsed && collapsedDot)} /> : null}
    </button>
  );
}

export function DashboardSidebar(props: SidebarProps) {
  const { route, name, workspace, recentPatients, sync, isCollapsed, isOpen, onClose, onToggleCollapse, onNavigate, onOpenPatient, onLogout } = props;
  const asideRef = useRef<HTMLElement>(null);
  const now = useNow(30_000);
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  // Open navigation (expanded or mobile drawer) -> logo with title, else the mark.
  const showFullLogo = !isCollapsed || isOpen;
  const collapseLabel = isCollapsed ? fr.nav.expand : fr.nav.collapse;
  const status = connection(sync);
  const lastSync = fr.connection.lastSync(relativeTime(sync.lastSyncedAt, now));
  const subtitle = `${fr.account.role} · ${workspace}`;

  // The drawer below 1024 px: focus trap, Escape, scroll lock, closes when the
  // window grows to the permanent layout.
  useEffect(() => {
    if (!isOpen) return;
    const aside = asideRef.current;
    if (!aside) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) onClose(); };
    const focusables = () => Array.from(aside.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"))
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
      {isOpen ? <button type="button" tabIndex={-1} className="fixed inset-0 z-30 bg-[var(--scrim)] lg:hidden" onClick={onClose} aria-label={fr.nav.close} /> : null}
      <aside
        ref={asideRef}
        id="clinical-sidebar"
        data-collapsed={isCollapsed}
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label={fr.nav.label}
        className={cn(
          "dashboard-chrome clinical-sidebar fixed inset-y-0 start-0 z-40 flex flex-col transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:translate-x-0 lg:self-start lg:visible",
          isOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="border-b border-[var(--line)] px-4 py-4">
          <div className={cn("flex items-center gap-2", isCollapsed && !isOpen && "lg:justify-center lg:flex-col")}>
            {showFullLogo ? (
              <span className={cn("min-w-0 flex-1", isCollapsed && "lg:hidden")}>
                <img src={logo} alt="HealixDz" className="h-14 w-auto max-w-[16rem] shrink-0 object-contain" />
              </span>
            ) : (
              <img src={logoMark} alt="HealixDz" className="h-11 w-11 shrink-0 object-cover object-center" />
            )}
            <button type="button" className="clinical-icon-button clinical-desktop-only" onClick={onToggleCollapse}
              aria-label={collapseLabel} title={collapseLabel} aria-expanded={!isCollapsed}>
              <CollapseIcon size={17} strokeWidth={1.8} className="clinical-directional" />
            </button>
            <button type="button" className="clinical-icon-button clinical-mobile-only" onClick={onClose} aria-label={fr.nav.close}>
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
          <div className={cn("mt-4 border-s-2 border-[var(--accent-line)] ps-3", isCollapsed && "lg:hidden")}>
            <p className="truncate text-sm font-medium" title={workspace}>{workspace}</p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">{fr.header.context}</p>
          </div>
        </div>
        <nav className={cn("dashboard-sidebar-scroll flex-1 overflow-y-auto px-3 py-4", isCollapsed && "lg:px-2")}>
          {navSections.map((section) => (
            <section key={section.key} className="mb-4 last:mb-0">
              <h2 className={cn("clinical-nav-heading", isCollapsed && "lg:sr-only")}>{fr.nav.sections[section.key]}</h2>
              {section.items.map((item) => <NavRow key={item.key} item={item} props={props} />)}
            </section>
          ))}
          {recentPatients.length ? (
            <section className="mb-4 last:mb-0" aria-label={fr.nav.sections.recent}>
              <h2 className={cn("clinical-nav-heading", isCollapsed && "lg:sr-only")}>{fr.nav.sections.recent}</h2>
              {recentPatients.map((patient) => {
                const patientName = `${patient.firstName} ${patient.lastName}`;
                const label = patient.locked ? `${patientName}, ${fr.nav.lockedRecord}` : patientName;
                return (
                  <button
                    key={patient.id}
                    type="button"
                    className={cn("clinical-nav-row relative w-full text-start", isCollapsed && "lg:justify-center lg:px-0")}
                    title={label}
                    aria-label={label}
                    aria-current={route.name === "patient" && route.id === patient.id ? "page" : undefined}
                    onClick={() => { onOpenPatient(patient); onClose(); }}
                  >
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--panel-soft)] text-[.6rem] font-semibold">{initials(patientName)}</span>
                    <span className={cn("min-w-0 flex-1 truncate", isCollapsed && "lg:hidden")}>{patientName}</span>
                    {patient.locked ? <LockKeyhole size={13} aria-hidden="true" className={cn("shrink-0", isCollapsed && "lg:hidden")} /> : null}
                  </button>
                );
              })}
            </section>
          ) : null}
        </nav>
        <div className="mt-auto border-t border-[var(--line)] p-3">
          <button
            type="button"
            className={cn(
              "mb-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-start text-xs font-medium",
              connectionTones[status.tone],
              isCollapsed && "lg:justify-center lg:px-0",
            )}
            data-connection={status.tone}
            title={`${status.label} — ${lastSync}`}
            aria-label={`${status.label}. ${lastSync}. ${fr.connection.openSync}`}
            onClick={() => { onNavigate({ name: "sync" }); onClose(); }}
          >
            <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", connectionDots[status.tone])} />
            <span className={cn("min-w-0 flex-1 truncate", isCollapsed && "lg:hidden")}>{status.label}</span>
          </button>
          <p className={cn("mb-3 px-1 text-[.65rem] text-[var(--ink-faint)]", isCollapsed && "lg:hidden")}>{lastSync}</p>
          <div className={cn("mb-2 flex items-center gap-3 px-2 py-1", isCollapsed && "lg:justify-center lg:px-0")}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--panel-soft)] text-xs font-semibold">{initials(name)}</span>
            <div className={cn("min-w-0", isCollapsed && "lg:hidden")}>
              <p className="truncate text-xs font-medium" title={name}>{name}</p>
              <p className="mt-1 truncate text-[.65rem] text-[var(--ink-faint)]" title={subtitle}>{subtitle}</p>
            </div>
          </div>
          <button type="button" className={cn("clinical-nav-row w-full", isCollapsed && "lg:justify-center")}
            onClick={onLogout} aria-label={fr.account.logout} title={fr.account.logout}>
            <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className={cn(isCollapsed && "lg:hidden")}>{fr.account.logout}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
