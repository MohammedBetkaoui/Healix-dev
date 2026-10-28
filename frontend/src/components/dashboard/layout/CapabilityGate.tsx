"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAccountProfile } from "@/features/account/hooks/use-account";

// Client-side gate for the owner-only URLs a saved bookmark or a shared link
// can reach even though the sidebar hides them. The backend guards remain the
// security: this only redirects once the profile is known, it never unlocks.
export function CapabilityGate({
  children,
  requiredCapability,
}: {
  children: ReactNode;
  requiredCapability: string;
}) {
  const router = useRouter();
  const { data: account } = useAccountProfile();
  const allowed =
    account?.workspaceAccess?.capabilities?.includes(requiredCapability) ??
    false;

  useEffect(() => {
    // Only redirect on a loaded profile: while it is loading, `allowed` is
    // false without meaning anything yet.
    if (account && !allowed) {
      router.replace("/establishment/dashboard");
    }
  }, [account, allowed, router]);

  // Hold the page until the profile answers: nothing, rather than a flash of
  // content the gate is about to remove.
  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
