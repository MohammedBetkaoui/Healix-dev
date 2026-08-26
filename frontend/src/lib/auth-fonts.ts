import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  Newsreader,
} from "next/font/google";

const authDisplay = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-auth-display",
  display: "swap",
});

const authSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-auth-sans",
  display: "swap",
});

const authMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-auth-mono",
  display: "swap",
});

const authArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-auth-arabic",
  display: "swap",
});

export const authFontVariables = [
  authDisplay.variable,
  authSans.variable,
  authMono.variable,
  authArabic.variable,
].join(" ");
