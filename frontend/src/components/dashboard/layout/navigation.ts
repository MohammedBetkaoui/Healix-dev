import {
  Bell,
  BadgeCheck,
  Brain,
  BrainCircuit,
  Calendar,
  CreditCard,
  FileBarChart,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Pill,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";

import { type DashboardNavSection } from "@/types/dashboard";

export const establishmentNavSections: DashboardNavSection[] = [
  {
    key: "clinic",
    titleKey: "dashboard.sidebar.sections.clinic",
    items: [
      {
        href: "/establishment/dashboard",
        icon: LayoutDashboard,
        key: "dashboard",
        labelKey: "dashboard.sidebar.establishment.dashboard",
      },
      {
        href: "/establishment/patients",
        icon: Users,
        key: "patients",
        labelKey: "dashboard.sidebar.establishment.patients",
      },
      {
        href: "#doctors",
        icon: Stethoscope,
        key: "doctors",
        labelKey: "dashboard.sidebar.establishment.doctors",
      },
      {
        href: "#appointments",
        icon: Calendar,
        key: "appointments",
        labelKey: "dashboard.sidebar.establishment.appointments",
      },
      {
        href: "#prescriptions",
        icon: Pill,
        key: "prescriptions",
        labelKey: "dashboard.sidebar.establishment.prescriptions",
      },
    ],
  },
  {
    key: "ai",
    titleKey: "dashboard.sidebar.sections.ai",
    items: [
      {
        badge: { text: "IA", tone: "purple" },
        href: "#analyses",
        icon: BrainCircuit,
        key: "analyses",
        labelKey: "dashboard.sidebar.establishment.analyses",
      },
      {
        href: "#lab",
        icon: FlaskConical,
        key: "lab",
        labelKey: "dashboard.sidebar.establishment.lab",
      },
      {
        href: "#reports",
        icon: FileBarChart,
        key: "reports",
        labelKey: "dashboard.sidebar.establishment.reports",
      },
    ],
  },
  {
    key: "communication",
    titleKey: "dashboard.sidebar.sections.communication",
    items: [
      {
        badge: { text: "3", tone: "red" },
        href: "#messages",
        icon: MessageSquare,
        key: "messages",
        labelKey: "dashboard.sidebar.establishment.messages",
      },
      {
        badge: { text: "7", tone: "red" },
        href: "#notifications",
        icon: Bell,
        key: "notifications",
        labelKey: "dashboard.sidebar.establishment.notifications",
      },
    ],
  },
  {
    key: "account",
    titleKey: "dashboard.sidebar.sections.account",
    items: [
      {
        href: "/establishment/verification",
        icon: BadgeCheck,
        key: "verification",
        labelKey: "dashboard.sidebar.establishment.verification",
      },
      {
        href: "/establishment/subscription",
        icon: CreditCard,
        key: "subscription",
        labelKey: "dashboard.sidebar.establishment.subscription",
      },
      {
        href: "#settings",
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
    titleKey: "dashboard.sidebar.sections.clinic",
    items: [
      {
        href: "/doctor/dashboard",
        icon: LayoutDashboard,
        key: "dashboard",
        labelKey: "dashboard.sidebar.doctor.dashboard",
      },
      {
        href: "/doctor/patients",
        icon: Users,
        key: "patients",
        labelKey: "dashboard.sidebar.doctor.patients",
      },
      {
        href: "#consultations",
        icon: Stethoscope,
        key: "consultations",
        labelKey: "dashboard.sidebar.doctor.consultations",
      },
      {
        href: "#appointments",
        icon: Calendar,
        key: "appointments",
        labelKey: "dashboard.sidebar.doctor.appointments",
      },
      {
        href: "#prescriptions",
        icon: Pill,
        key: "prescriptions",
        labelKey: "dashboard.sidebar.doctor.prescriptions",
      },
    ],
  },
  {
    key: "ai",
    titleKey: "dashboard.sidebar.sections.ai",
    items: [
      {
        badge: { text: "IA", tone: "purple" },
        href: "#analyses",
        icon: Brain,
        key: "analyses",
        labelKey: "dashboard.sidebar.doctor.analyses",
      },
      {
        href: "#lab",
        icon: FlaskConical,
        key: "lab",
        labelKey: "dashboard.sidebar.doctor.lab",
      },
      {
        href: "#reports",
        icon: FileBarChart,
        key: "reports",
        labelKey: "dashboard.sidebar.doctor.reports",
      },
    ],
  },
  {
    key: "communication",
    titleKey: "dashboard.sidebar.sections.communication",
    items: [
      {
        badge: { text: "3", tone: "red" },
        href: "#messages",
        icon: MessageSquare,
        key: "messages",
        labelKey: "dashboard.sidebar.doctor.messages",
      },
      {
        badge: { text: "7", tone: "red" },
        href: "#notifications",
        icon: Bell,
        key: "notifications",
        labelKey: "dashboard.sidebar.doctor.notifications",
      },
    ],
  },
  {
    key: "account",
    titleKey: "dashboard.sidebar.sections.account",
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
        href: "#settings",
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
