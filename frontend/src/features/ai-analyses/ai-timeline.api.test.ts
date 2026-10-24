import { apiClient } from "@/lib/api/http-client";

import { getAiTimeline } from "./ai-analysis-runs.api";

jest.mock("@/lib/api/http-client", () => ({ apiClient: { get: jest.fn() } }));

const timeline = { items: [], measures: [], patientId: "patient-1", pipeline: "brain", primaryMeasure: "topProbability" };
const get = apiClient.get as jest.Mock;

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: timeline });
});

describe("the timeline API", () => {
  it("asks for the runs of one chain of a patient and answers what it gets", async () => {
    await expect(getAiTimeline("patient-1", "cardio-seg-mri")).resolves.toBe(timeline);

    expect(get).toHaveBeenCalledWith("/patients/patient-1/ai-timeline", { params: { pipeline: "cardio-seg-mri" } });
  });

  it("lets an error through, a 404 for a patient of another workspace included", async () => {
    get.mockRejectedValue(new Error("Request failed with status code 404"));

    await expect(getAiTimeline("someone-else", "brain")).rejects.toThrow("404");
  });
});
