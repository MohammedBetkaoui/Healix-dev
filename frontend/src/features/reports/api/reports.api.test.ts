import { apiClient } from "@/lib/api/http-client";

import {
  amendReport,
  cancelReport,
  createReport,
  deleteReportDraft,
  FINALIZE_TIMEOUT_MS,
  finalizeReport,
  getReport,
  getReportCapabilities,
  getReportHistory,
  getReportPdf,
  getReportStats,
  importReport,
  listPatientReports,
  listReports,
  updateReport,
} from "./reports.api";

jest.mock("@/lib/api/http-client", () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

const client = apiClient as unknown as Record<"delete" | "get" | "patch" | "post", jest.Mock>;

beforeEach(() => {
  jest.resetAllMocks();
  for (const method of Object.values(client)) method.mockResolvedValue({ data: { ok: true } });
});

describe("reports api — reads", () => {
  it("lists with the filters as query parameters", async () => {
    const filters = { limit: 20, page: 2, query: "amin", status: "FINAL" as const };
    await expect(listReports(filters)).resolves.toEqual({ ok: true });
    expect(client.get).toHaveBeenCalledWith("/reports", { params: filters });
  });

  it("reads the stats, the capabilities and the reports of a patient", async () => {
    await getReportStats();
    await getReportCapabilities();
    await listPatientReports("p/1");
    expect(client.get).toHaveBeenNthCalledWith(1, "/reports/stats");
    expect(client.get).toHaveBeenNthCalledWith(2, "/reports/capabilities");
    expect(client.get).toHaveBeenNthCalledWith(3, "/reports/patients/p%2F1");
  });

  it("reads one report and its history", async () => {
    await getReport("r1");
    await getReportHistory("r1");
    expect(client.get).toHaveBeenNthCalledWith(1, "/reports/r1");
    expect(client.get).toHaveBeenNthCalledWith(2, "/reports/r1/history");
  });

  it("downloads the PDF as a blob", async () => {
    const blob = new Blob(["%PDF"]);
    client.get.mockResolvedValue({ data: blob });
    await expect(getReportPdf("r1")).resolves.toBe(blob);
    expect(client.get).toHaveBeenCalledWith("/reports/r1/pdf", { responseType: "blob" });
  });
});

describe("reports api — writes", () => {
  it("creates, patches and deletes a draft", async () => {
    const body = { patientId: "p1", title: "Note" };
    await createReport(body);
    await updateReport("r1", { conclusion: null });
    await deleteReportDraft("r1");
    expect(client.post).toHaveBeenCalledWith("/reports", body);
    expect(client.patch).toHaveBeenCalledWith("/reports/r1", { conclusion: null });
    expect(client.delete).toHaveBeenCalledWith("/reports/r1");
  });

  it("finalizes with a timeout long enough for the PDF rendering", async () => {
    await finalizeReport("r1");
    expect(client.post).toHaveBeenCalledWith("/reports/r1/finalize", undefined, { timeout: FINALIZE_TIMEOUT_MS });
    expect(FINALIZE_TIMEOUT_MS).toBeGreaterThan(10_000);
  });

  it("amends with a bare POST and cancels with the reason in the body", async () => {
    await amendReport("r1");
    await cancelReport("r1", "Erreur de saisie");
    expect(client.post).toHaveBeenNthCalledWith(1, "/reports/r1/amend");
    expect(client.post).toHaveBeenNthCalledWith(2, "/reports/r1/cancel", { reason: "Erreur de saisie" });
  });

  it("imports as a multipart form: the file, and only the fields that are filled", async () => {
    const file = new File(["%PDF-1.4"], "bilan.pdf", { type: "application/pdf" });
    await importReport({ category: "RADIOLOGY", effectiveDate: "2026-10-01", externalAuthor: "Dr Merad", file, notes: "", patientId: "p1", specialty: undefined, title: "Bilan" });

    const [url, form, options] = client.post.mock.calls[0] as [string, FormData, { headers: Record<string, string> }];
    expect(url).toBe("/reports/import");
    expect(options.headers["Content-Type"]).toBe("multipart/form-data");
    expect(form.get("file")).toBe(file);
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== "file"))).toEqual({
      category: "RADIOLOGY",
      effectiveDate: "2026-10-01",
      externalAuthor: "Dr Merad",
      patientId: "p1",
      title: "Bilan",
    });
  });

  it("lets an API error through to the caller", async () => {
    const failure = new Error("409");
    client.post.mockRejectedValue(failure);
    await expect(amendReport("r1")).rejects.toBe(failure);
  });
});
