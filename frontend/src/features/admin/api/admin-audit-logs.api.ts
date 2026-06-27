import { apiClient } from "@/lib/api/http-client";
import {
  type AdminAuditLogsQuery,
  type AdminAuditLogsResponse,
} from "@/types/admin";

import { cleanAdminQuery } from "./admin-query.util";

export async function listAdminAuditLogs(
  query: AdminAuditLogsQuery,
): Promise<AdminAuditLogsResponse> {
  const { data } = await apiClient.get<AdminAuditLogsResponse>(
    "/admin/audit-logs",
    {
      params: cleanAdminQuery(query),
    },
  );

  return data;
}
