import { redirect } from "next/navigation";

import { AiAnalysisWizardPage } from "@/components/ai-analyses/wizard/AiAnalysisWizardPage";
import { findLaunchableModel } from "@/features/ai-analyses/ai-models.registry";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { model, patient } = await searchParams;
  const modelId = typeof model === "string" ? model : undefined;
  const patientId = typeof patient === "string" && patient ? patient : undefined;
  const query = new URLSearchParams();
  if (modelId) query.set("model", modelId);
  if (patientId) query.set("patient", patientId);

  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    `/establishment/ai-analyses/new${query.size > 0 ? `?${query}` : ""}`,
  );

  // Unknown, or not available yet: back to the catalog.
  const launchable = findLaunchableModel(modelId);
  if (!launchable) {
    redirect("/establishment/ai-analyses");
  }

  return (
    <AiAnalysisWizardPage
      accountType="ESTABLISHMENT"
      initialPatientId={patientId}
      modelId={launchable.id}
    />
  );
}
