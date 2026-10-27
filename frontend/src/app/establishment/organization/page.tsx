import { OrganizationSettingsPage } from "@/features/organization/components/OrganizationSettingsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/organization",
  );
  return <OrganizationSettingsPage />;
}
