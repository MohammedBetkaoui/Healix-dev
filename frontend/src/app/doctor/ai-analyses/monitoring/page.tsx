import { AiModelMonitoringPage } from "@/components/ai-analyses/monitoring/AiModelMonitoringPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"],
    "/doctor/ai-analyses/monitoring",
  );

  return <AiModelMonitoringPage accountType="DOCTOR" />;
}
