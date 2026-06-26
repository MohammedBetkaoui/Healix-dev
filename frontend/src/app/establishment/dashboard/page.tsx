import { EstablishmentDashboard } from "@/components/dashboard/establishment/EstablishmentDashboard";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/dashboard",
  );

  return <EstablishmentDashboard />;
}
