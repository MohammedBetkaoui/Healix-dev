"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useState } from "react";
import { z } from "zod";

// The Content-Security-Policy forbids eval: zod must not even probe it (its
// `new Function` test is reported as a violation although it is caught).
z.config({ jitless: true });

type ProvidersProps = {
  children: ReactNode;
  // Content-Security-Policy nonce of the request, for the inline script that
  // applies the theme before the page is drawn.
  nonce?: string;
};

export function Providers({ children, nonce }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: {
            retry: false,
          },
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="data-dashboard-theme"
      storageKey="healixdz.dashboard.theme"
      defaultTheme="system"
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
