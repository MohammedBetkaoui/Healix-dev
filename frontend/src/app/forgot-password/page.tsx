import type { Metadata } from "next";

import { ForgotPasswordPage } from "@/components/auth/password/PasswordRecoveryPages";
import { passwordResetFr } from "@/i18n/locales/fr/password-reset";

export const metadata: Metadata = {
  title: passwordResetFr.metadata.forgotTitle,
  description: passwordResetFr.metadata.description,
};

export default function ForgotPasswordRoute() {
  return <ForgotPasswordPage />;
}
