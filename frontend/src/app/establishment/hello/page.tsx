import { redirect } from "next/navigation";

import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/hello",
  );

  redirect("/establishment/dashboard");
}
