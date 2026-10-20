import { resolveReportCapabilities } from "./report-permissions";

describe("report capabilities", () => {
  it("keeps clinical document actions independent from the visual role", () => {
    expect(resolveReportCapabilities(["REPORT_VIEW", "REPORT_DOWNLOAD"])).toEqual({
      canAmendReports: false,
      canCancelReports: false,
      canCreateReports: false,
      canDownloadReports: true,
      canFinalizeReports: false,
      canPrintReports: false,
      canShareReports: false,
      canViewReports: true,
    });
  });
});

