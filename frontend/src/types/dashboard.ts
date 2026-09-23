import { type LucideIcon } from "lucide-react";

import { type AccountType } from "./auth";

export type DashboardThemeMode = "light" | "dark" | "system";

export type DashboardSpecialty =
  | "brain"
  | "cardiology"
  | "pathology"
  | "radiology"
  | "pulmonology"
  | "dermatology"
  | "ophthalmology";

export type DashboardNavBadgeTone = "red" | "purple" | "blue";

export type DashboardNavItem = {
  badge?: {
    text: string;
    tone: DashboardNavBadgeTone;
  };
  href: string;
  icon: LucideIcon;
  key: string;
  labelKey: string;
};

export type DashboardNavSection = {
  items: DashboardNavItem[];
  key: string;
  titleKey: string;
};

export type DashboardStat = {
  actionLabelKey?: string;
  hintKey: string;
  icon: LucideIcon;
  key: string;
  labelKey: string;
  tone?: "default" | "accent";
  value: string;
};

export type DashboardLinePoint = {
  label: string;
  primary: number;
  secondary?: number;
};

export type DashboardBarPoint = {
  label: string;
  primary: number;
  secondary?: number;
  specialty?: DashboardSpecialty;
  statusTone?: "warning";
};

export type DashboardStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type DashboardActivityColumnKey =
  | "type"
  | "action"
  | "patient"
  | "date"
  | "status"
  | "cta";

export type DashboardActivityColumn = {
  key: DashboardActivityColumnKey;
  label: string;
};

export type DashboardActivityRow = {
  actionLabel?: string;
  date: string;
  id: string;
  patient: string;
  statusLabel: string;
  statusTone: DashboardStatusTone;
  typeOrAction: string;
};

export type DashboardQuickAction = {
  descriptionKey: string;
  href: string;
  icon: LucideIcon;
  key: string;
  labelKey: string;
};

export type DashboardUserSummary = {
  accountType: AccountType;
  footerSubtitle: string;
  initials: string;
  name: string;
  roleKey: string;
  workspaceSubtitle: string;
};
