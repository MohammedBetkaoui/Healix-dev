import { type TranslationFunction } from "@/lib/i18n";
import { type AdminAuditLogItem } from "@/types/admin";

export type AuditPresentationTone = "danger" | "info" | "success" | "warning";

export type AuditMetadataEntry = {
  label: string;
  value: string;
};

const sensitiveMetadataKeys = new Set([
  "accessToken",
  "password",
  "passwordHash",
  "refreshToken",
  "token",
]);

export function getAuditTone(action: string): AuditPresentationTone {
  if (action.includes("FAILED") || action.includes("REJECTED")) {
    return "danger";
  }

  if (action.includes("SUSPENDED")) {
    return "warning";
  }

  if (
    action.includes("SUCCESS") ||
    action.includes("APPROVED") ||
    action.includes("SUBMITTED") ||
    action.includes("UPLOADED") ||
    action.includes("REACTIVATED") ||
    action.includes("LOGOUT")
  ) {
    return "success";
  }

  return "info";
}

function humanizeConstant(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getOptionalTranslation(
  t: TranslationFunction,
  key: string,
  params?: Record<string, string | number>,
) {
  const value = t(key, params);
  return value === key ? undefined : value;
}

export function getAuditActionLabel(action: string, t: TranslationFunction) {
  return (
    getOptionalTranslation(t, `admin.audit.actions.${action}.label`) ??
    humanizeConstant(action)
  );
}

export function getAuditEntityLabel(entityType: string, t: TranslationFunction) {
  return (
    getOptionalTranslation(t, `admin.audit.entities.${entityType}`) ??
    humanizeConstant(entityType)
  );
}

export function getAuditActionDescription(
  log: AdminAuditLogItem,
  t: TranslationFunction,
) {
  const actor = log.userName ?? t("admin.common.system");
  const action = getAuditActionLabel(log.action, t);
  const entity = getAuditEntityLabel(log.entityType, t);

  return (
    getOptionalTranslation(t, `admin.audit.actions.${log.action}.description`, {
      actor,
      entity,
    }) ??
    t("admin.audit.detail.defaultDescription", {
      action,
      actor,
      entity,
    })
  );
}

function formatMetadataValue(value: unknown, t: TranslationFunction): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? t("admin.common.yes") : t("admin.common.no");
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item, t)).join(", ");
  }

  return t("admin.audit.detail.structuredData");
}

export function getAuditMetadataEntries(
  metadata: unknown,
  t: TranslationFunction,
): AuditMetadataEntry[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  return Object.entries(metadata as Record<string, unknown>)
    .filter(([key]) => !sensitiveMetadataKeys.has(key))
    .map(([key, value]) => ({
      label:
        getOptionalTranslation(t, `admin.audit.metadata.${key}`) ??
        humanizeConstant(key),
      value: formatMetadataValue(value, t),
    }));
}
