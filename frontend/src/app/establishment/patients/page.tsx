import { EstablishmentPatientsPage } from "@/components/dashboard/establishment/EstablishmentPatientsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/patients",
  );

  return <EstablishmentPatientsPage />;
}