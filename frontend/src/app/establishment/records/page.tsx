import { MedicalRecordsPage } from "@/components/medical-records/MedicalRecordsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/records",
  );

  return <MedicalRecordsPage />;
}
