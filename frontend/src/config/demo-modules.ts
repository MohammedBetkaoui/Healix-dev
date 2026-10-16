import { type DashboardNavSection } from "@/types/dashboard";

// The laboratory (/establishment/lab) and medical records
// (/establishment/records) pages run on mock data in the browser
// (laboratory.mock.ts, medical-records.mock.ts): nothing is saved or sent. A
// production build shows them, and their menu entries, only with
// NEXT_PUBLIC_ENABLE_DEMO_MODULES=true; without it, their routes answer 404.
// next dev always shows them. Like every NEXT_PUBLIC_ value, it is written
// into the build: only the literal process.env.… accesses below are inlined.

export function demoModulesEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_DEMO_MODULES === "true";
}

/** The navigation without its demo entries (and without a section they leave empty) when demo modules are off. */
export function withDemoModules(sections: DashboardNavSection[], enabled = demoModulesEnabled()): DashboardNavSection[] {
  if (enabled) return sections;
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.demo) }))
    .filter((section) => section.items.length > 0);
}
