import { messagingCopy } from "./messaging.copy";

// tsc checks that each language has every key of the type; this also checks
// that no text is missing at run time and that the functions answer.
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, entry]) => keyPaths(entry, prefix ? `${prefix}.${key}` : key));
}

describe("messaging copy", () => {
  it("defines the same texts in French and Arabic", () => {
    expect(keyPaths(messagingCopy.ar).sort()).toEqual(keyPaths(messagingCopy.fr).sort());
  });

  it("has no empty text, and its functions answer in each language", () => {
    for (const copy of [messagingCopy.fr, messagingCopy.ar]) {
      for (const path of keyPaths(copy)) {
        const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], copy);
        if (typeof value === "function") {
          const text: unknown = (value as (...args: unknown[]) => unknown)(["Dr A", "Dr B"], "2");
          expect(typeof text === "string" && text.length > 0).toBe(true);
        } else {
          expect(typeof value === "string" && value.length > 0).toBe(true);
        }
      }
    }
    expect(messagingCopy.ar.thread.typing(["د. سمير"])).toBe("د. سمير يكتب…");
  });
});
