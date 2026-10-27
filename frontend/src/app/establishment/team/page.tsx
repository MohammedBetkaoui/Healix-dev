import { TeamPage } from "@/features/team/components/TeamPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/team",
  );
  return <TeamPage />;
}
