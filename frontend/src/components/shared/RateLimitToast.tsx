"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { defaultLocale, isLocale, type Locale } from "@/i18n";
import { onRateLimited } from "@/lib/api/rate-limit-notice";
import { getDirection, useTranslation } from "@/lib/i18n";

const TOAST_DURATION_MS = 5_000;

// The language of the page underneath (set by the pages that are translated),
// read without changing it.
function pageLocale(): Locale {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : defaultLocale;
}

// "Trop de requêtes, nouvel essai dans N s", on every 429 the HTTP client sees
// (see lib/api/http-client.ts). Mounted once, in Providers.
export function RateLimitToast() {
  const [notice, setNotice] = useState<{ locale: Locale; seconds: number } | null>(null);
  const { t } = useTranslation(notice?.locale ?? defaultLocale);

  useEffect(() => {
    let timeout: number | undefined;
    const unsubscribe = onRateLimited((seconds) => {
      setNotice({ locale: pageLocale(), seconds });
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setNotice(null), TOAST_DURATION_MS);
    });

    return () => {
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4"
    >
      {notice ? (
        <p
          dir={getDirection(notice.locale)}
          className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--ink)] shadow-lg"
        >
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--warning-ink)]" strokeWidth={1.8} />
          {t("common.rateLimited", { seconds: notice.seconds })}
        </p>
      ) : null}
    </div>
  );
}
