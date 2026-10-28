import { CapabilityGate } from "@/components/dashboard/layout/CapabilityGate";
import { EstablishmentVerificationPage } from "@/components/verification/establishment/EstablishmentVerificationPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/verification",
  );

  return (
    <CapabilityGate requiredCapability="verification.manage">
      <EstablishmentVerificationPage />
    </CapabilityGate>
  );
}
