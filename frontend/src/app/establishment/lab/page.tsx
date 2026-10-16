import { notFound } from "next/navigation";

import { LaboratoryPage } from "@/components/laboratory/LaboratoryPage";
import { demoModulesEnabled } from "@/config/demo-modules";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  // Demo module on mock data: absent unless demo modules are enabled.
  if (!demoModulesEnabled()) notFound();

  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/lab",
  );

  return <LaboratoryPage />;
}
