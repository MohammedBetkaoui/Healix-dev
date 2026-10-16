import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";

import { AiSection } from "@/components/landing/AiSection";
import { AlgeriaSection } from "@/components/landing/AlgeriaSection";
import { AudienceSection } from "@/components/landing/AudienceSection";
import { ClinicalWorkflow } from "@/components/landing/ClinicalWorkflow";
import { FaqSection } from "@/components/landing/FaqSection";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { InteroperabilitySection } from "@/components/landing/InteroperabilitySection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LocaleDocumentSync } from "@/components/landing/LocaleDocumentSync";
import { PlatformBento } from "@/components/landing/PlatformBento";
import { PlansSection } from "@/components/landing/PlansSection";
import { ProductTour } from "@/components/landing/ProductTour";
import { SecurityArchitecture } from "@/components/landing/SecurityArchitecture";
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
      <main>
        <HeroSection hero={content.hero} showcase={content.showcase} />
        <TrustBar trust={content.trustBar} />
        <PlatformBento
          context={content.context}
          features={content.features}
          record={content.patientRecord}
          screenUi={content.showcase.ui}
        />
        <ClinicalWorkflow journey={content.journey} />
        <ProductTour showcase={content.showcase} />
        <AudienceSection audience={content.audience} screenUi={content.showcase.ui} />
        <AiSection ai={content.ai} />
        <InteroperabilitySection interoperability={content.interoperability} />
        <SecurityArchitecture verification={content.verification} security={content.security} />
        <AlgeriaSection algeria={content.algeria} />
        <PlansSection locale={locale} plans={content.plans} />
        <FaqSection faq={content.faq} />
        <FinalCta cta={content.finalCta} />
      </main>
      <LandingFooter footer={content.footer} />
    </div>
  );
}
