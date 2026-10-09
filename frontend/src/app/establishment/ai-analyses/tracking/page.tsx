import { Suspense } from "react";

import { AiRunsTrackingPage } from "@/components/ai-analyses/tracking/AiRunsTrackingPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/ai-analyses/tracking",
  );

  // The page reads its filters with useSearchParams.
  return (
    <Suspense fallback={null}>
      <AiRunsTrackingPage accountType="ESTABLISHMENT" />
    </Suspense>
  );
}
