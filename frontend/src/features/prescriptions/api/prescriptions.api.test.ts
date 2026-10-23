import { apiClient } from "@/lib/api/http-client";

import { MEDICATION_SEARCH_DEBOUNCE_MS } from "../hooks/use-medication-search";
import {
  cancelPrescription,
  createPrescription,
  deletePrescriptionDraft,
  getPatientContext,
  getPrescriberContext,
  getPrescription,
  getPrescriptionCapabilities,
  getPrescriptionHistory,
  getPrescriptionPdf,
  getPrescriptionStats,
  listPrescriptions,
  markPrescriptionPrinted,
  renewPrescription,
  searchMedications,
  submitPrescription,
  updatePrescription,
  validatePrescription,
  VALIDATE_TIMEOUT_MS,
} from "./prescriptions.api";

jest.mock("@/lib/api/http-client", () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

const client = apiClient as unknown as Record<"delete" | "get" | "patch" | "post", jest.Mock>;

beforeEach(() => {
  jest.resetAllMocks();
  for (const method of Object.values(client)) method.mockResolvedValue({ data: { ok: true } });
});

describe("prescriptions api — reads", () => {
  it("lists with the filters as query parameters", async () => {
    const filters = { limit: 20, page: 2, query: "amox", status: "VALIDATED" as const };
    await expect(listPrescriptions(filters)).resolves.toEqual({ ok: true });
    expect(client.get).toHaveBeenCalledWith("/prescriptions", { params: filters });
  });

  it("reads the stats and the capabilities", async () => {
    await getPrescriptionStats();
    await getPrescriptionCapabilities();
    expect(client.get).toHaveBeenNthCalledWith(1, "/prescriptions/stats");
    expect(client.get).toHaveBeenNthCalledWith(2, "/prescriptions/capabilities");
  });

  it("searches the reference with q and a limit, omitting an empty q", async () => {
    await searchMedications("para", 5);
    await searchMedications("");
    expect(client.get).toHaveBeenNthCalledWith(1, "/prescriptions/medications", { params: { limit: 5, q: "para" } });
    expect(client.get).toHaveBeenNthCalledWith(2, "/prescriptions/medications", { params: { limit: 20, q: undefined } });
  });

  it("reads the prescriber and the patient context, encoding ids", async () => {
    await getPrescriberContext();
    await getPatientContext("p/1");
    expect(client.get).toHaveBeenNthCalledWith(1, "/prescriptions/prescriber-context");
    expect(client.get).toHaveBeenNthCalledWith(2, "/prescriptions/patients/p%2F1/context");
  });

  it("reads one prescription and its history", async () => {
    await getPrescription("rx1");
    await getPrescriptionHistory("rx1");
    expect(client.get).toHaveBeenNthCalledWith(1, "/prescriptions/rx1");
    expect(client.get).toHaveBeenNthCalledWith(2, "/prescriptions/rx1/history");
  });

  it("downloads the PDF as a blob", async () => {
    const blob = new Blob(["%PDF"]);
    client.get.mockResolvedValue({ data: blob });
    await expect(getPrescriptionPdf("rx1")).resolves.toBe(blob);
    expect(client.get).toHaveBeenCalledWith("/prescriptions/rx1/pdf", { responseType: "blob" });
  });
});

describe("prescriptions api — writes", () => {
  const item = { dci: "Paracétamol", dosePerIntake: "1 comprimé", frequency: "3 fois par jour", pharmaceuticalForm: "TABLET" as const, quantity: "1 boîte", regulatoryCategory: "STANDARD" as const, route: "ORAL" as const, strength: "500 mg" };

  it("creates a draft and patches it", async () => {
    const body = { items: [item], patientId: "p1" };
    await createPrescription(body);
    await updatePrescription("rx1", { encounterId: null, items: [item] });
    expect(client.post).toHaveBeenCalledWith("/prescriptions", body);
    expect(client.patch).toHaveBeenCalledWith("/prescriptions/rx1", { encounterId: null, items: [item] });
  });

  it("deletes a draft", async () => {
    await deletePrescriptionDraft("rx1");
    expect(client.delete).toHaveBeenCalledWith("/prescriptions/rx1");
  });

  it("submits, renews and marks as printed with a bare POST", async () => {
    await submitPrescription("rx1");
    await renewPrescription("rx1");
    await markPrescriptionPrinted("rx1");
    expect(client.post).toHaveBeenNthCalledWith(1, "/prescriptions/rx1/submit");
    expect(client.post).toHaveBeenNthCalledWith(2, "/prescriptions/rx1/renew");
    expect(client.post).toHaveBeenNthCalledWith(3, "/prescriptions/rx1/printed");
  });

  it("validates with a timeout long enough for the PDF rendering", async () => {
    await validatePrescription("rx1");
    expect(client.post).toHaveBeenCalledWith("/prescriptions/rx1/validate", undefined, { timeout: VALIDATE_TIMEOUT_MS });
    expect(VALIDATE_TIMEOUT_MS).toBeGreaterThan(10_000);
  });

  it("cancels with the reason in the body", async () => {
    await cancelPrescription("rx1", "Erreur de dosage");
    expect(client.post).toHaveBeenCalledWith("/prescriptions/rx1/cancel", { reason: "Erreur de dosage" });
  });

  it("lets an API error through to the caller", async () => {
    const failure = new Error("409");
    client.post.mockRejectedValue(failure);
    await expect(submitPrescription("rx1")).rejects.toBe(failure);
  });
});

describe("medication search", () => {
  it("waits 300 ms after the last keystroke", () => {
    expect(MEDICATION_SEARCH_DEBOUNCE_MS).toBe(300);
  });
});
