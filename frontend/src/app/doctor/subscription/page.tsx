import { SubscriptionPage } from "@/components/subscription/SubscriptionPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/subscription");

  return <SubscriptionPage accountType="INDEPENDENT_DOCTOR" />;
}
