import { WorkspaceLink as Link } from "../layout/WorkspaceLink";
import { CalendarPlus, Plus, ScanLine, UserRoundPlus, type LucideIcon } from "lucide-react";
import type { TranslationFunction } from "@/lib/i18n";

export type CompactQuickAction = {
  key: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
};

const establishmentActions: readonly CompactQuickAction[] = [
  { key: "patient", href: "/establishment/patients", icon: Plus, labelKey: "dashboard.clinical.actions.patient" },
  { key: "appointment", href: "#appointments", icon: CalendarPlus, labelKey: "dashboard.clinical.actions.appointment" },
  { key: "invite", href: "#doctors", icon: UserRoundPlus, labelKey: "dashboard.clinical.actions.invite" },
  { key: "analysis", href: "#analyses", icon: ScanLine, labelKey: "dashboard.clinical.actions.analysis" },
];

export function CompactQuickActions({ t, actions = establishmentActions }: { t: TranslationFunction; actions?: readonly CompactQuickAction[] }) {
  return (
    <section className="surface-section" aria-labelledby="quick-actions-heading">
      <div className="clinical-section-heading"><h2 id="quick-actions-heading">{t("dashboard.clinical.actions.title")}</h2></div>
      <div className="compact-actions">{actions.map((action) => <Link key={action.key} href={action.href}>
        <action.icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{t(action.labelKey)}</span>
      </Link>)}</div>
    </section>
  );
}
