import {
  doctorNavSections,
  establishmentNavSections,
  filterNavSectionsByCapabilities,
} from "./navigation";

// A menu entry leads to a page: never to an anchor of the current one (the
// "#settings" and "#lab" it once had went nowhere).
describe.each([
  ["doctor", doctorNavSections],
  ["establishment", establishmentNavSections],
])("the %s menu", (_name, sections) => {
  const items = sections.flatMap((section) => section.items);

  it("only holds links to a page", () => {
    for (const item of items) {
      expect(item.href).toMatch(/^\//);
      expect(item.href).not.toContain("#");
    }
  });

  it("holds each page once, under a key of its own", () => {
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});

describe("the doctor menu", () => {
  it("has no laboratory entry: the page is only an establishment demo", () => {
    const keys = doctorNavSections.flatMap((section) => section.items.map((item) => item.key));
    expect(keys).not.toContain("lab");
  });

  it("opens the settings of the account", () => {
    const hrefs = doctorNavSections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/doctor/settings");
  });

  it("tags no entry with a workspace capability: a doctor account carries none", () => {
    const tagged = doctorNavSections
      .flatMap((section) => section.items)
      .filter((item) => item.requiredCapability);
    expect(tagged).toEqual([]);
  });
});

describe("the establishment menu capabilities", () => {
  const items = establishmentNavSections.flatMap((section) => section.items);
  const capabilityOf = (key: string) =>
    items.find((item) => item.key === key)?.requiredCapability;

  it("runs the owner-only entries on their owner-only capability", () => {
    expect(capabilityOf("verification")).toBe("verification.manage");
    expect(capabilityOf("subscription")).toBe("subscription.manage");
  });

  it("runs the shared management entries on their read capability", () => {
    expect(capabilityOf("organization")).toBe("organization.read");
    expect(capabilityOf("team")).toBe("team.read");
  });

  it("leaves the personal entries open to every membership", () => {
    expect(capabilityOf("settings")).toBeUndefined();
    expect(capabilityOf("logout")).toBeUndefined();
  });
});

describe("filterNavSectionsByCapabilities", () => {
  const sections = establishmentNavSections;
  const hrefs = (filtered: typeof sections) =>
    filtered.flatMap((section) => section.items.map((item) => item.href));

  it("hides the gated entries while the access is unknown, and only them", () => {
    const shown = hrefs(filterNavSectionsByCapabilities(sections, undefined));

    expect(shown).toContain("/establishment/dashboard");
    expect(shown).toContain("/establishment/settings");
    for (const key of ["verification", "subscription", "organization", "team"]) {
      const item = sections
        .flatMap((section) => section.items)
        .find((entry) => entry.key === key);
      expect(item).toBeDefined();
      expect(shown).not.toContain(item!.href);
    }
  });

  it("shows an entry the capability belongs to, and hides the other ones", () => {
    const shown = hrefs(
      filterNavSectionsByCapabilities(sections, ["team.read"]),
    );

    expect(shown).toContain("/establishment/team");
    expect(shown).not.toContain("/establishment/verification");
  });

  it("shows every tagged entry to a full access", () => {
    const shown = hrefs(
      filterNavSectionsByCapabilities(sections, [
        "organization.read",
        "team.read",
        "subscription.manage",
        "verification.manage",
      ]),
    );

    for (const key of ["verification", "subscription", "organization", "team"]) {
      const item = sections
        .flatMap((section) => section.items)
        .find((entry) => entry.key === key);
      expect(shown).toContain(item!.href);
    }
  });

  it("drops a section the filter empties", () => {
    const onlyGated = sections.map((section, index) => ({
      items: index === 0 ? section.items.filter((item) => item.requiredCapability) : [],
      key: section.key,
      titleKey: section.titleKey,
    }));

    expect(
      filterNavSectionsByCapabilities(onlyGated, undefined).map((section) => section.key),
    ).toEqual([]);
  });
});
