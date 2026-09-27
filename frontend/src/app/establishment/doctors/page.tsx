import { DoctorsTeamPage } from "@/components/doctors/DoctorsTeamPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/doctors",
  );

  return <DoctorsTeamPage />;
}
