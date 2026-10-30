import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrescriptionView } from "./PrescriptionView";
import type { LocalPrescription } from "../types";

const prescription: LocalPrescription = {
  localId: "r1",
  patientId: "1",
  serverStatus: "VALIDATED",
  localStatus: "SYNCED",
  type: "STANDARD",
  number: "ORD-2026-000184",
  updatedAt: "2026-10-29T11:00:00.000Z",
  items: [{
    medicationId: "m", dci: "Amlodipine", brandName: "Amlor", strength: "5 mg", pharmaceuticalForm: "TABLET", route: "ORAL",
    regulatoryCategory: "STANDARD", dosePerIntake: "1 comprimé", frequency: "1 fois par jour", durationDays: 30, quantity: "1 boîte",
    asNeeded: false, renewalAllowed: false, substitutionAllowed: true,
  }],
};

describe("PrescriptionView", () => {
  it("reads in French: form and route labels, no enum value, and the read-only notice", () => {
    render(<PrescriptionView prescription={prescription} patientName="Yacine Mebarki" patientLocked={false} patient={null} identity={{ prescriber: null, organization: null }} />);
    expect(screen.getByText("5 mg · Comprimé · Orale")).toBeTruthy();
    expect(screen.getByText(/30 jours/)).toBeTruthy();
    expect(screen.getByText("Validée")).toBeTruthy();
    expect(screen.getByText("Lecture seule : cette ordonnance n’est plus un brouillon modifiable.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/TABLET|ORAL\b/);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
