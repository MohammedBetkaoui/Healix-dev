import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2, ChevronDown, Lock, LockKeyhole, Menu, Monitor, PanelLeftClose,
  PanelLeftOpen, RefreshCw, Search, TriangleAlert, Users, WifiOff, X,
} from "lucide-react";
import logo from "../../frontend/public/HealixDz-logo/logo_avec_titre.svg";
import logoMark from "../../frontend/public/HealixDz-logo/logo.svg";
import { cn, formatDate, initials } from "./dashboard-ui";
import { useDashboardTheme, type ThemePreference } from "./dashboard-theme";
import type { LocalPatient, SessionStatus, SyncStatus } from "./types";

// The Desktop counterpart of the Web workspace shell
// (frontend/src/components/dashboard/layout): same structure, same classes,
// same dashboard-theme.css. Only the content differs: one workspace, the
// patients synchronized on this device, and the offline sync status.

type Props = {
  session: SessionStatus;
  patients: LocalPatient[];
  selectedId?: string;
  query: string;
  sync: SyncStatus;
  onQuery: (value: string) => void;
  onSelect: (patient: LocalPatient) => void;
  onHome: () => void;
  onLock: () => void;
  onSync: () => void;
  children: ReactNode;
};

const SIDEBAR_KEY = "healixdz.dashboard.sidebar.collapsed";

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, String(!current));
      } catch {
        // The sidebar still collapses for this session.
      }
      return !current;
    });
  }, []);
  return { collapsed, toggle };
}

export function DashboardShell({ session, patients, selectedId, query, sync, onQuery, onSelect, onHome, onLock, onSync, children }: Props) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const name = session.user?.fullName ?? "Médecin";
  const workspace = session.workspace?.name ?? "";
  const title = selectedId ? "Dossier patient" : "Dossiers patients";

  return (
    <main lang="fr" dir="ltr" className="dashboard-theme clinical-theme relative isolate min-h-screen overflow-x-clip">
      <a href="#clinical-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:p-3">Aller au contenu</a>
      <div className="min-h-screen lg:flex lg:flex-row">
        <DashboardSidebar
          name={name}
          workspace={workspace}
          patients={patients}
          selectedId={selectedId}
          query={query}
          isCollapsed={collapsed}
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          onToggleCollapse={toggle}
          onHome={onHome}
          onSelect={onSelect}
          onLock={onLock}
        />
        <div className="min-w-0 flex-1" inert={isSidebarOpen}>
          <DashboardHeader
            name={name}
            workspace={workspace}
            title={title}
            query={query}
            isMenuOpen={isSidebarOpen}
            onMenuOpen={() => setSidebarOpen(true)}
            onQuery={onQuery}
            onLock={onLock}
          />
          <SyncBanner status={sync} onSync={onSync} />
          <div className="flex-1">
            <div id="clinical-content" tabIndex={-1} className="clinical-content w-full">
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function NavRow({ icon: Icon, label, hint, active, collapsed, locked, onClick, onNavigate }: {
  icon?: typeof Users;
  label: string;
  hint?: string;
  active: boolean;
  collapsed: boolean;
  locked?: boolean;
  onClick: () => void;
  onNavigate: () => void;
}) {
  const name = hint ? `${label}, ${hint}` : label;
  return (
    <button
      type="button"
      className={cn("clinical-nav-row relative w-full text-start", collapsed && "lg:justify-center lg:px-0")}
      title={name}
      aria-label={name}
      aria-current={active ? "page" : undefined}
      onClick={() => { onClick(); onNavigate(); }}
    >
      {Icon ? (
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      ) : (
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--panel-soft)] text-[.6rem] font-semibold">{initials(label)}</span>
      )}
      <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
        <span className="block truncate">{label}</span>
        {hint ? <span className="block truncate text-[.65rem] font-normal text-[var(--ink-faint)]">{hint}</span> : null}
      </span>
      {locked ? <LockKeyhole size={13} aria-hidden="true" className={cn("shrink-0", collapsed && "lg:hidden")} /> : null}
    </button>
  );
}

