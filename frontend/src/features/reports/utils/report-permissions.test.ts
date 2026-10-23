import { NO_REPORT_CAPABILITIES } from "./report-permissions";

describe("report capabilities before the API answers", () => {
  it("allow nothing: no action is shown on a right that was not granted", () => {
    expect(Object.values(NO_REPORT_CAPABILITIES).every((granted) => granted === false)).toBe(true);
    expect(Object.keys(NO_REPORT_CAPABILITIES).sort()).toEqual([
      "canAmendReports",
      "canCancelReports",
      "canCreateReports",
      "canDownloadReports",
      "canFinalizeReports",
      "canPrintReports",
      "canShareReports",
      "canViewReports",
    ]);
  });
});
