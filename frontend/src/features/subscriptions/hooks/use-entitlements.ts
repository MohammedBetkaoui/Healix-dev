"use client";

import { useQuery } from "@tanstack/react-query";

import { getEntitlements } from "../subscriptions.api";

export const entitlementsQueryKey = ["subscription", "entitlements"] as const;

// The subscription the workspace works under, shared by the banner, the usage
// gauges, the creation buttons (read-only mode) and the AI hub. Whoever has no
// workspace yet (an account not verified) is answered 403: nothing is then
// known and nothing is disabled; the backend refuses what must be refused.
export function useEntitlements() {
  const query = useQuery({
    queryFn: getEntitlements,
    queryKey: entitlementsQueryKey,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });
  const entitlements = query.data ?? null;

  return {
    entitlements,
    isLoading: query.isLoading,
    // Unknown (loading, failed): not read-only. Reading and downloading are
    // never blocked, and creating is refused by the backend anyway.
    readOnly: entitlements?.readOnly ?? false,
    refetch: query.refetch,
  };
}
