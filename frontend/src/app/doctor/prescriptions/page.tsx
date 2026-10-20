import { PrescriptionsPage } from "@/features/prescriptions/components/PrescriptionsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"], "/doctor/prescriptions");
  return <PrescriptionsPage accountType="DOCTOR" />;
}

