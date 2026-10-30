import { describe, expect, it } from "vitest";
import { consultationDoneFor, consultationFor, draftFor } from "./statuses";
import { appointment, consultationSummary } from "./test/fixtures";

const day = "2026-10-30";
const at = (hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).toISOString();

describe("which consultation belongs to an appointment", () => {
  it("is the one started from it, whatever the day or the patient says", () => {
    const slot = appointment("a1", "1", { scheduledAt: at(10) });
    const linked = consultationSummary("c1", "1", { appointmentId: "a1", date: at(15), state: "PENDING_SYNC" });
    expect(consultationFor(slot, [linked])?.localId).toBe("c1");
    expect(consultationDoneFor(slot, [linked])).toBe(true);
  });

  it("a consultation linked to another appointment never marks this one as done", () => {
    const morning = appointment("a1", "1", { scheduledAt: at(9) });
    const afternoon = appointment("a2", "1", { scheduledAt: at(15) });
    const forMorning = consultationSummary("c1", "1", { appointmentId: "a1", date: at(9), state: "SYNCED" });
    expect(consultationDoneFor(morning, [forMorning])).toBe(true);
    expect(consultationDoneFor(afternoon, [forMorning])).toBe(false);
  });

  it("falls back to the same patient on the same day for a consultation linked to nothing", () => {
    const slot = appointment("a1", "1", { scheduledAt: at(10) });
    const unlinked = consultationSummary("c1", "1", { appointmentId: null, date: at(10), state: "SYNCED" });
    const otherPatient = consultationSummary("c2", "2", { appointmentId: null, date: at(10), state: "SYNCED" });
    const otherDay = consultationSummary("c3", "1", { appointmentId: null, date: "2026-10-29T10:00:00.000Z", state: "SYNCED" });
    expect(consultationFor(slot, [otherPatient, otherDay])).toBeUndefined();
    expect(consultationFor(slot, [unlinked])?.localId).toBe("c1");
  });

  it("a draft is resumed, not done; a saved consultation wins over a draft", () => {
    const slot = appointment("a1", "1", { scheduledAt: at(10) });
    const draft = consultationSummary("draft", "1", { appointmentId: "a1", date: at(10), state: "DRAFT" });
    const finished = consultationSummary("done", "1", { appointmentId: "a1", date: at(11), state: "PENDING_SYNC" });
    expect(consultationDoneFor(slot, [draft])).toBe(false);
    expect(draftFor(slot, [draft])?.localId).toBe("draft");
    expect(consultationDoneFor(slot, [draft, finished])).toBe(true);
    expect(draftFor(slot, [draft, finished])).toBeUndefined();
  });
});
