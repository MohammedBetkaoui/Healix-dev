import { type ReportCapabilities, type ReportGrant } from "../types/report.types";

export function resolveReportCapabilities(grants: ReadonlyArray<ReportGrant>): ReportCapabilities {
  const has = (grant: ReportGrant) => grants.includes(grant);

  return {
    canViewReports: has("REPORT_VIEW"),
    canCreateReports: has("REPORT_CREATE"),
    canFinalizeReports: has("REPORT_FINALIZE"),
    canAmendReports: has("REPORT_AMEND"),
    canDownloadReports: has("REPORT_DOWNLOAD"),
    canPrintReports: has("REPORT_PRINT"),
    canShareReports: has("REPORT_SHARE"),
    canCancelReports: has("REPORT_CANCEL"),
  };
}

// Temporary frontend claims. The backend remains the final authority once
// these report operations are connected to real endpoints.
export const mockEstablishmentReportGrants = [
  "REPORT_VIEW",
  "REPORT_CREATE",
  "REPORT_FINALIZE",
  "REPORT_AMEND",
  "REPORT_DOWNLOAD",
  "REPORT_PRINT",
  "REPORT_SHARE",
  "REPORT_CANCEL",
] as const satisfies ReadonlyArray<ReportGrant>;

