import { caseMessagingCopy } from "./case-messaging.copy";

// As messaging.copy.test.ts: the same texts in both languages, none empty,
// the functions answering.
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, entry]) => keyPaths(entry, prefix ? `${prefix}.${key}` : key));
}

describe("case messaging copy", () => {
  it("defines the same texts in French and Arabic", () => {
    expect(keyPaths(caseMessagingCopy.ar).sort()).toEqual(keyPaths(caseMessagingCopy.fr).sort());
  });

  it("has no empty text, and its functions answer in each language", () => {
    for (const copy of [caseMessagingCopy.fr, caseMessagingCopy.ar]) {
      for (const path of keyPaths(copy)) {
        const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], copy);
        if (typeof value === "function") {
          const text: unknown = (value as (...args: unknown[]) => unknown)("Dr Kaci", "12:41");
          expect(typeof text === "string" && text.length > 0).toBe(true);
        } else {
          expect(typeof value === "string" && value.length > 0).toBe(true);
        }
      }
    }
    expect(caseMessagingCopy.fr.message.ackPending(2)).toBe("En attente d’accusé (2)");
    expect(caseMessagingCopy.ar.thread.caseSubtitle(1)).toBe("نقاش حالة · مشارك واحد");
  });

  it("explains every error code of the case discussions and the attachments", () => {
    for (const code of [
      "ATTACHMENT_TOO_LARGE",
      "INVALID_ATTACHMENT_TYPE",
      "INVALID_ATTACHMENTS",
      "CASE_ONLY",
      "CASE_ALREADY_OPEN",
      "PATIENT_NOT_FOUND",
      "CANNOT_ACK_OWN_MESSAGE",
      "MESSAGE_DELETED",
    ]) {
      expect(caseMessagingCopy.fr.errors[code]).toBeTruthy();
      expect(caseMessagingCopy.ar.errors[code]).toBeTruthy();
    }
  });
});
