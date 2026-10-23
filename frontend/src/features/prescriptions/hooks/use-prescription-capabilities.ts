"use client";

import { useQuery } from "@tanstack/react-query";

import { getPrescriptionCapabilities } from "../api/prescriptions.api";
import { prescriptionKeys } from "../prescription-query-keys";
import { NO_PRESCRIPTION_CAPABILITIES } from "../utils/prescription-permissions";

// The rights come from the API (role of the account), never from the
// workspace the page is displayed in. Until they are known, nothing is allowed.
export function usePrescriptionCapabilities() {
  const query = useQuery({
    queryFn: getPrescriptionCapabilities,
    queryKey: prescriptionKeys.capabilities,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { ...query, capabilities: query.data ?? NO_PRESCRIPTION_CAPABILITIES };
}
