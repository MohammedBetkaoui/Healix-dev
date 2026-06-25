import { LockKeyhole, ShieldCheck } from "lucide-react";

import { type RegisterI18nProps } from "./RegisterPage";

export function SecurityNotice({ t }: RegisterI18nProps) {
  return (
    <section
      className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 p-4 text-sm text-emerald-950 shadow-sm"
      aria-labelledby="security-notice-title"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="security-notice-title"
            className="flex items-center gap-2 font-semibold"
          >
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            {t("register.security.title")}
          </h2>
          <p className="mt-2 leading-6 text-emerald-900">
            {t("register.security.body")}
          </p>
        </div>
      </div>
    </section>
  );
}
