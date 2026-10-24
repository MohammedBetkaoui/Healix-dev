import { AiModelMonitoringPage } from "@/components/ai-analyses/monitoring/AiModelMonitoringPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/ai-analyses/monitoring",
  );

  return <AiModelMonitoringPage accountType="ESTABLISHMENT" />;
}
