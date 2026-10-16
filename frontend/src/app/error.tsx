"use client";

import { RefreshCw, ServerCrash } from "lucide-react";
import { useEffect } from "react";

import { useStoredLocale, useTranslation } from "@/lib/i18n";

type ErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

// Any error of a page below the root layout, among them a session the API
// could not check (429, 5xx, no answer: SessionCheckUnavailableError in
// lib/auth/server-auth.ts). Never a sign-out: the cookies stay, the user tries
// again. In production the message of a server error does not reach the
// browser, so the text is the same for all.
export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      dir={direction}
      className="flex flex-1 items-center justify-center bg-[var(--bg)] px-4 py-16"
    >
      <section
        role="alert"
        className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-6 text-center sm:p-8"
      >
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--warning-soft)] text-[var(--warning-ink)]">
          <ServerCrash aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-[var(--ink)]">
          {t("common.serviceUnavailable.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {t("common.serviceUnavailable.description")}
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-6 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent-dark)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--accent-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          {t("common.serviceUnavailable.retry")}
        </button>
      </section>
    </main>
  );
}
