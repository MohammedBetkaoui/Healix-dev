import type { Metadata } from "next";

import { ResetPasswordPage } from "@/components/auth/password/PasswordRecoveryPages";
import { passwordResetFr } from "@/i18n/locales/fr/password-reset";

export const metadata: Metadata = {
  title: passwordResetFr.metadata.resetTitle,
  description: passwordResetFr.metadata.description,
  // The address carries the reset token until the page cleans it: it must
  // never leave in a Referer header.
  referrer: "no-referrer",
  robots: { follow: false, index: false },
};

export default function ResetPasswordRoute() {
  return <ResetPasswordPage />;
}
