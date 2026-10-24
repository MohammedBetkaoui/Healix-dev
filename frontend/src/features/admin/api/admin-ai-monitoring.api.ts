import { type ModelMonitoring, type ModelMonitoringParams } from "@/features/ai-analyses/model-monitoring";
import { apiClient } from "@/lib/api/http-client";

/** GET /admin/ai-analysis-runs/model-monitoring: the same board over every workspace. */
export async function getAdminModelMonitoring(params: ModelMonitoringParams): Promise<ModelMonitoring> {
  const { data } = await apiClient.get<ModelMonitoring>("/admin/ai-analysis-runs/model-monitoring", { params });

  return data;
}