function DashboardSidebar({ name, workspace, patients, selectedId, query, isCollapsed, isOpen, onClose, onToggleCollapse, onHome, onSelect, onLock }: {
  name: string;
  workspace: string;
  patients: LocalPatient[];
  selectedId?: string;
  query: string;
  isCollapsed: boolean;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onHome: () => void;
  onSelect: (patient: LocalPatient) => void;
  onLock: () => void;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;
  // Open navigation (expanded or mobile drawer) -> logo with title, else the mark.
  const showFullLogo = !isCollapsed || isOpen;
  const collapseLabel = isCollapsed ? "Développer la navigation" : "Réduire la navigation";

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
      {isOpen ? <button type="button" tabIndex={-1} className="fixed inset-0 z-30 bg-[var(--scrim)] lg:hidden" onClick={onClose} aria-label="Fermer" /> : null}
      <aside
        ref={asideRef}
        id="clinical-sidebar"
        data-collapsed={isCollapsed}
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label="Navigation clinique"
        className={cn(
          "dashboard-chrome clinical-sidebar fixed inset-y-0 left-0 z-40 flex flex-col transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:translate-x-0 lg:self-start lg:visible",
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
            <button type="button" className="clinical-icon-button clinical-desktop-only" onClick={onToggleCollapse} aria-label={collapseLabel} title={collapseLabel} aria-expanded={!isCollapsed}>
              <CollapseIcon size={17} strokeWidth={1.8} className="clinical-directional" />
            </button>
            <button type="button" className="clinical-icon-button clinical-mobile-only" onClick={onClose} aria-label="Fermer">
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
          <div className={cn("mt-4 border-s-2 border-[var(--accent-line)] ps-3", isCollapsed && "lg:hidden")}>
            <p className="truncate text-sm font-medium" title={workspace}>{workspace}</p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">Espace médecin · Desktop</p>
          </div>
        </div>

        <nav aria-label="Espace de travail" className={cn("dashboard-sidebar-scroll flex-1 overflow-y-auto px-3 py-4", isCollapsed && "lg:px-2")}>
          <section className="mb-4 last:mb-0">
            <h2 className={cn("clinical-nav-heading", isCollapsed && "lg:sr-only")}>Espace de travail</h2>
            <NavRow icon={Users} label="Dossiers patients" active={!selectedId} collapsed={isCollapsed} onClick={onHome} onNavigate={onClose} />
          </section>
          <section className="mb-4 last:mb-0" aria-label="Patients disponibles">
            <h2 className={cn("clinical-nav-heading flex items-center justify-between", isCollapsed && "lg:sr-only")}>
              <span>Disponibles sur cet appareil</span>
              <span className="clinical-figure">{patients.length}</span>
            </h2>
            {patients.map((patient) => {
              const fullName = `${patient.firstName} ${patient.lastName}`;
              return (
                <NavRow
                  key={patient.id}
                  label={fullName}
                  hint={patient.locked ? "Dossier verrouillé" : patient.hospitalRecordNumber ?? "Sans numéro de dossier"}
                  active={selectedId === patient.id}
                  collapsed={isCollapsed}
                  locked={patient.locked}
                  onClick={() => onSelect(patient)}
                  onNavigate={onClose}
                />
              );
            })}
            {!patients.length ? (
              <p className={cn("px-3.5 py-2 text-xs text-[var(--ink-faint)]", isCollapsed && "lg:hidden")}>
                {query ? "Aucun patient trouvé." : "Aucun dossier disponible."}
              </p>
            ) : null}
          </section>
        </nav>

        <div className="mt-auto border-t border-[var(--line)] p-3">
          <div className={cn("mb-2 flex items-center gap-3 px-2 py-1", isCollapsed && "lg:justify-center lg:px-0")}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--panel-soft)] text-xs font-semibold">{initials(name)}</span>
            <div className={cn("min-w-0", isCollapsed && "lg:hidden")}>
              <p className="truncate text-xs font-medium" title={name}>{name}</p>
              <p className="mt-1 truncate text-[.65rem] text-[var(--ink-faint)]">Session sécurisée</p>
            </div>
          </div>
          <button type="button" className={cn("clinical-nav-row w-full", isCollapsed && "lg:justify-center")} onClick={onLock} aria-label="Verrouiller la session" title="Verrouiller la session">
            <LockKeyhole size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className={cn(isCollapsed && "lg:hidden")}>Verrouiller la session</span>
          </button>
        </div>
      </aside>
    </>
  );
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

function DashboardThemeControl() {
  const { preference, setPreference } = useDashboardTheme();
  return (
    <label className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)]">
      <Monitor className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" aria-hidden="true" />
      <span className="sr-only">Apparence</span>
      <select
        aria-label="Apparence"
        className="max-w-28 cursor-pointer bg-transparent py-2 text-xs font-medium outline-none"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {THEME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DashboardHeader({ name, workspace, title, query, isMenuOpen, onMenuOpen, onQuery, onLock }: {
  name: string;
  workspace: string;
  title: string;
  query: string;
  isMenuOpen: boolean;
  onMenuOpen: () => void;
  onQuery: (value: string) => void;
  onLock: () => void;
}) {
  const headerRef = useRef<HTMLElement>(null);

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
        <button type="button" className="clinical-icon-button clinical-mobile-only shrink-0" onClick={onMenuOpen} aria-label="Menu" aria-expanded={isMenuOpen} aria-controls="clinical-sidebar">
          <Menu size={20} strokeWidth={1.8} />
        </button>
        <div className="clinical-header-context hidden min-w-0 shrink-0 md:block">
          <p className="text-[.68rem] text-[var(--text-secondary)]">Espace médecin</p>
          <p className="mt-0.5 text-sm font-medium">{title}</p>
        </div>
        <div className="min-w-0 flex-1">
          <label className="workspace-search-trigger" htmlFor="patient-search">
            <Search size={17} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
            <span className="sr-only">Rechercher un patient</span>
            <input
              id="patient-search"
              className="min-w-0 flex-1 bg-transparent text-[inherit] outline-none placeholder:text-[var(--text-secondary)]"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Rechercher un patient…"
              autoComplete="off"
            />
          </label>
        </div>
        <details className="relative shrink-0">
          <summary className="clinical-icon-button gap-1" aria-label="Menu du compte" title="Menu du compte">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--medical-soft)] text-[.65rem] font-semibold text-[var(--medical)]">{initials(name)}</span>
            <ChevronDown size={12} className="hidden xl:block" />
          </summary>
          <div className="clinical-popover">
            <p className="break-words text-sm font-semibold">{name}</p>
            <p className="clinical-caption mb-4 mt-1">{workspace}</p>
            <DashboardThemeControl />
            <button type="button" className="clinical-link mt-3 flex" onClick={onLock}>
              <LockKeyhole size={16} strokeWidth={1.8} />Verrouiller la session
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}

