import { AiAnalysesHubPage } from "@/components/ai-analyses/AiAnalysesHubPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/ai-analyses",
  );

  return <AiAnalysesHubPage accountType="ESTABLISHMENT" />;
}
