import { AccountSettingsPage } from "@/features/account/components/AccountSettingsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["ESTABLISHMENT_ADMIN"], "/establishment/settings");
  return <AccountSettingsPage accountType="ESTABLISHMENT" />;
}
