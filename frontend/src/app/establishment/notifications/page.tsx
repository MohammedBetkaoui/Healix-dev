import { NotificationsPage } from "@/features/notifications/components/NotificationsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["ESTABLISHMENT_ADMIN"], "/establishment/notifications");
  return <NotificationsPage accountType="ESTABLISHMENT" />;
}