// The strip above the page, like the Web subscription banner: where the
// offline workspace stands. Its tone follows the sync state, and the written
// state always accompanies the colour.
function SyncBanner({ status, onSync }: { status: SyncStatus; onSync: () => void }) {
  const syncing = status.state === "SYNCING";
  const label =
    syncing
      ? `Synchronisation… ${status.processed ?? 0} / ${status.total ?? status.pendingCount}`
      : status.state === "OFFLINE"
        ? "Hors ligne"
        : status.state === "SCOPE_REVOKED" || status.state === "LOCKED"
          ? `${status.lockedCount ?? 0} dossiers verrouillés hors périmètre`
          : status.state === "CONFLICT"
            ? `${status.conflictCount} éléments nécessitent votre attention`
            : "En ligne";
  const tone =
    status.state === "OFFLINE"
      ? { className: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]", icon: WifiOff }
      : status.state === "CONFLICT"
        ? { className: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]", icon: TriangleAlert }
        : status.state === "SCOPE_REVOKED" || status.state === "LOCKED"
          ? { className: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]", icon: Lock }
          : syncing
            ? { className: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]", icon: RefreshCw }
            : { className: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]", icon: CheckCircle2 };
  const Icon = tone.icon;

  return (
    <section
      aria-label="Synchronisation"
      data-sync={status.state.toLowerCase()}
      role={status.state === "CONFLICT" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6", tone.className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden="true" size={18} strokeWidth={1.9} className={cn("mt-0.5 shrink-0", syncing && "animate-spin")} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs opacity-90">
            {status.pendingCount ? `${status.pendingCount} modifications en attente` : "Toutes les données sont synchronisées"}
            {" · "}Dernière synchronisation : {formatDate(status.lastSyncedAt)}
          </p>
        </div>
      </div>
      <button type="button" className="clinical-button shrink-0 self-start disabled:opacity-60 sm:self-auto" disabled={syncing} onClick={onSync} title="Synchroniser les données">
        <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />Synchroniser
      </button>
    </section>
  );
}
