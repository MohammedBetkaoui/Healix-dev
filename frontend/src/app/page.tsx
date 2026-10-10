import type { Metadata } from "next";
import { headers } from "next/headers";

import { AiSection } from "@/components/landing/AiSection";
import { AlgeriaSection } from "@/components/landing/AlgeriaSection";
import { AudienceSection } from "@/components/landing/AudienceSection";
import { ContextSection } from "@/components/landing/ContextSection";
import { EcosystemSection } from "@/components/landing/EcosystemSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LocaleDocumentSync } from "@/components/landing/LocaleDocumentSync";
import { PatientJourneySection } from "@/components/landing/PatientJourneySection";
import { PatientRecordSection } from "@/components/landing/PatientRecordSection";
import { PlansSection } from "@/components/landing/PlansSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { SecuritySection } from "@/components/landing/SecuritySection";
import { VerificationSection } from "@/components/landing/VerificationSection";
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
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang=${JSON.stringify(locale)};document.documentElement.dir=${JSON.stringify(direction)};`,
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingHeader locale={locale} nav={content.nav} />
      <main>
        <HeroSection hero={content.hero} />
        <ContextSection context={content.context} />
        <EcosystemSection ecosystem={content.ecosystem} />
        <FeaturesSection features={content.features} />
        <AudienceSection audience={content.audience} />
        <PatientJourneySection journey={content.journey} />
        <PatientRecordSection record={content.patientRecord} />
        <AiSection ai={content.ai} />
        <VerificationSection verification={content.verification} />
        <SecuritySection security={content.security} />
        <AlgeriaSection algeria={content.algeria} />
        <ProductShowcase showcase={content.showcase} />
        <PlansSection locale={locale} plans={content.plans} />
        <FaqSection faq={content.faq} />
        <FinalCta cta={content.finalCta} />
      </main>
      <LandingFooter footer={content.footer} />
    </div>
  );
}
