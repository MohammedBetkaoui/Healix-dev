import type { Metadata } from "next";

import { RegisterPage } from "@/components/auth/register/RegisterPage";
import { registerFr } from "@/i18n/locales/fr/register";
import { redirectAuthenticatedUserFromAuthPage } from "@/lib/auth/server-auth";

export const metadata: Metadata = {
  title: registerFr.metadata.title,
  description: registerFr.metadata.description,
};

export default async function RegisterRoute() {
  await redirectAuthenticatedUserFromAuthPage();

  return <RegisterPage />;
}
