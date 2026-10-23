import { resolveNotificationDestination } from "./notification-routing";
import { type ClinicalNotification } from "../types/notification.types";

const notification = (resourceType: ClinicalNotification["resourceType"], resourceId = "resource 1") => ({
  id: "n1", category: "SYSTEM", type: "TEST", severity: "INFO",
  resourceType, resourceId, data: null, readAt: null, createdAt: "2026-10-20T08:00:00.000Z",
}) satisfies ClinicalNotification;

describe("resolveNotificationDestination", () => {
  it("uses the current professional space without duplicating the mapping", () => {
    expect(resolveNotificationDestination(notification("APPOINTMENT"), "establishment")).toBe("/establishment/appointments?appointment=resource%201");
    expect(resolveNotificationDestination(notification("APPOINTMENT"), "doctor")).toBe("/doctor/appointments?appointment=resource%201");
  });
  it("routes AI reports to the available destination for each account", () => {
    expect(resolveNotificationDestination(notification("AI_REPORT", "run-1"), "establishment")).toBe("/establishment/reports?report=run-1");
    expect(resolveNotificationDestination(notification("AI_REPORT", "run-1"), "doctor")).toBe("/doctor/ai-analyses/runs/run-1");
  });
  it("does not invent a destination when the resource is absent", () => {
    expect(resolveNotificationDestination(notification("SYSTEM", ""), "doctor")).toBeNull();
  });
});
