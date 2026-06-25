"use client";

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { LoginForm } from "./LoginForm";
import { LoginHeroPanel } from "./LoginHeroPanel";
import { LoginSecurityNotice } from "./LoginSecurityNotice";

export function LoginPage() {
  const { locale, setLocale } = useStoredLocale();
  const { direction, isRtl, t } = useTranslation(locale);

  return (
    <main
      lang={locale}
      dir={direction}
      className="min-h-screen bg-[linear-gradient(135deg,#f8fbfd_0%,#eef8fb_45%,#f7fbf8_100%)] px-4 py-6 text-start text-slate-950 sm:px-6 lg:px-8"
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.28]"
        aria-hidden="true"
      >
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(14,116,144,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.1)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <div
        className={cn(
          "relative mx-auto mb-4 flex w-full max-w-7xl",
          isRtl ? "justify-start" : "justify-end",
        )}
      >
        <LanguageSwitcher locale={locale} onLocaleChange={setLocale} t={t} />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1fr_0.95fr]">
        <LoginHeroPanel t={t} />

        <section className="flex flex-col gap-6 py-2 lg:py-8">
          <LoginSecurityNotice t={t} />

          <section className="rounded-[28px] border border-white/75 bg-white/82 p-5 shadow-[0_24px_60px_rgba(8,52,83,0.08)] backdrop-blur sm:p-7">
            <LoginForm direction={direction} t={t} />
          </section>
        </section>
      </div>
    </main>
  );
}
