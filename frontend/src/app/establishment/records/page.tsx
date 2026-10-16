import { notFound } from "next/navigation";

import { MedicalRecordsPage } from "@/components/medical-records/MedicalRecordsPage";
import { demoModulesEnabled } from "@/config/demo-modules";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  // Demo module on mock data: absent unless demo modules are enabled.
  if (!demoModulesEnabled()) notFound();

  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/records",
  );

  return <MedicalRecordsPage />;
}
