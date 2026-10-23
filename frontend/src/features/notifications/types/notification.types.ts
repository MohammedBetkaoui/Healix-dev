export type NotificationCategory =
  | "APPOINTMENT" | "PATIENT" | "AI_ANALYSIS" | "REPORT"
  | "PRESCRIPTION" | "MESSAGING" | "VERIFICATION" | "SUBSCRIPTION"
  | "PAYMENT" | "TEAM" | "SECURITY" | "SYSTEM";
export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
export type NotificationResourceType =
  | "APPOINTMENT" | "PATIENT" | "AI_ANALYSIS_RUN" | "AI_REPORT"
  | "PRESCRIPTION" | "CONVERSATION" | "VERIFICATION_REQUEST" | "PAYMENT"
  | "SUBSCRIPTION" | "DOCTOR_PROFILE" | "USER" | "SYSTEM";
export type NotificationReadStatus = "ALL" | "UNREAD" | "READ";

export type ClinicalNotification = {
  id: string;
  category: NotificationCategory;
  type: string;
  severity: NotificationSeverity;
  resourceType: NotificationResourceType | null;
  resourceId: string | null;
  data: Record<string, string | number | boolean> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = {
  data: ClinicalNotification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type NotificationFilters = {
  status: NotificationReadStatus;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
};

export type NotificationPreference = {
  category: NotificationCategory;
  inAppEnabled: boolean;
  mandatory: boolean;
};
