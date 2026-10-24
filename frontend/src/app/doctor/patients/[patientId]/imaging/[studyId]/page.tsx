import { DicomStudyViewerPage } from "@/components/dicom/DicomStudyViewerPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

type PageProps = {
  params: Promise<{ patientId: string; studyId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { patientId, studyId } = await params;
  const decodedPatientId = decodeURIComponent(patientId);
  const decodedStudyId = decodeURIComponent(studyId);
  await requireAuthenticatedPage(
    ["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"],
    `/doctor/patients/${encodeURIComponent(decodedPatientId)}/imaging/${encodeURIComponent(decodedStudyId)}`,
  );

  return (
    <DicomStudyViewerPage
      accountType="DOCTOR"
      patientId={decodedPatientId}
      studyId={decodedStudyId}
    />
  );
}
