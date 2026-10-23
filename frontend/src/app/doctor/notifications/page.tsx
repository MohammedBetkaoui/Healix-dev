import { NotificationsPage } from "@/features/notifications/components/NotificationsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"], "/doctor/notifications");
  return <NotificationsPage accountType="DOCTOR" />;
}
