import {
  BrainCircuit, Calendar, ClipboardList, LayoutDashboard, Pill, RefreshCw, Settings, Users,
  type LucideIcon,
} from "lucide-react";
import { fr } from "../i18n/fr";
import type { LocalPatient } from "../types";

// The pages of the Desktop workspace. No routing library: the shell holds the
// current route in state.
export type Route =
  | { name: "today" }
  | { name: "patients" }
  | { name: "patient"; id: string }
  | { name: "appointments" }
  | { name: "consultations" }
  // A consultation or a prescription: `id` is its local id, or NEW_ID to start
  // one (for a patient, optionally with the reason of an appointment).
  | { name: "consultation"; id: string; patientId?: string; patientName?: string; reason?: string }
  | { name: "prescription"; id: string; patientId?: string; patientName?: string }
  | { name: "prescriptions" }
  | { name: "sync" }
  | { name: "settings" };

export const NEW_ID = "new";

export type NavKey = keyof typeof fr.nav.items;

export type NavItem = {
  key: NavKey;
  icon: LucideIcon;
  // Opens the Web platform in the browser instead of a Desktop page.
  external?: boolean;
};

export type NavSection = {
  key: keyof typeof fr.nav.sections;
  items: NavItem[];
};

// Same section names and icons as the Web workspace
// (frontend/src/components/dashboard/layout/navigation.ts).
export const navSections: NavSection[] = [
  {
    key: "clinical",
    items: [
      { key: "today", icon: LayoutDashboard },
      { key: "patients", icon: Users },
      { key: "appointments", icon: Calendar },
      { key: "consultations", icon: ClipboardList },
    ],
  },
  { key: "care", items: [{ key: "prescriptions", icon: Pill }] },
  { key: "intelligence", items: [{ key: "ai", icon: BrainCircuit, external: true }] },
  {
    key: "management",
    items: [
      { key: "sync", icon: RefreshCw },
      { key: "settings", icon: Settings },
    ],
  },
];

// The menu entry a route belongs to: an open record is under Patients.
export function activeNavKey(route: Route): NavKey {
  switch (route.name) {
    case "patient":
      return "patients";
    case "consultation":
      return "consultations";
    case "prescription":
      return "prescriptions";
    default:
      return route.name;
  }
}

// Pages that open from another one and offer "Retour".
export const isDetailRoute = (route: Route) =>
  route.name === "patient" || route.name === "consultation" || route.name === "prescription";

export function routeTitle(route: Route, patient?: LocalPatient | null): string {
  if (route.name === "patient") {
    return patient ? fr.header.titles.patient(`${patient.firstName} ${patient.lastName}`) : fr.header.titles.patients;
  }
  return fr.header.titles[route.name];
}

export const MAX_RECENT_PATIENTS = 5;

// The records opened during this session, most recent first, at most five.
// Kept in memory only.
export function pushRecentPatient(recent: LocalPatient[], patient: LocalPatient): LocalPatient[] {
  return [patient, ...recent.filter((item) => item.id !== patient.id)].slice(0, MAX_RECENT_PATIENTS);
}
