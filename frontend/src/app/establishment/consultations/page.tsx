import { ConsultationsPage } from "@/features/consultations/components/ConsultationsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["ESTABLISHMENT_ADMIN"], "/establishment/consultations");
  return <ConsultationsPage accountType="ESTABLISHMENT" />;
}
