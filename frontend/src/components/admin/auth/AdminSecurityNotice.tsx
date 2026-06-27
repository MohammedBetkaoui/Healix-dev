import { LockKeyhole } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type AdminSecurityNoticeProps = {
  t: TranslationFunction;
};

export function AdminSecurityNotice({ t }: AdminSecurityNoticeProps) {
  return (
    <div className="rounded-2xl border border-slate-700/70 bg-white/8 p-5 text-white shadow-2xl shadow-slate-950/20 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-200/20">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">{t("adminAuth.notice.title")}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {t("adminAuth.notice.description")}
          </p>
        </div>
      </div>
    </div>
  );
}
