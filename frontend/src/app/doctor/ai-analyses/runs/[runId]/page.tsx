import { redirect } from "next/navigation";

import { AiAnalysisRunPage } from "@/components/ai-analyses/run/AiAnalysisRunPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

type PageProps = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { runId } = await params;
  const { patient } = await searchParams;
  const patientId = typeof patient === "string" && patient ? patient : undefined;
  const returnTo = `/doctor/ai-analyses/runs/${encodeURIComponent(runId)}${patientId ? `?patient=${encodeURIComponent(patientId)}` : ""}`;

  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR", "AFFILIATED_DOCTOR"], returnTo);

  if (!patientId) redirect("/doctor/ai-analyses");

  return <AiAnalysisRunPage accountType="DOCTOR" patientId={patientId} runId={runId} />;
}
