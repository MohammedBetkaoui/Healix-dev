import { renderToStaticMarkup } from "react-dom/server";

import LaboratoryRoute from "@/app/establishment/lab/page";
import MedicalRecordsRoute from "@/app/establishment/records/page";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { DemoModuleBanner } from "@/components/dashboard/shared/DemoModule";
import { dictionaries } from "@/i18n";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";
import { translate } from "@/lib/i18n";
import { type DashboardNavSection } from "@/types/dashboard";

import { demoModulesEnabled, withDemoModules } from "./demo-modules";

// The pages render here without a session, a router or the API: only what
// reaches them is replaced.
jest.mock("@/lib/auth/server-auth", () => ({ requireAuthenticatedPage: jest.fn(async () => undefined) }));
jest.mock("@/features/auth/hooks/use-logout", () => ({ useLogout: () => ({ isLoading: false, logout: jest.fn() }) }));
jest.mock("@/features/auth/hooks/use-current-user", () => ({ useCurrentUser: () => ({ data: undefined }) }));
jest.mock("@/features/verification/hooks/use-establishment-verification-prefill", () => ({
  useEstablishmentVerificationPrefill: () => ({ data: undefined }),
}));
// The shell's unread badge and real-time connection (Messages).
jest.mock("@/features/messaging/messaging.queries", () => ({ useUnreadCount: () => ({ data: undefined }) }));
jest.mock("@/lib/realtime/use-realtime-events", () => ({ useRealtimeEvents: () => undefined }));

const DEMO_ROUTES = ["/establishment/records", "/establishment/lab"];
const routes = [
  ["/establishment/lab", LaboratoryRoute],
  ["/establishment/records", MedicalRecordsRoute],
] as const;

// NODE_ENV is typed read-only; the tests set it as a build would.
const env = process.env as Record<string, string | undefined>;
const saved = { flag: env.NEXT_PUBLIC_ENABLE_DEMO_MODULES, nodeEnv: env.NODE_ENV };

function setEnv(nodeEnv: string, flag?: string) {
  env.NODE_ENV = nodeEnv;
  if (flag === undefined) delete env.NEXT_PUBLIC_ENABLE_DEMO_MODULES;
  else env.NEXT_PUBLIC_ENABLE_DEMO_MODULES = flag;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => setEnv(saved.nodeEnv ?? "test", saved.flag));

const hrefs = (sections: DashboardNavSection[]) => sections.flatMap((section) => section.items.map((item) => item.href));
const html = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;");
const banner = (locale: "fr" | "ar") => translate(dictionaries[locale], "dashboard.clinical.demo.banner");

// The sidebar and the search of an establishment page, as rendered.
function renderShell() {
  return renderToStaticMarkup(
    <DashboardShell
      accountType="ESTABLISHMENT"
      activeKey="dashboard"
      navSections={establishmentNavSections}
      titleKey="dashboard.clinical.nav.overview"
      user={{
        accountType: "ESTABLISHMENT",
        footerSubtitle: "Administration",
        initials: "HD",
        name: "Administration",
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle: "Clinique",
      }}
    >
      <p>contenu</p>
    </DashboardShell>,
  );
}

describe("demoModulesEnabled", () => {
  it.each([
    ["production", undefined, false],
    ["production", "true", true],
    ["production", "1", false],
    ["production", "false", false],
    ["test", undefined, false],
    ["development", undefined, true],
  ])("NODE_ENV=%s, NEXT_PUBLIC_ENABLE_DEMO_MODULES=%s: %s", (nodeEnv, flag, expected) => {
    setEnv(nodeEnv, flag);
    expect(demoModulesEnabled()).toBe(expected);
  });
});

describe("demo modules in the menu", () => {
  it("flags exactly the laboratory and the medical records", () => {
    const flagged = [...establishmentNavSections, ...doctorNavSections]
      .flatMap((section) => section.items)
      .filter((item) => item.demo)
      .map((item) => item.href);

    expect(flagged).toEqual(DEMO_ROUTES);
  });

  it("hides their entries without the variable, and only them", () => {
    setEnv("production");

    expect(hrefs(withDemoModules(establishmentNavSections))).toEqual(
      hrefs(establishmentNavSections).filter((href) => !DEMO_ROUTES.includes(href)),
    );
  });

  it("keeps every entry with the variable", () => {
    setEnv("production", "true");

    expect(withDemoModules(establishmentNavSections)).toBe(establishmentNavSections);
  });

  it("drops a section the demo entries leave empty", () => {
    const sections = [
      { items: establishmentNavSections[1].items.filter((item) => item.demo), key: "demo", titleKey: "t" },
      establishmentNavSections[0],
    ];

    expect(withDemoModules(sections, false).map((section) => section.key)).toEqual([establishmentNavSections[0].key]);
  });

  it("leaves them out of the rendered sidebar and search without the variable, and badges them with it", () => {
    setEnv("production");
    const hidden = renderShell();
    // Guards against a vacuous pass: the other entries are there.
    expect(hidden).toContain('href="/establishment/patients"');
    for (const route of DEMO_ROUTES) expect(hidden).not.toContain(`href="${route}"`);
    expect(hidden).not.toContain(translate(dictionaries.fr, "dashboard.clinical.demo.badge"));

    setEnv("production", "true");
    const shown = renderShell();
    for (const route of DEMO_ROUTES) expect(shown).toContain(`href="${route}"`);
    expect(shown).toContain(`aria-label="${html("Laboratoire & examens (Démo)")}"`);
    expect(shown).toContain('aria-label="Dossiers médicaux (Démo)"');
  });
});

describe("demo module routes", () => {
  it.each(routes)("%s answers 404 without the variable, before any session check", async (_route, Route) => {
    setEnv("production");

    await expect(Route()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(requireAuthenticatedPage).not.toHaveBeenCalled();
  });

  it.each(routes)("%s renders with its demo banner at the top with the variable", async (route, Route) => {
    setEnv("production", "true");
    const page = renderToStaticMarkup(await Route());

    expect(requireAuthenticatedPage).toHaveBeenCalledWith(["ESTABLISHMENT_ADMIN"], route);
    expect(page).toContain(html(banner("fr")));
    // First in the page content, before the page's own heading.
    expect(page.indexOf("data-demo-banner")).toBeGreaterThan(-1);
    expect(page.indexOf("data-demo-banner")).toBeLessThan(page.indexOf("<h1"));
  });

  it("words the banner in French and in Arabic", () => {
    expect(banner("fr")).toBe("Module en démonstration — données fictives, rien n’est enregistré ni transmis");
    for (const locale of ["fr", "ar"] as const) {
      const rendered = renderToStaticMarkup(<DemoModuleBanner t={(key) => translate(dictionaries[locale], key)} />);
      expect(rendered).toContain(html(banner(locale)));
      expect(rendered).toContain('role="note"');
    }
  });
});
