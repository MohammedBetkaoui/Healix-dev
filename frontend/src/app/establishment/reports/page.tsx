import { ReportsPage } from "@/features/reports/components/ReportsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["ESTABLISHMENT_ADMIN"], "/establishment/reports");
  return <ReportsPage accountType="ESTABLISHMENT" />;
}
