import { apiClient } from "@/lib/api/http-client";

import { getConsultation, getConsultationCapabilities, getConsultationStats, listConsultations } from "./consultations.api";

jest.mock("@/lib/api/http-client", () => ({ apiClient: { get: jest.fn() } }));

const get = (apiClient as unknown as { get: jest.Mock }).get;

beforeEach(() => {
  jest.resetAllMocks();
  get.mockResolvedValue({ data: { ok: true } });
});

describe("consultations api", () => {
  it("lists with the filters as query parameters", async () => {
    const filters = { limit: 20, page: 2, prescription: "with" as const, query: "grippe" };
    await expect(listConsultations(filters)).resolves.toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith("/consultations", { params: filters });
  });

  it("reads the stats and the capabilities", async () => {
    await getConsultationStats();
    await getConsultationCapabilities();
    expect(get).toHaveBeenNthCalledWith(1, "/consultations/stats");
    expect(get).toHaveBeenNthCalledWith(2, "/consultations/capabilities");
  });

  it("reads one consultation by its encoded id", async () => {
    await getConsultation("c/1");
    expect(get).toHaveBeenCalledWith("/consultations/c%2F1");
  });

  it("lets an API error through to the caller", async () => {
    const failure = new Error("404");
    get.mockRejectedValue(failure);
    await expect(getConsultation("c1")).rejects.toBe(failure);
  });
});
