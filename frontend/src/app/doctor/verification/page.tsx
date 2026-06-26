import { DoctorVerificationPage } from "@/components/verification/doctor/DoctorVerificationPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["INDEPENDENT_DOCTOR"],
    "/doctor/verification",
  );

  return <DoctorVerificationPage />;
}
