import { PrescriptionsPage } from "@/features/prescriptions/components/PrescriptionsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["ESTABLISHMENT_ADMIN"], "/establishment/prescriptions");
  return <PrescriptionsPage accountType="ESTABLISHMENT" />;
}

