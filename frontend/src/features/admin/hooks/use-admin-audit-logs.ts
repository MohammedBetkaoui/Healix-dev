"use client";

import { useQuery } from "@tanstack/react-query";

import { type AdminAuditLogsQuery } from "@/types/admin";

import { listAdminAuditLogs } from "../api/admin-audit-logs.api";

export function useAdminAuditLogs(query: AdminAuditLogsQuery) {
  return useQuery({
    queryFn: () => listAdminAuditLogs(query),
    queryKey: ["admin", "audit-logs", query],
    retry: false,
    staleTime: 15_000,
  });
}
