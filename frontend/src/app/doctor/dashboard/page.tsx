import { DoctorDashboard } from "@/components/dashboard/doctor/DoctorDashboard";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/dashboard");

  return <DoctorDashboard />;
}
