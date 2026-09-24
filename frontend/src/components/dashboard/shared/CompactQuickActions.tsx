import { WorkspaceLink as Link } from "../layout/WorkspaceLink";
import { CalendarPlus, Plus, ScanLine, UserRoundPlus } from "lucide-react";
import type { TranslationFunction } from "@/lib/i18n";

const actions = [
  { key: "patient", href: "/establishment/patients", icon: Plus },
  { key: "appointment", href: "#appointments", icon: CalendarPlus },
  { key: "invite", href: "#doctors", icon: UserRoundPlus },
  { key: "analysis", href: "#analyses", icon: ScanLine },
];

export function CompactQuickActions({ t }: { t: TranslationFunction }) {
  return (
    <section className="surface-section" aria-labelledby="quick-actions-heading">
      <div className="clinical-section-heading"><h2 id="quick-actions-heading">{t("dashboard.clinical.actions.title")}</h2></div>
      <div className="compact-actions">{actions.map((action) => <Link key={action.key} href={action.href}>
        <action.icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{t(`dashboard.clinical.actions.${action.key}`)}</span>
      </Link>)}</div>
    </section>
  );
}
