"use client";

import { useQuery } from "@tanstack/react-query";

import { getReportCapabilities } from "../api/reports.api";
import { reportKeys } from "../report-query-keys";
import { NO_REPORT_CAPABILITIES } from "../utils/report-permissions";

// The rights come from the API (role of the account), never from the
// workspace the page is displayed in. Until they are known, nothing is allowed.
export function useReportCapabilities() {
  const query = useQuery({
    queryFn: getReportCapabilities,
    queryKey: reportKeys.capabilities,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { ...query, capabilities: query.data ?? NO_REPORT_CAPABILITIES };
}
