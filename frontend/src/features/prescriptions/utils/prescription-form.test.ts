import { type Medication, type PrescriptionItem } from "../types/prescription.types";
import {
  aggregateVerification,
  applyMedication,
  getItemIssues,
  itemFromPrescription,
  newItemDraft,
  toItemInput,
  typeFromItems,
} from "./prescription-form";

const amoxicillin: Medication = {
  brandName: "Clamoxyl",
  dci: "Amoxicilline",
  id: "med-1",
  manufacturer: "GSK",
  pharmaceuticalForm: "CAPSULE",
  reimbursable: "YES",
  regulatoryCategory: "STANDARD",
  requiresPriorApproval: "NO",
  route: "ORAL",
  source: "SEED",
  strength: "1 g",
};

const complete = () => ({
  ...applyMedication(newItemDraft("a"), amoxicillin),
  dosePerIntake: "1 gélule",
  durationDays: "7",
  frequency: "2 fois par jour",
  quantity: "14",
});

describe("item draft", () => {
  it("takes the identity of a reference medication and keeps the dosing", () => {
    const item = applyMedication({ ...newItemDraft("a"), dosePerIntake: "2" }, amoxicillin);
    expect(item).toMatchObject({ brandName: "Clamoxyl", dci: "Amoxicilline", dosePerIntake: "2", medicationId: "med-1", pharmaceuticalForm: "CAPSULE", requiresPriorApproval: "NO", strength: "1 g" });
  });

  it("lists the required fields that are missing", () => {
    expect(getItemIssues(newItemDraft("a"))).toEqual(["dci", "strength", "dosePerIntake", "frequency", "quantity"]);
    expect(getItemIssues(complete())).toEqual([]);
  });

  it("accepts an empty duration but refuses a zero, a decimal or an excessive one", () => {
    expect(getItemIssues({ ...complete(), durationDays: "" })).toEqual([]);
    for (const durationDays of ["0", "1.5", "4000", "abc"]) {
      expect(getItemIssues({ ...complete(), durationDays })).toEqual(["durationDays"]);
    }
  });

  it("builds the CreatePrescriptionItemDto body without empty optional fields", () => {
    expect(toItemInput({ ...complete(), indication: "  ", intakeMoment: "Le matin" })).toEqual({
      asNeeded: false,
      brandName: "Clamoxyl",
      dci: "Amoxicilline",
      dosePerIntake: "1 gélule",
      durationDays: 7,
      frequency: "2 fois par jour",
      indication: undefined,
      intakeMoment: "Le matin",
      manufacturer: "GSK",
      medicationId: "med-1",
      patientInstructions: undefined,
      pharmaceuticalForm: "CAPSULE",
      quantity: "14",
      regulatoryCategory: "STANDARD",
      renewalAllowed: false,
      route: "ORAL",
      strength: "1 g",
      substitutionAllowed: true,
    });
  });

  it("sends no duration when it is blank", () => {
    expect(toItemInput({ ...complete(), durationDays: "" }).durationDays).toBeUndefined();
  });

  it("rebuilds a line from a prescription of the API", () => {
    const saved: PrescriptionItem = {
      asNeeded: true,
      dosePerIntake: "1",
      durationDays: null,
      frequency: "x1",
      id: "i1",
      indication: null,
      intakeMoment: null,
      medication: { brandName: null, dci: "Tramadol", id: null, manufacturer: null, pharmaceuticalForm: "TABLET", regulatoryCategory: "PSYCHOTROPIC", route: "ORAL", strength: "50 mg" },
      patientInstructions: null,
      position: 1,
      quantity: "10",
      renewalAllowed: false,
      substitutionAllowed: false,
    };
    const item = itemFromPrescription("k", saved);
    expect(item).toMatchObject({ asNeeded: true, brandName: "", dci: "Tramadol", durationDays: "", key: "k", medicationId: undefined, regulatoryCategory: "PSYCHOTROPIC", substitutionAllowed: false });
    expect(getItemIssues(item)).toEqual([]);
  });
});

describe("prescription type", () => {
  it("follows the strictest category of the lines, like the API", () => {
    const line = (regulatoryCategory: Medication["regulatoryCategory"]) => ({ regulatoryCategory });
    expect(typeFromItems([])).toBe("STANDARD");
    expect(typeFromItems([line("STANDARD"), line("REGULATED")])).toBe("REGULATED");
    expect(typeFromItems([line("NARCOTIC"), line("PSYCHOTROPIC"), line("STANDARD")])).toBe("NARCOTIC");
  });
});

describe("aggregateVerification", () => {
  it("is yes if any is, unknown if any is unknown or nothing is known, else no", () => {
    expect(aggregateVerification(["NO", "YES"])).toBe("YES");
    expect(aggregateVerification(["NO", "UNKNOWN"])).toBe("UNKNOWN");
    expect(aggregateVerification([])).toBe("UNKNOWN");
    expect(aggregateVerification(["NO", "NO"])).toBe("NO");
  });
});
