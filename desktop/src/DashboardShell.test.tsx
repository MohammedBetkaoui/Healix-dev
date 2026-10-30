import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardShell } from "./DashboardShell";
import type { SyncStatus } from "./types";

const online: SyncStatus = { state: "ONLINE", pendingCount: 0, conflictCount: 0, lastSyncedAt: null };

function renderShell(sync: SyncStatus = online) {
  const onLogout = vi.fn();
  render(
    <DashboardShell
      session={{ authorized: true, user: { id: "u", fullName: "Amina Haddad", email: "a@x.dz" }, workspace: { id: "w", name: "Cabinet El Feth" } }}
      route={{ name: "today" }}
      patientCount={0}
      recentPatients={[]}
      query=""
      sync={sync}
      onQuery={vi.fn()}
      onNavigate={vi.fn()}
      onOpenPatient={vi.fn()}
      onOpenHealixAi={vi.fn()}
      onLogout={onLogout}
    >
      <p>Contenu</p>
    </DashboardShell>,
  );
  return { onLogout };
}

const openLogout = () => {
  const sidebarLogout = screen.getAllByRole("button", { name: "Se déconnecter" })[0];
  fireEvent.click(sidebarLogout);
  return screen.getByRole("dialog");
};

describe("logout confirmation", () => {
  it("asks first, with Cancel focused, and Cancel does not log out", () => {
    const { onLogout } = renderShell();
    const dialog = openLogout();
    expect(dialog.textContent).toContain("Se déconnecter de HealixDz Desktop ?");
    const cancel = screen.getByRole("button", { name: "Annuler" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("logs out once confirmed", () => {
    const { onLogout } = renderShell();
    const dialog = openLogout();
    const confirm = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "Se déconnecter");
    fireEvent.click(confirm!);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("warns in red when offline or with operations still to send", () => {
    renderShell({ ...online, state: "OFFLINE", pendingCount: 3 });
    openLogout();
    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("Vous êtes hors ligne : vous ne pourrez pas vous reconnecter avant le retour d’Internet.");
    expect(warning.textContent).toContain("3 opérations non synchronisées resteront sur cet appareil.");
  });

  it("shows no warning online with nothing pending", () => {
    renderShell();
    openLogout();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("header", () => {
  it("follows the current page and Ctrl+K focuses the patient search", () => {
    renderShell();
    expect(document.querySelector("header.clinical-header")?.getAttribute("aria-label")).toBe("Aujourd’hui");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(document.activeElement?.id).toBe("patient-search");
  });
});
