import { dictionaries } from "@/i18n";

// tsc only checks that ar has every fr key (Dictionary is derived from fr):
// a key present in ar alone would go unnoticed. Compare both ways.
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, entry]) =>
    keyPaths(entry, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n dictionaries", () => {
  it("define exactly the same keys in fr and ar", () => {
    const fr = new Set(keyPaths(dictionaries.fr));
    const ar = new Set(keyPaths(dictionaries.ar));

    // Guards against a vacuous pass (e.g. an empty import).
    expect(fr.has("common.verificationRequired.description")).toBe(true);
    expect([...fr].filter((path) => !ar.has(path))).toEqual([]);
    expect([...ar].filter((path) => !fr.has(path))).toEqual([]);
  });
});
