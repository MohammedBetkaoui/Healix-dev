import {
  analysisHref,
  appointmentFlow,
  attentionLinks,
  chartScaleMax,
  chartTicks,
  decisionBadge,
  labelStep,
  patientName,
  shareOf,
  shortDayLabel,
} from "./dashboard-overview";
import { type DashboardActivityDay } from "./dashboard.types";

const day = (date: string, consultations: number, completedAppointments: number, aiAnalyses: number): DashboardActivityDay => ({
  aiAnalyses,
  completedAppointments,
  consultations,
  date,
});

describe("attentionLinks", () => {
  it("links each kind to the page where it is handled, for the user's role", () => {
    const items = [
      { count: 2, kind: "AI_CONSENT_MISSING" as const },
      { count: 5, kind: "AI_PENDING_OVER_24H" as const },
      { count: 1, kind: "APPOINTMENTS_UNCONFIRMED_TODAY" as const },
    ];

    expect(attentionLinks(items, "/establishment")).toEqual([
      { count: 5, href: "/establishment/ai-analyses/tracking", kind: "AI_PENDING_OVER_24H", priority: true },
      { count: 1, href: "/establishment/appointments", kind: "APPOINTMENTS_UNCONFIRMED_TODAY", priority: false },
      { count: 2, href: "/establishment/patients", kind: "AI_CONSENT_MISSING", priority: false },
    ]);
    expect(attentionLinks(items, "/doctor").map((link) => link.href)).toEqual([
      "/doctor/ai-analyses/tracking",
      "/doctor/appointments",
      "/doctor/patients",
    ]);
  });

  it("puts the urgent messages awaiting an acknowledgement first, as a priority, toward Messages", () => {
    const links = attentionLinks(
      [
        { count: 1, kind: "AI_PENDING_OVER_24H" },
        { count: 3, kind: "URGENT_MESSAGES_UNACKED" },
      ],
      "/doctor",
    );
    expect(links[0]).toEqual({ count: 3, href: "/doctor/messages", kind: "URGENT_MESSAGES_UNACKED", priority: true });
    expect(links.map((link) => link.kind)).toEqual(["URGENT_MESSAGES_UNACKED", "AI_PENDING_OVER_24H"]);
  });

  it("drops what has nothing to handle: an empty list means nothing to do", () => {
    expect(attentionLinks([{ count: 0, kind: "AI_PENDING_OVER_24H" }], "/doctor")).toEqual([]);
    expect(attentionLinks([], "/doctor")).toEqual([]);
  });
});

describe("appointmentFlow", () => {
  it("lists every status in a fixed order with its share of the day", () => {
    expect(
      appointmentFlow({ CANCELED: 1, COMPLETED: 2, CONFIRMED: 0, NO_SHOW: 0, SCHEDULED: 1 }),
    ).toEqual([
      { count: 1, share: 0.25, status: "SCHEDULED" },
      { count: 0, share: 0, status: "CONFIRMED" },
      { count: 2, share: 0.5, status: "COMPLETED" },
      { count: 0, share: 0, status: "NO_SHOW" },
      { count: 1, share: 0.25, status: "CANCELED" },
    ]);
  });

  it("has no share when the day is empty", () => {
    const empty = appointmentFlow({ CANCELED: 0, COMPLETED: 0, CONFIRMED: 0, NO_SHOW: 0, SCHEDULED: 0 });
    expect(empty.every((step) => step.count === 0 && step.share === 0)).toBe(true);
  });
});

describe("activity chart", () => {
  it("puts every series on one round scale above the largest value", () => {
    expect(chartScaleMax([])).toBe(4);
    expect(chartScaleMax([day("2026-10-11", 0, 0, 0)])).toBe(4);
    expect(chartScaleMax([day("2026-10-10", 1, 7, 2)])).toBe(8);
    expect(chartScaleMax([day("2026-10-10", 3, 0, 13), day("2026-10-11", 9, 2, 1)])).toBe(20);
    expect(chartScaleMax([day("2026-10-11", 250, 10, 1)])).toBe(400);
    expect(chartScaleMax([day("2026-10-11", 100, 0, 0)])).toBe(100);
  });

  it("ticks at 0, half and top, all whole numbers", () => {
    for (const max of [4, 8, 20, 60, 400]) {
      const ticks = chartTicks(max);
      expect(ticks).toEqual([0, max / 2, max]);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });

  it("labels fewer days on long periods", () => {
    expect(labelStep(7)).toBe(1);
    expect(labelStep(30)).toBe(5);
    expect(labelStep(90)).toBe(15);
  });

  it("reads days as calendar dates, without shifting them", () => {
    expect(shortDayLabel("2026-10-11", "fr")).toMatch(/^11 oct/);
    expect(shortDayLabel("2026-01-01", "fr")).toMatch(/^1 janv/);
    expect(shortDayLabel("2026-10-11", "ar")).not.toBe("");
  });
});

describe("shares and names", () => {
  it("has no share without a denominator", () => {
    expect(shareOf(2, 5)).toBe(0.4);
    expect(shareOf(0, 5)).toBe(0);
    expect(shareOf(0, 0)).toBeNull();
  });

  it("names a patient in the reading language, with a fallback", () => {
    const patient = { firstName: "Amina", firstNameAr: "أمينة", lastName: "Benali", lastNameAr: "بن علي" };
    expect(patientName(patient, "fr")).toBe("Amina Benali");
    expect(patientName(patient, "ar")).toBe("أمينة بن علي");
    expect(patientName({ ...patient, firstNameAr: "", lastNameAr: "" }, "ar")).toBe("Amina Benali");
  });

  it("links an analysis to its result page", () => {
    expect(analysisHref("/doctor", { id: "run-1", patient: { id: "pat 1" } })).toBe(
      "/doctor/ai-analyses/runs/run-1?patient=pat%201",
    );
  });
});

describe("decisionBadge", () => {
  it("shows the decision of a succeeded analysis, or that one is awaited", () => {
    expect(decisionBadge({ decision: null, status: "SUCCEEDED" })).toEqual({
      key: "aiAnalyses.tracking.worklist.pending",
      pending: true,
      tone: "info",
    });
    expect(decisionBadge({ decision: "VALIDATED", status: "SUCCEEDED" }).tone).toBe("success");
    expect(decisionBadge({ decision: "CORRECTED", status: "SUCCEEDED" }).tone).toBe("warning");
    expect(decisionBadge({ decision: "REJECTED", status: "SUCCEEDED" })).toEqual({
      key: "aiAnalyses.decision.statuses.REJECTED",
      pending: false,
      tone: "danger",
    });
  });

  it("shows the state of an analysis that did not succeed", () => {
    expect(decisionBadge({ decision: null, status: "FAILED" })).toEqual({
      key: "aiAnalyses.tracking.filters.statuses.FAILED",
      pending: false,
      tone: "neutral",
    });
  });
});
