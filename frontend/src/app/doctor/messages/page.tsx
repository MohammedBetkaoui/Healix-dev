import { Suspense } from "react";

import { MessagesPage } from "@/components/messaging/MessagesPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"],
    "/doctor/messages",
  );

  // useSearchParams (?c=<conversationId>) inside: a Suspense boundary.
  return (
    <Suspense>
      <MessagesPage accountType="DOCTOR" />
    </Suspense>
  );
}
