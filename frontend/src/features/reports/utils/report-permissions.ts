import { type ReportCapabilities } from "../types/report.types";

// Nothing is allowed until GET /reports/capabilities has answered (or when it
// fails): the page never shows an action the API did not grant.
export const NO_REPORT_CAPABILITIES: ReportCapabilities = {
  canAmendReports: false,
  canCancelReports: false,
  canCreateReports: false,
  canDownloadReports: false,
  canFinalizeReports: false,
  canPrintReports: false,
  canShareReports: false,
  canViewReports: false,
};
