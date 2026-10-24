import { doctorNavSections, establishmentNavSections } from "./navigation";

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
});
