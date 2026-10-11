import { type LucideIcon } from "lucide-react";

import { type AccountType } from "./auth";

export type DashboardThemeMode = "light" | "dark" | "system";

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

export type DashboardStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type DashboardUserSummary = {
  accountType: AccountType;
  footerSubtitle: string;
  initials: string;
  name: string;
  roleKey: string;
  workspaceSubtitle: string;
};
