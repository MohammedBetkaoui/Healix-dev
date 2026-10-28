import {
  Activity,
  Bell,
  BadgeCheck,
  Brain,
  BrainCircuit,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  Pill,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";

import { type DashboardNavSection } from "@/types/dashboard";

// The sidebar is capability-aware: an entry tagged with a requiredCapability
// shows only for a workspace access that holds it. Unknown access (profile
// still loading, or a doctor account whose workspace access is null) hides
// the gated entries and never the others — the menu must not promise what
// the server would refuse. A section left empty disappears, like under the
// demo filter.
export function filterNavSectionsByCapabilities(
  sections: DashboardNavSection[],
  capabilities: readonly string[] | null | undefined,
): DashboardNavSection[] {
  const holds = (capability: string) =>
    capabilities?.includes(capability) ?? false;

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.requiredCapability || holds(item.requiredCapability),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export const establishmentNavSections: DashboardNavSection[] = [
  {
    key: "clinic",
    titleKey: "dashboard.clinical.nav.clinical",
    items: [
      {
        href: "/establishment/dashboard",
        icon: LayoutDashboard,
        key: "dashboard",
        labelKey: "dashboard.clinical.nav.overview",
      },
      {
        href: "/establishment/patients",
        icon: Users,
        key: "patients",
        labelKey: "dashboard.sidebar.establishment.patients",
      },
      {
        href: "/establishment/appointments",
        icon: Calendar,
        key: "appointments",
        labelKey: "dashboard.sidebar.establishment.appointments",
      },
      {
        href: "/establishment/consultations",
        icon: ClipboardList,
        key: "consultations",
        labelKey: "dashboard.sidebar.establishment.consultations",
      },
    ],
  },
  {
    key: "care",
    titleKey: "dashboard.clinical.nav.care",
    items: [
      {
        demo: true,
        href: "/establishment/records",
        icon: FileText,
        key: "records",
        labelKey: "dashboard.clinical.nav.records",
      },
      {
        href: "/establishment/prescriptions",
        icon: Pill,
        key: "prescriptions",
        labelKey: "dashboard.sidebar.establishment.prescriptions",
      },
      {
        demo: true,
        href: "/establishment/lab",
        icon: FlaskConical,
        key: "lab",
        labelKey: "dashboard.clinical.nav.lab",
      },
    ],
  },
  {
    key: "ai",
    titleKey: "dashboard.clinical.nav.intelligence",
    items: [
      {
        href: "/establishment/ai-analyses",
        icon: BrainCircuit,
        key: "analyses",
        labelKey: "dashboard.clinical.nav.ai",
      },
      {
        href: "/establishment/ai-analyses/tracking",
        icon: ListChecks,
        key: "aiTracking",
        labelKey: "dashboard.clinical.nav.aiTracking",
      },
      {
        href: "/establishment/ai-analyses/monitoring",
        icon: Activity,
        key: "aiMonitoring",
        labelKey: "dashboard.clinical.nav.aiMonitoring",
      },
      {
        href: "/establishment/reports",
        icon: FileBarChart,
        key: "reports",
        labelKey: "dashboard.sidebar.establishment.reports",
      },
    ],
  },
  {
    key: "communication",
    titleKey: "dashboard.clinical.nav.collaboration",
    items: [
      {
        href: "/establishment/messages",
        icon: MessageSquare,
        key: "messages",
        labelKey: "dashboard.sidebar.establishment.messages",
      },
      {
        href: "/establishment/notifications",
        icon: Bell,
        key: "notifications",
        labelKey: "dashboard.sidebar.establishment.notifications",
      },
    ],
  },
  {
    key: "account",
    titleKey: "dashboard.clinical.nav.management",
    items: [
      {
        href: "/establishment/verification",
        icon: BadgeCheck,
        key: "verification",
        labelKey: "dashboard.sidebar.establishment.verification",
        requiredCapability: "verification.manage",
      },
      {
        href: "/establishment/subscription",
        icon: CreditCard,
        key: "subscription",
        labelKey: "dashboard.sidebar.establishment.subscription",
        requiredCapability: "subscription.manage",
      },
      {
        href: "/establishment/organization",
        icon: Building2,
        key: "organization",
        labelKey: "dashboard.sidebar.establishment.organization",
        requiredCapability: "organization.read",
      },
      {
        href: "/establishment/team",
        icon: Users,
        key: "team",
        labelKey: "dashboard.sidebar.establishment.team",
        requiredCapability: "team.read",
      },
      {
        href: "/establishment/settings",
        icon: Settings,
        key: "settings",
        labelKey: "dashboard.sidebar.establishment.settings",
      },
      {
        href: "/login",
        icon: LogOut,
        key: "logout",
        labelKey: "dashboard.sidebar.establishment.logout",
      },
    ],
  },
];

export const doctorNavSections: DashboardNavSection[] = [
  {
    key: "clinic",
    titleKey: "dashboard.clinical.nav.clinical",
    items: [
      {
        href: "/doctor/dashboard",
        icon: LayoutDashboard,
        key: "dashboard",
        labelKey: "dashboard.clinical.nav.overview",
      },
      {
        href: "/doctor/patients",
        icon: Users,
        key: "patients",
        labelKey: "dashboard.sidebar.doctor.patients",
      },
      {
        href: "/doctor/consultations",
        icon: Stethoscope,
        key: "consultations",
        labelKey: "dashboard.sidebar.doctor.consultations",
      },
      {
        href: "/doctor/appointments",
        icon: Calendar,
        key: "appointments",
        labelKey: "dashboard.sidebar.doctor.appointments",
      },
      {
        href: "/doctor/prescriptions",
        icon: Pill,
        key: "prescriptions",
        labelKey: "dashboard.sidebar.doctor.prescriptions",
      },
    ],
  },
  {
    key: "ai",
    titleKey: "dashboard.clinical.nav.intelligence",
    items: [
      {
        badge: { text: "IA", tone: "blue" },
        href: "/doctor/ai-analyses",
        icon: Brain,
        key: "analyses",
        labelKey: "dashboard.sidebar.doctor.analyses",
      },
      {
        href: "/doctor/ai-analyses/tracking",
        icon: ListChecks,
        key: "aiTracking",
        labelKey: "dashboard.clinical.nav.aiTracking",
      },
      {
        href: "/doctor/ai-analyses/monitoring",
        icon: Activity,
        key: "aiMonitoring",
        labelKey: "dashboard.clinical.nav.aiMonitoring",
      },
      {
        href: "/doctor/reports",
        icon: FileBarChart,
        key: "reports",
        labelKey: "dashboard.sidebar.doctor.reports",
      },
    ],
  },
  {
    key: "communication",
    titleKey: "dashboard.clinical.nav.collaboration",
    items: [
      {
        // Its unread badge is live (MessagesNavBadge).
        href: "/doctor/messages",
        icon: MessageSquare,
        key: "messages",
        labelKey: "dashboard.sidebar.doctor.messages",
      },
      {
        href: "/doctor/notifications",
        icon: Bell,
        key: "notifications",
        labelKey: "dashboard.sidebar.doctor.notifications",
      },
    ],
  },
  {
    key: "account",
    titleKey: "dashboard.clinical.nav.management",
    items: [
      {
        href: "/doctor/verification",
        icon: BadgeCheck,
        key: "verification",
        labelKey: "dashboard.sidebar.doctor.verification",
      },
      {
        href: "/doctor/subscription",
        icon: CreditCard,
        key: "subscription",
        labelKey: "dashboard.sidebar.doctor.subscription",
      },
      {
        href: "/doctor/settings",
        icon: Settings,
        key: "settings",
        labelKey: "dashboard.sidebar.doctor.settings",
      },
      {
        href: "/login",
        icon: LogOut,
        key: "logout",
        labelKey: "dashboard.sidebar.doctor.logout",
      },
    ],
  },
];
