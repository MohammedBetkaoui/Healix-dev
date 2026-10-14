import { LaboratoryPage } from "@/components/laboratory/LaboratoryPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/lab",
  );

  return <LaboratoryPage />;
}
