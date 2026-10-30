import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, Search, TriangleAlert } from "lucide-react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ThemeControl } from "./components/ThemeControl";
import { Notice, initials } from "./dashboard-ui";
import { fr } from "./i18n/fr";
import { DashboardSidebar } from "./layout/DashboardSidebar";
import { routeTitle, type Route } from "./layout/navigation";
import type { LocalPatient, SessionStatus, SyncStatus } from "./types";
import { WEB_APP_URL } from "./web-app";

// Assembly of the Desktop workspace, the counterpart of the Web
// components/dashboard/layout/DashboardShell.tsx: sidebar, header, content.

type Props = {
  session: SessionStatus;
  route: Route;
  patient?: LocalPatient | null;
  patientCount: number;
  recentPatients: LocalPatient[];
  query: string;
  sync: SyncStatus;
  onQuery: (value: string) => void;
  onNavigate: (route: Route) => void;
  onOpenPatient: (patient: LocalPatient) => void;
  onOpenHealixAi: () => void;
  onLogout: () => void;
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

export function DashboardShell({
  session, route, patient, patientCount, recentPatients, query, sync,
  onQuery, onNavigate, onOpenPatient, onOpenHealixAi, onLogout, children,
}: Props) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const name = session.user?.fullName ?? fr.account.role;
  const workspace = session.workspace?.name ?? "";
  const title = routeTitle(route, patient);
  const offline = sync.state === "OFFLINE";

  return (
    <main lang="fr" dir="ltr" className="dashboard-theme clinical-theme relative isolate min-h-screen overflow-x-clip">
      <a href="#clinical-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:p-3">Aller au contenu</a>
      <div className="min-h-screen lg:flex lg:flex-row">
        <DashboardSidebar
          route={route}
          name={name}
          workspace={workspace}
          patientCount={patientCount}
          recentPatients={recentPatients}
          sync={sync}
          webAppUrl={WEB_APP_URL}
          isCollapsed={collapsed}
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          onToggleCollapse={toggle}
          onNavigate={onNavigate}
          onOpenPatient={onOpenPatient}
          onOpenHealixAi={onOpenHealixAi}
          onLogout={() => setConfirmingLogout(true)}
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
            onLogout={() => setConfirmingLogout(true)}
          />
          <div className="flex-1">
            <div id="clinical-content" tabIndex={-1} className="clinical-content w-full">
              {children}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingLogout}
        title={fr.account.logoutTitle}
        confirmLabel={fr.account.logout}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() => { setConfirmingLogout(false); onLogout(); }}
      >
        <p>{fr.account.logoutBody}</p>
        {offline || sync.pendingCount > 0 ? (
          <Notice tone="danger" icon={<TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}>
            {[offline ? fr.account.logoutOffline : null, sync.pendingCount > 0 ? fr.account.logoutPending(sync.pendingCount) : null]
              .filter(Boolean)
              .join(" ")}
          </Notice>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}

function DashboardHeader({ name, workspace, title, query, isMenuOpen, onMenuOpen, onQuery, onLogout }: {
  name: string;
  workspace: string;
  title: string;
  query: string;
  isMenuOpen: boolean;
  onMenuOpen: () => void;
  onQuery: (value: string) => void;
  onLogout: () => void;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (event.target instanceof Node && !details.contains(event.target)) details.open = false;
      });
    };
    const handleKeys = (event: KeyboardEvent) => {
      // Ctrl+K (⌘K): straight to the patient search.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (searchRef.current?.closest("[inert]") || document.querySelector("dialog[open]")) return;
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key !== "Escape") return;
      headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        details.open = false;
        details.querySelector("summary")?.focus();
      });
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", handleKeys);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", handleKeys);
    };
  }, []);

  return (
    <header ref={headerRef} className="clinical-header" aria-label={title}>
      <div className="clinical-header-inner">
        <button type="button" className="clinical-icon-button clinical-mobile-only shrink-0" onClick={onMenuOpen} aria-label={fr.nav.menu} aria-expanded={isMenuOpen} aria-controls="clinical-sidebar">
          <Menu size={20} strokeWidth={1.8} />
        </button>
        <div className="clinical-header-context hidden min-w-0 shrink-0 md:block">
          <p className="text-[.68rem] text-[var(--text-secondary)]">{fr.header.context}</p>
          <p className="mt-0.5 text-sm font-medium">{title}</p>
        </div>
        <div className="min-w-0 flex-1">
          <label className="workspace-search-trigger" htmlFor="patient-search" title={fr.header.searchLabel}>
            <Search size={17} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
            <span className="sr-only">{fr.header.searchLabel}</span>
            <input
              ref={searchRef}
              id="patient-search"
              className="min-w-0 flex-1 bg-transparent text-[inherit] outline-none placeholder:text-[var(--text-secondary)]"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder={fr.header.search}
              autoComplete="off"
            />
            <kbd className="hidden shrink-0 text-[.65rem] xl:block" dir="ltr">Ctrl K</kbd>
          </label>
        </div>
        <details className="relative shrink-0">
          <summary className="clinical-icon-button gap-1" aria-label={fr.account.menu} title={fr.account.menu}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--medical-soft)] text-[.65rem] font-semibold text-[var(--medical)]">{initials(name)}</span>
            <ChevronDown size={12} className="hidden xl:block" />
          </summary>
          <div className="clinical-popover">
            <p className="break-words text-sm font-semibold">{name}</p>
            <p className="clinical-caption mb-4 mt-1">{fr.account.role} · {workspace}</p>
            <ThemeControl />
            <button type="button" className="clinical-link mt-3 flex" onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onLogout();
            }}>
              <LogOut size={16} strokeWidth={1.8} />{fr.account.logout}
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
