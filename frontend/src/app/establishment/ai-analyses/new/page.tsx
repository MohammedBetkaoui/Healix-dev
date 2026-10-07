import { redirect } from "next/navigation";

import { AiAnalysisWizardPage } from "@/components/ai-analyses/wizard/AiAnalysisWizardPage";
import {
  findPipeline,
  pipelineForLegacyModel,
} from "@/features/ai-analyses/ai-models.registry";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { model, patient, pipeline } = await searchParams;
  const modelId = typeof model === "string" ? model : undefined;
  const pipelineId = typeof pipeline === "string" ? pipeline : undefined;
  const patientId = typeof patient === "string" && patient ? patient : undefined;
  const query = new URLSearchParams();
  if (pipelineId) query.set("pipeline", pipelineId);
  if (modelId) query.set("model", modelId);
  if (patientId) query.set("patient", patientId);

  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    `/establishment/ai-analyses/new${query.size > 0 ? `?${query}` : ""}`,
  );

  const selectedPipeline = pipelineId
    ? findPipeline(pipelineId)
    : pipelineForLegacyModel(modelId);

  if (!selectedPipeline) {
    redirect("/establishment/ai-analyses");
  }

  // Canonicalize old ?model=<component> links to the single launchable chain.
  if (modelId || pipelineId !== selectedPipeline.id) {
    const canonical = new URLSearchParams({ pipeline: selectedPipeline.id });
    if (patientId) canonical.set("patient", patientId);
    redirect(`/establishment/ai-analyses/new?${canonical}`);
  }

  return (
    <AiAnalysisWizardPage
      accountType="ESTABLISHMENT"
      initialPatientId={patientId}
      pipelineId={selectedPipeline.id}
    />
  );
}
