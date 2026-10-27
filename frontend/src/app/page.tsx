import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";

import { AlgeriaContext, AudienceSplit, ClinicalJourney, HealixAiStory, TrustArchitecture } from "@/components/landing/EditorialSections";
import { FaqSection } from "@/components/landing/FaqSection";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LocaleDocumentSync } from "@/components/landing/LocaleDocumentSync";
import { PlansSection } from "@/components/landing/PlansSection";
import { ProductStage } from "@/components/landing/ProductStage";
import { TrustBar } from "@/components/landing/TrustBar";
import styles from "@/components/landing/landing.module.css";
import { isLocale, type Locale } from "@/i18n";
import { landingAr } from "@/i18n/locales/ar/landing";
import { landingFr } from "@/i18n/locales/fr/landing";

export const metadata: Metadata = {
  title: landingFr.meta.title,
  description: landingFr.meta.description,
  openGraph: {
    title: landingFr.meta.title,
    description: landingFr.meta.description,
    siteName: "HealixDz",
    locale: "fr_DZ",
    alternateLocale: ["ar_DZ"],
    type: "website",
  },
};

type HomeProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "HealixDz",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description: landingFr.meta.description,
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const requestedLocale = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const localeCandidate = requestedLocale ?? null;
  const locale: Locale = isLocale(localeCandidate) ? localeCandidate : "fr";
  const content = locale === "ar" ? landingAr : landingFr;
  const direction = locale === "ar" ? "rtl" : "ltr";
  // Content-Security-Policy nonce of the request (proxy.ts): without it the
  // inline script below would be blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className={styles.landingRoot} lang={locale} dir={direction}>
      <a className={styles.skipLink} href="#main-content">{locale === "ar" ? "تجاوز إلى المحتوى" : "Aller au contenu"}</a>
      <LocaleDocumentSync locale={locale} />
      {/* next/script (not raw <script>): raw scripts in the RSC payload are
          mounted — never executed — on client-side navigation, which React
          reports as an error. next/script injects them via the DOM API. */}
      <Script
        id="healixdz-locale"
        strategy="afterInteractive"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang=${JSON.stringify(locale)};document.documentElement.dir=${JSON.stringify(direction)};`,
        }}
      />
      <Script
        id="healixdz-jsonld"
        strategy="afterInteractive"
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingHeader locale={locale} nav={content.nav} />
      <main id="main-content">
        <HeroSection locale={locale} />
        <TrustBar locale={locale} />
        <ProductStage locale={locale} />
        <ClinicalJourney locale={locale} />
        <AudienceSplit locale={locale} />
        <HealixAiStory locale={locale} />
        <TrustArchitecture locale={locale} />
        <AlgeriaContext locale={locale} />
        <PlansSection locale={locale} plans={content.plans} />
        <FaqSection faq={content.faq} />
        <FinalCta locale={locale} />
      </main>
      <LandingFooter footer={content.footer} />
    </div>
  );
}
