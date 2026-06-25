import {
  Activity,
  BrainCircuit,
  Building2,
  DatabaseZap,
  FileCheck2,
  Hospital,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { ActivationTimeline } from "./hero/ActivationTimeline";
import { DemoModeCard } from "./hero/DemoModeCard";
import { type RegisterI18nProps } from "./RegisterPage";

const valuePoints = [
  {
    icon: DatabaseZap,
    textKey: "register.hero.valuePoints.patientRecords",
  },
  {
    icon: BrainCircuit,
    textKey: "register.hero.valuePoints.medicalAi",
  },
  {
    icon: FileCheck2,
    textKey: "register.hero.valuePoints.workflow",
  },
];

function MedicalPlatformIllustration({ t }: RegisterI18nProps) {
  return (
    <div className="relative h-[320px] rounded-lg border border-white/15 bg-white/[0.06] p-5 shadow-2xl shadow-sky-950/20 backdrop-blur-md">
      <div className="absolute inset-x-6 top-1/2 h-px bg-cyan-200/25" />
      <div className="absolute bottom-8 top-8 start-1/2 w-px bg-emerald-200/20" />
      <div
        className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.9)_1px,transparent_1.5px)] [background-size:18px_18px]"
        aria-hidden="true"
      />

      <div className="absolute start-5 top-5 w-44 rounded-lg border border-white/15 bg-white/12 p-4 shadow-xl shadow-sky-950/20 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-300/20 text-cyan-100">
            <Hospital className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-sky-100">
              {t("register.hero.illustration.admission")}
            </p>
            <p className="text-sm font-semibold text-white">
              {t("register.hero.illustration.unifiedRecord")}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-1.5 rounded-full bg-cyan-100/70" />
          <span className="block h-1.5 w-3/4 rounded-full bg-white/25" />
        </div>
      </div>

      <div className="absolute end-5 top-16 w-44 rounded-lg border border-white/15 bg-white/12 p-4 shadow-xl shadow-sky-950/20 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-300/20 text-emerald-100">
            <BrainCircuit className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-sky-100">
              {t("register.hero.illustration.imaging")}
            </p>
            <p className="text-sm font-semibold text-white">
              {t("register.hero.illustration.assistedAi")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1">
          {[55, 80, 42, 88, 64].map((height) => (
            <span
              key={height}
              className="rounded-full bg-emerald-200/70"
              style={{ height: `${height}px` }}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-5 start-12 w-48 rounded-lg border border-white/15 bg-white/12 p-4 shadow-xl shadow-sky-950/20 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-cyan-100">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-sky-100">
              {t("register.hero.illustration.audit")}
            </p>
            <p className="text-sm font-semibold text-white">
              {t("register.hero.illustration.controlledAccess")}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          <span className="text-xs text-sky-100">
            {t("register.hero.illustration.traceability")}
          </span>
        </div>
      </div>

      <div className="absolute bottom-10 end-10 flex h-20 w-20 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-300/15 text-cyan-50 shadow-lg shadow-sky-950/20 backdrop-blur">
        <Building2 className="h-8 w-8" aria-hidden="true" />
      </div>
    </div>
  );
}

function HeroValuePoints({ t }: RegisterI18nProps) {
  return (
    <div className="grid gap-3">
      {valuePoints.map(({ icon: Icon, textKey }) => (
        <div
          key={textKey}
          className="flex items-center gap-3 rounded-lg border border-white/12 bg-white/[0.07] px-4 py-3 text-sm text-sky-50 backdrop-blur"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-cyan-100">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>{t(textKey)}</span>
        </div>
      ))}
    </div>
  );
}

export function RegisterHeroPanel(props: RegisterI18nProps) {
  const { t } = props;

  return (
    <aside className="relative overflow-hidden rounded-lg border border-white/15 bg-[#082f49] p-5 text-white shadow-2xl shadow-sky-950/20 sm:p-7 lg:min-h-[calc(100vh-4rem)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),transparent_38%),linear-gradient(225deg,rgba(16,185,129,0.13),transparent_44%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:34px_34px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col gap-7">
        <div>
          <div className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#0b3b5f] shadow-lg shadow-cyan-950/20">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              {t("common.brand")}
            </span>
          </div>

          <div className="mt-8 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-lg border border-cyan-200/30 bg-white/10 px-3 py-1.5 text-sm text-cyan-50 backdrop-blur">
              <Sparkles className="h-4 w-4 text-cyan-200" aria-hidden="true" />
              {t("register.hero.demoBadge")}
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              {t("register.hero.title")}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-sky-100">
              {t("register.hero.subtitle")}
            </p>
          </div>
        </div>

        <HeroValuePoints {...props} />
        <MedicalPlatformIllustration {...props} />
        <ActivationTimeline {...props} />
        <DemoModeCard {...props} />
      </div>
    </aside>
  );
}
