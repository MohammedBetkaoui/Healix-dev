import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-theme.css";
import { commonFr } from "@/i18n/locales/fr/common";
import { authFontVariables } from "@/lib/auth-fonts";
import { dashboardFont } from "@/lib/dashboard-fonts";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: commonFr.metadata.appTitle,
  description: commonFr.metadata.appDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${authFontVariables} ${dashboardFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
