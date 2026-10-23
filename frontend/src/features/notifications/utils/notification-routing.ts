import { type ClinicalNotification } from "../types/notification.types";

export function resolveNotificationDestination(notification: ClinicalNotification, account: "establishment" | "doctor"): string | null {
  const prefix = `/${account}`;
  const id = notification.resourceId;
  if (!id) return null;
  switch (notification.resourceType) {
    case "APPOINTMENT": return `${prefix}/appointments?appointment=${encodeURIComponent(id)}`;
    case "PATIENT": return `${prefix}/patients/${encodeURIComponent(id)}`;
    case "AI_ANALYSIS_RUN": return `${prefix}/ai-analyses/runs/${encodeURIComponent(id)}`;
    case "AI_REPORT": return account === "establishment" ? `${prefix}/reports?report=${encodeURIComponent(id)}` : `${prefix}/ai-analyses/runs/${encodeURIComponent(id)}`;
    case "CONVERSATION": return `${prefix}/messages?c=${encodeURIComponent(id)}`;
    case "VERIFICATION_REQUEST": return `${prefix}/verification`;
    case "PAYMENT":
    case "SUBSCRIPTION": return `${prefix}/subscription`;
    case "DOCTOR_PROFILE": return account === "establishment" ? `${prefix}/doctors` : `${prefix}/dashboard`;
    default: return null;
  }
}
