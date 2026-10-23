import { ReportsPage } from "@/features/reports/components/ReportsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"], "/doctor/reports");
  return <ReportsPage accountType="DOCTOR" />;
}
