import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConsultationsPage, filterConsultations } from "./ConsultationsPage";
import * as api from "../desktop-api";
import { consultationSummary } from "../test/fixtures";

vi.mock("../desktop-api", () => ({ listConsultations: vi.fn() }));

const items = [
  consultationSummary("draft", "1", { chiefComplaint: "Toux", state: "DRAFT" }),
  consultationSummary("pending", "2", { chiefComplaint: "Douleur", state: "PENDING_SYNC" }),
  consultationSummary("synced", "3", { chiefComplaint: "Suivi", state: "SYNCED", editable: false, firstDiagnosis: "Bronchite" }),
  consultationSummary("conflict", "4", { chiefComplaint: "Fièvre", state: "CONFLICT", editable: false }),
];

beforeEach(() => {
  vi.mocked(api).listConsultations.mockResolvedValue(items);
});

const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("filterConsultations", () => {
  it("filters by state, then by patient, reason or diagnosis without accents or case", () => {
    expect(filterConsultations(items, "ALL", "").map((item) => item.localId)).toEqual(["draft", "pending", "synced", "conflict"]);
    expect(filterConsultations(items, "DRAFT", "").map((item) => item.localId)).toEqual(["draft"]);
    expect(filterConsultations(items, "CONFLICT", "").map((item) => item.localId)).toEqual(["conflict"]);
    expect(filterConsultations(items, "ALL", "BRONCHITE").map((item) => item.localId)).toEqual(["synced"]);
    expect(filterConsultations(items, "ALL", "fievre").map((item) => item.localId)).toEqual(["conflict"]);
    expect(filterConsultations(items, "ALL", "prénom2").map((item) => item.localId)).toEqual(["pending"]);
    expect(filterConsultations(items, "SYNCED", "toux")).toEqual([]);
  });
});

describe("ConsultationsPage", () => {
  it("shows a table with date, patient, reason, diagnosis and state, and counts per filter", async () => {
    render(<ConsultationsPage version={0} onOpen={vi.fn()} />);
    await screen.findByRole("table");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Date", "Patient", "Motif", "Diagnostic", "État",
    ]);
    expect(rows()).toHaveLength(4);
    expect(screen.getByText("Bronchite")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Tous/ }).textContent).toContain("4");
    expect(screen.getByRole("button", { name: /^Brouillons/ }).textContent).toContain("1");
  });

  it("filters by state and by search", async () => {
    render(<ConsultationsPage version={0} onOpen={vi.fn()} />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: /^Conflits/ }));
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Conflit")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Tous/ }));
    fireEvent.change(screen.getByPlaceholderText("Patient, motif, diagnostic…"), { target: { value: "prénom3" } });
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Synchronisée")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Patient, motif, diagnostic…"), { target: { value: "zzz" } });
    expect(screen.getByText("Aucune consultation ne correspond")).toBeTruthy();
  });

  it("opens a consultation from its row", async () => {
    const onOpen = vi.fn();
    render(<ConsultationsPage version={0} onOpen={onOpen} />);
    await screen.findByRole("table");
    fireEvent.click(rows()[2]);
    expect(onOpen).toHaveBeenCalledWith("synced");
  });

  it("shows an explicit empty state with no consultation at all", async () => {
    vi.mocked(api).listConsultations.mockResolvedValue([]);
    render(<ConsultationsPage version={0} onOpen={vi.fn()} />);
    expect(await screen.findByText("Aucune consultation sur cet appareil")).toBeTruthy();
  });
});
