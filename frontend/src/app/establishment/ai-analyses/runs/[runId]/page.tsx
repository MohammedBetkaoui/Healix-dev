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
  const returnTo = `/establishment/ai-analyses/runs/${encodeURIComponent(runId)}${patientId ? `?patient=${encodeURIComponent(patientId)}` : ""}`;

  await requireAuthenticatedPage(["ESTABLISHMENT_ADMIN"], returnTo);

  if (!patientId) redirect("/establishment/ai-analyses");

  return <AiAnalysisRunPage accountType="ESTABLISHMENT" patientId={patientId} runId={runId} />;
}
