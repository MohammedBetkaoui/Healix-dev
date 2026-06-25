import type { Metadata } from "next";

import { RegisterPage } from "@/components/auth/register/RegisterPage";
import { registerFr } from "@/i18n/locales/fr/register";

export const metadata: Metadata = {
  title: registerFr.metadata.title,
  description: registerFr.metadata.description,
};

export default function RegisterRoute() {
  return <RegisterPage />;
}
