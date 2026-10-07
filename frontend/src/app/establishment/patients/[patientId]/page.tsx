import { PatientRecordPage } from "@/components/patients/PatientRecordPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

type PageProps = {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { patientId } = await params;
  const { tab } = await searchParams;
  const decodedPatientId = decodeURIComponent(patientId);
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    `/establishment/patients/${encodeURIComponent(decodedPatientId)}`,
  );

  return (
    <PatientRecordPage
      accountType="ESTABLISHMENT"
      initialTab={typeof tab === "string" ? tab : undefined}
      patientId={decodedPatientId}
    />
  );
}
