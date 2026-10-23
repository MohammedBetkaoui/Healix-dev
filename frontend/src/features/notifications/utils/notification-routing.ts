import { type ClinicalNotification } from "../types/notification.types";

export function resolveNotificationDestination(notification: ClinicalNotification, account: "establishment" | "doctor"): string | null {
  const prefix = `/${account}`;
  const id = notification.resourceId;
  // A report finalized by someone else carries the report in its data.
  if (notification.type === "REPORT_FINALIZED" && typeof notification.data?.reportId === "string") {
    return `${prefix}/reports?report=${encodeURIComponent(notification.data.reportId)}`;
  }
  if (!id) return null;
  switch (notification.resourceType) {
    case "APPOINTMENT": return `${prefix}/appointments?appointment=${encodeURIComponent(id)}`;
    case "PATIENT": return `${prefix}/patients/${encodeURIComponent(id)}`;
    case "AI_ANALYSIS_RUN": return `${prefix}/ai-analyses/runs/${encodeURIComponent(id)}`;
    // The id is the analysis run's, not a report's: the reports center opens a report by its own id.
    case "AI_REPORT": return account === "establishment" ? `${prefix}/reports` : `${prefix}/ai-analyses/runs/${encodeURIComponent(id)}`;
    case "CONVERSATION": return `${prefix}/messages?c=${encodeURIComponent(id)}`;
    case "VERIFICATION_REQUEST": return `${prefix}/verification`;
    case "PAYMENT":
    case "SUBSCRIPTION": return `${prefix}/subscription`;
    case "DOCTOR_PROFILE": return account === "establishment" ? `${prefix}/doctors` : `${prefix}/dashboard`;
    default: return null;
  }
}
