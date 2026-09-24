import {
  Bell,
  BadgeCheck,
  Brain,
  BrainCircuit,
  Calendar,
  CreditCard,
  FileBarChart,
  FileText,
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
    key: "clinic", titleKey: "dashboard.clinical.nav.clinical",
    items: [
      { href: "/establishment/dashboard", icon: LayoutDashboard, key: "dashboard", labelKey: "dashboard.clinical.nav.overview" },
      { href: "/establishment/patients", icon: Users, key: "patients", labelKey: "dashboard.sidebar.establishment.patients" },
      { href: "#appointments", icon: Calendar, key: "appointments", labelKey: "dashboard.sidebar.establishment.appointments" },
      { href: "#doctors", icon: Stethoscope, key: "doctors", labelKey: "dashboard.clinical.nav.team" },
    ],
  },
  {
    key: "care", titleKey: "dashboard.clinical.nav.care",
    items: [
      { href: "#records", icon: FileText, key: "records", labelKey: "dashboard.clinical.nav.records" },
      { href: "#prescriptions", icon: Pill, key: "prescriptions", labelKey: "dashboard.sidebar.establishment.prescriptions" },
      { href: "#lab", icon: FlaskConical, key: "lab", labelKey: "dashboard.clinical.nav.lab" },
    ],
  },
  {
    key: "ai", titleKey: "dashboard.clinical.nav.intelligence",
    items: [
      { href: "#analyses", icon: BrainCircuit, key: "analyses", labelKey: "dashboard.clinical.nav.ai" },
      { href: "#reports", icon: FileBarChart, key: "reports", labelKey: "dashboard.sidebar.establishment.reports" },
    ],
  },
  {
    key: "communication", titleKey: "dashboard.clinical.nav.collaboration",
    items: [
      { href: "#messages", icon: MessageSquare, key: "messages", labelKey: "dashboard.sidebar.establishment.messages" },
      { href: "#notifications", icon: Bell, key: "notifications", labelKey: "dashboard.sidebar.establishment.notifications" },
    ],
  },
  {
    key: "account", titleKey: "dashboard.clinical.nav.management",
    items: [
      { href: "/establishment/verification", icon: BadgeCheck, key: "verification", labelKey: "dashboard.sidebar.establishment.verification" },
      { href: "/establishment/subscription", icon: CreditCard, key: "subscription", labelKey: "dashboard.sidebar.establishment.subscription" },
      { href: "#settings", icon: Settings, key: "settings", labelKey: "dashboard.sidebar.establishment.settings" },
      { href: "/login", icon: LogOut, key: "logout", labelKey: "dashboard.sidebar.establishment.logout" },
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
    titleKey: "dashboard.clinical.nav.intelligence",
    items: [
      {
        badge: { text: "IA", tone: "blue" },
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
    titleKey: "dashboard.clinical.nav.collaboration",
    items: [
      {
        badge: { text: "3", tone: "blue" },
        href: "#messages",
        icon: MessageSquare,
        key: "messages",
        labelKey: "dashboard.sidebar.doctor.messages",
      },
      {
        badge: { text: "7", tone: "blue" },
        href: "#notifications",
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
