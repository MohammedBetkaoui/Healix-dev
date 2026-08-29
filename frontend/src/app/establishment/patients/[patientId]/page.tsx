import { PatientRecordPage } from "@/components/patients/PatientRecordPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

type PageProps = {
  params: Promise<{ patientId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { patientId } = await params;
  const decodedPatientId = decodeURIComponent(patientId);
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    `/establishment/patients/${encodeURIComponent(decodedPatientId)}`,
  );

  return <PatientRecordPage accountType="ESTABLISHMENT" patientId={decodedPatientId} />;
}
