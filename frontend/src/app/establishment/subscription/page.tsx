import { SubscriptionPage } from "@/components/subscription/SubscriptionPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/subscription",
  );

  return <SubscriptionPage accountType="ESTABLISHMENT" />;
}
