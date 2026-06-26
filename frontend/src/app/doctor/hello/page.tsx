import { redirect } from "next/navigation";

import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/hello");

  redirect("/doctor/dashboard");
}
