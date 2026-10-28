import { CapabilityGate } from "@/components/dashboard/layout/CapabilityGate";
import { SubscriptionPage } from "@/components/subscription/SubscriptionPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/subscription",
  );

  return (
    <CapabilityGate requiredCapability="subscription.manage">
      <SubscriptionPage accountType="ESTABLISHMENT" />
    </CapabilityGate>
  );
}
