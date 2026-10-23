import { ConsultationsPage } from "@/features/consultations/components/ConsultationsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"], "/doctor/consultations");
  return <ConsultationsPage accountType="DOCTOR" />;
}
