import { PlayCircle } from "lucide-react";

import { type RegisterI18nProps } from "../RegisterPage";

function EcgLine() {
  return (
    <div className="flex h-8 items-center gap-1 opacity-80" aria-hidden="true">
      <span className="h-px w-8 rounded-full bg-cyan-100/55" />
      <span className="h-px w-4 rounded-full bg-cyan-100/55" />
      <span className="h-4 w-px -rotate-45 rounded-full bg-cyan-100/70" />
      <span className="h-7 w-px rotate-45 rounded-full bg-emerald-200/80" />
      <span className="h-3 w-px -rotate-45 rounded-full bg-cyan-100/70" />
      <span className="h-px w-10 rounded-full bg-cyan-100/55" />
      <span className="h-5 w-px rotate-45 rounded-full bg-cyan-100/70" />
      <span className="h-2 w-px -rotate-45 rounded-full bg-emerald-200/75" />
      <span className="h-px flex-1 rounded-full bg-cyan-100/45" />
    </div>
  );
}

export function DemoModeCard({ t }: RegisterI18nProps) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-cyan-200/25 bg-white/[0.08] p-4 shadow-sm shadow-sky-950/10 backdrop-blur">
      <div className="pointer-events-none absolute end-4 top-4 h-14 w-14 rounded-full bg-cyan-200/15 blur-xl" />
      <div className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-300/15 text-cyan-100">
          <PlayCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <span className="inline-flex rounded-md border border-cyan-200/30 bg-cyan-200/10 px-2.5 py-1 text-xs font-semibold text-cyan-50">
            {t("register.hero.demoMode.badge")}
          </span>
          <p className="mt-3 text-sm leading-6 text-sky-50">
            {t("register.hero.demoMode.text")}
          </p>
        </div>
      </div>
      <div className="relative mt-4">
        <EcgLine />
      </div>
    </section>
  );
}
