import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DashboardSidebar, type SidebarProps } from "./DashboardSidebar";
import { MAX_RECENT_PATIENTS, pushRecentPatient } from "./navigation";
import { resolveWebAppUrl, healixAiUrl } from "../web-app";
import type { LocalPatient, SyncStatus } from "../types";

const patient = (id: string, extra: Partial<LocalPatient> = {}): LocalPatient => ({
  id,
  firstName: `Prénom${id}`,
  lastName: `Nom${id}`,
  firstNameAr: "",
  lastNameAr: "",
  birthDate: "1990-01-01",
  serverUpdatedAt: "2026-10-30T10:00:00Z",
  lastSyncedAt: "2026-10-30T10:00:00Z",
  ...extra,
});

const online: SyncStatus = { state: "ONLINE", pendingCount: 0, conflictCount: 0, lastSyncedAt: new Date().toISOString() };

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    route: { name: "today" },
    name: "Amina Haddad",
    workspace: "Cabinet El Feth",
    patientCount: 0,
    recentPatients: [],
    sync: online,
    webAppUrl: "https://app.healixdz.dz",
    isCollapsed: false,
    isOpen: false,
    onClose: vi.fn(),
    onToggleCollapse: vi.fn(),
    onNavigate: vi.fn(),
    onOpenPatient: vi.fn(),
    onOpenHealixAi: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<DashboardSidebar {...props} />);
  return props;
}

const sidebar = () => screen.getByRole("complementary", { name: "Navigation clinique" });

describe("DashboardSidebar", () => {
  it("shows the four sections of the Web workspace and their entries", () => {
    renderSidebar();
    const headings = within(sidebar()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["Espace clinique", "Soins", "Intelligence", "Gestion"]);
    for (const label of ["Aujourd’hui", "Patients", "Rendez-vous", "Consultations", "Ordonnances", "Synchronisation", "Paramètres"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /^Healix AI/ })).toBeTruthy();
  });

  it("marks the active entry with aria-current, an open record under Patients", () => {
    renderSidebar({ route: { name: "patient", id: "1" }, patientCount: 3 });
    const active = within(sidebar()).getAllByRole("button").filter((button) => button.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute("aria-label")).toBe("Patients, 3 patients sur cet appareil");
  });

  it("navigates on click", () => {
    const props = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Paramètres" }));
    expect(props.onNavigate).toHaveBeenCalledWith({ name: "settings" });
  });

  it("counts pending operations on Synchronisation, and conflicts take precedence in red", () => {
    renderSidebar({ sync: { ...online, pendingCount: 4 } });
    const pending = screen.getByRole("img", { name: "4 opérations en attente" });
    expect(pending.textContent).toBe("4");
    expect(pending.getAttribute("data-tone")).toBe("medical");
  });

  it("shows the conflict badge instead of the pending one", () => {
    renderSidebar({ sync: { ...online, state: "CONFLICT", pendingCount: 4, conflictCount: 2 } });
    const conflict = screen.getByRole("img", { name: "2 conflits à résoudre" });
    expect(conflict.getAttribute("data-tone")).toBe("danger");
    expect(screen.queryByRole("img", { name: "4 opérations en attente" })).toBeNull();
  });

  it("disables Healix AI offline", () => {
    renderSidebar({ sync: { ...online, state: "OFFLINE" } });
    const ai = screen.getByRole("button", { name: /^Healix AI/ }) as HTMLButtonElement;
    expect(ai.disabled).toBe(true);
    expect(ai.title).toBe("Healix AI nécessite une connexion Internet");
  });

  it("hides Healix AI without a Web platform address", () => {
    renderSidebar({ webAppUrl: null });
    expect(screen.queryByRole("button", { name: /^Healix AI/ })).toBeNull();
  });

  it("keeps complete accessible names when collapsed", () => {
    renderSidebar({ isCollapsed: true, patientCount: 2, sync: { ...online, pendingCount: 1 } });
    expect(screen.getByRole("button", { name: "Patients, 2 patients sur cet appareil" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Synchronisation, 1 opération en attente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^En ligne\. Dernière synchro/ })).toBeTruthy();
  });

  it("lists the recent patients, most recent first", () => {
    const recent = ["1", "2", "3"].map((id) => patient(id));
    renderSidebar({ recentPatients: recent });
    const section = screen.getByRole("region", { name: "Patients récents" });
    const names = within(section).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Prénom1 Nom1", "Prénom2 Nom2", "Prénom3 Nom3"]);
  });

  it("opens the Synchronisation page from the connection status", () => {
    const props = renderSidebar({ sync: { ...online, state: "OFFLINE" } });
    fireEvent.click(screen.getByRole("button", { name: /^Hors ligne\./ }));
    expect(props.onNavigate).toHaveBeenCalledWith({ name: "sync" });
  });
});

describe("recent patients", () => {
  it("keeps five records at most, most recent first, without duplicates", () => {
    let recent: LocalPatient[] = [];
    for (const id of ["1", "2", "3", "4", "5", "6"]) recent = pushRecentPatient(recent, patient(id));
    recent = pushRecentPatient(recent, patient("3"));
    expect(recent.map((item) => item.id)).toEqual(["3", "6", "5", "4", "2"]);
    expect(recent).toHaveLength(MAX_RECENT_PATIENTS);
  });
});

describe("Web platform address", () => {
  it("requires HTTPS in a release build and defaults to localhost in development", () => {
    expect(resolveWebAppUrl({ DEV: false })).toBeNull();
    expect(resolveWebAppUrl({ DEV: false, VITE_WEB_APP_URL: "http://app.healixdz.dz" })).toBeNull();
    expect(resolveWebAppUrl({ DEV: false, VITE_WEB_APP_URL: "https://app.healixdz.dz/" })).toBe("https://app.healixdz.dz");
    expect(resolveWebAppUrl({ DEV: true })).toBe("http://localhost:3000");
  });

  it("opens the open record, or the analyses hub", () => {
    expect(healixAiUrl("https://app.healixdz.dz")).toBe("https://app.healixdz.dz/doctor/ai-analyses");
    expect(healixAiUrl("https://app.healixdz.dz", "p 1")).toBe("https://app.healixdz.dz/doctor/patients/p%201");
  });
});
