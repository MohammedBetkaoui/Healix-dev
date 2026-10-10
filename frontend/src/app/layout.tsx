import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./dashboard-theme.css";
import { commonFr } from "@/i18n/locales/fr/common";
import { authFontVariables } from "@/lib/auth-fonts";
import { dashboardFont } from "@/lib/dashboard-fonts";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: commonFr.metadata.appTitle,
    template: "%s | HealixDz",
  },
  description: commonFr.metadata.appDescription,
  openGraph: {
    title: commonFr.metadata.appTitle,
    description: commonFr.metadata.appDescription,
    siteName: "HealixDz",
    locale: "fr_DZ",
    alternateLocale: ["ar_DZ"],
    type: "website",
  },
  icons: {
    icon: [
      { url: "/HealixDz-logo/logo.svg", type: "image/svg+xml" },
    ],
    shortcut: "/HealixDz-logo/logo.svg",
    apple: "/HealixDz-logo/logo.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page is rendered per request: the Content-Security-Policy nonce
  // (proxy.ts) can only reach the scripts of a page rendered for that
  // request, never of one prerendered at build time. Reading the request
  // headers makes the whole tree dynamic.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="fr" suppressHydrationWarning className={`${authFontVariables} ${dashboardFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
