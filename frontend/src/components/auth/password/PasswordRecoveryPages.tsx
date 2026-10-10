"use client";

import { Suspense } from "react";

import { AuthPageShell } from "../login/AuthPageShell";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

export function ForgotPasswordPage() {
  return (
    <AuthPageShell>
      {({ direction, t }) => <ForgotPasswordForm direction={direction} t={t} />}
    </AuthPageShell>
  );
}

// useSearchParams needs a Suspense boundary: only the form waits for the
// address, the page around it is rendered right away.
export function ResetPasswordPage() {
  return (
    <AuthPageShell>
      {({ direction, t }) => (
        <Suspense fallback={null}>
          <ResetPasswordForm direction={direction} t={t} />
        </Suspense>
      )}
    </AuthPageShell>
  );
}
