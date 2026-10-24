import { getAdminModelMonitoring } from "@/features/admin/api/admin-ai-monitoring.api";
import { apiClient } from "@/lib/api/http-client";

import { getModelMonitoring } from "./ai-analysis-runs.api";

jest.mock("@/lib/api/http-client", () => ({ apiClient: { get: jest.fn() } }));

const board = { models: [], period: { from: "a", to: "b" }, thresholds: { baselineMonths: 3, driftPoints: 10, minDecisions: 20 }, timeZone: "Africa/Algiers" };
const get = apiClient.get as jest.Mock;

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: board });
});

describe("the monitoring API", () => {
  it("asks the workspace board for its period and answers what it gets", async () => {
    await expect(getModelMonitoring({ from: "2025-11-15T12:00:00.000Z" })).resolves.toBe(board);

    expect(get).toHaveBeenCalledWith("/ai-analysis-runs/model-monitoring", { params: { from: "2025-11-15T12:00:00.000Z" } });
  });

  it("asks the global board of the back-office on its own route", async () => {
    await expect(getAdminModelMonitoring({ from: "2025-11-15T12:00:00.000Z", to: "2026-10-24T10:00:00.000Z" })).resolves.toBe(board);

    expect(get).toHaveBeenCalledWith("/admin/ai-analysis-runs/model-monitoring", {
      params: { from: "2025-11-15T12:00:00.000Z", to: "2026-10-24T10:00:00.000Z" },
    });
  });
});
