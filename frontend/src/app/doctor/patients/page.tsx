import { DoctorPatientsPage } from "@/components/dashboard/doctor/DoctorPatientsPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/patients");

  return <DoctorPatientsPage />;
}