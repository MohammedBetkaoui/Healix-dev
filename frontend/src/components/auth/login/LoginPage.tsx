"use client";

import { AuthPageShell } from "./AuthPageShell";
import { LoginForm } from "./LoginForm";

export function LoginPage() {
  return (
    <AuthPageShell>
      {({ direction, t }) => <LoginForm direction={direction} t={t} />}
    </AuthPageShell>
  );
}
