import {
  getDisplayStatus,
  isCancelable,
  isDraft,
  isRenewable,
  isValidatable,
  matchesDisplayStatus,
  toStoredStatusFilter,
} from "./prescription-status";

const row = (effectiveStatus: Parameters<typeof getDisplayStatus>[0]["effectiveStatus"], printedAt: string | null = null) => ({
  effectiveStatus,
  printedAt,
  status: effectiveStatus === "EXPIRED" ? ("VALIDATED" as const) : effectiveStatus,
});

describe("getDisplayStatus", () => {
  it("shows PRINTED for a validated prescription that was printed or exported", () => {
    expect(getDisplayStatus(row("VALIDATED", "2026-10-20T10:00:00Z"))).toBe("PRINTED");
  });

  it("keeps VALIDATED while nothing was printed", () => {
    expect(getDisplayStatus(row("VALIDATED"))).toBe("VALIDATED");
  });

  it("keeps the computed EXPIRED and the stored CANCELED even if printed", () => {
    expect(getDisplayStatus(row("EXPIRED", "2026-10-20T10:00:00Z"))).toBe("EXPIRED");
    expect(getDisplayStatus(row("CANCELED", "2026-10-20T10:00:00Z"))).toBe("CANCELED");
  });

  it("never turns a draft into PRINTED", () => {
    expect(getDisplayStatus(row("DRAFT", "2026-10-20T10:00:00Z"))).toBe("DRAFT");
    expect(getDisplayStatus(row("PENDING_VALIDATION"))).toBe("PENDING_VALIDATION");
  });
});

describe("status filter", () => {
  it("asks the API for the stored status, and VALIDATED for the derived ones", () => {
    expect(toStoredStatusFilter("")).toBeUndefined();
    expect(toStoredStatusFilter("DRAFT")).toBe("DRAFT");
    expect(toStoredStatusFilter("CANCELED")).toBe("CANCELED");
    expect(toStoredStatusFilter("PRINTED")).toBe("VALIDATED");
    expect(toStoredStatusFilter("EXPIRED")).toBe("VALIDATED");
  });

  it("narrows the validated rows to the displayed status", () => {
    const printed = row("VALIDATED", "2026-10-20T10:00:00Z");
    const validated = row("VALIDATED");
    const expired = row("EXPIRED");
    expect([printed, validated, expired].filter((candidate) => matchesDisplayStatus(candidate, "PRINTED"))).toEqual([printed]);
    expect([printed, validated, expired].filter((candidate) => matchesDisplayStatus(candidate, "VALIDATED"))).toEqual([validated]);
    expect([printed, validated, expired].filter((candidate) => matchesDisplayStatus(candidate, "EXPIRED"))).toEqual([expired]);
    expect([printed, validated, expired].filter((candidate) => matchesDisplayStatus(candidate, ""))).toHaveLength(3);
  });
});

describe("available actions", () => {
  it("cancels a validated prescription, printed or not, but not an expired one", () => {
    expect(isCancelable(row("VALIDATED"))).toBe(true);
    expect(isCancelable(row("VALIDATED", "2026-10-20T10:00:00Z"))).toBe(true);
    expect(isCancelable(row("EXPIRED"))).toBe(false);
    expect(isCancelable(row("CANCELED"))).toBe(false);
    expect(isCancelable(row("DRAFT"))).toBe(false);
  });

  it("renews a validated prescription (expired included), not a draft or a canceled one", () => {
    expect(isRenewable(row("VALIDATED"))).toBe(true);
    expect(isRenewable(row("EXPIRED"))).toBe(true);
    expect(isRenewable(row("DRAFT"))).toBe(false);
    expect(isRenewable(row("CANCELED"))).toBe(false);
  });

  it("validates a draft or a prescription waiting for validation", () => {
    expect(isValidatable({ status: "DRAFT" })).toBe(true);
    expect(isValidatable({ status: "PENDING_VALIDATION" })).toBe(true);
    expect(isValidatable({ status: "VALIDATED" })).toBe(false);
    expect(isDraft({ status: "DRAFT" })).toBe(true);
    expect(isDraft({ status: "PENDING_VALIDATION" })).toBe(false);
  });
});
