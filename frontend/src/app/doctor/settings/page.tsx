import { AccountSettingsPage } from "@/features/account/components/AccountSettingsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"], "/doctor/settings");
  return <AccountSettingsPage accountType="DOCTOR" />;
}
