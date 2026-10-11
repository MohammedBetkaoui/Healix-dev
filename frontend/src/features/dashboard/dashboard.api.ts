import { apiClient } from "@/lib/api/http-client";

import { type DashboardOverview } from "./dashboard.types";

export async function getDashboardOverview(days: number): Promise<DashboardOverview> {
  const response = await apiClient.get<DashboardOverview>("/dashboard/overview", {
    params: { days },
  });
  return response.data;
}
