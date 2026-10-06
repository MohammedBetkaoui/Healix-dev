import { AiAnalysesHubPage } from "@/components/ai-analyses/AiAnalysesHubPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"],
    "/doctor/ai-analyses",
  );

  return <AiAnalysesHubPage accountType="DOCTOR" />;
}
