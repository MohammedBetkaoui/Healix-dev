import { apiClient } from "@/lib/api/http-client";
import { type AdminDashboardOverviewResponse } from "@/types/admin";

export async function getAdminDashboardOverview(): Promise<AdminDashboardOverviewResponse> {
  const { data } = await apiClient.get<AdminDashboardOverviewResponse>(
    "/admin/dashboard/overview",
  );

  return data;
}
