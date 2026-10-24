// The reading priority of the AI analyses (computed by the backend, see
// backend/src/ai-analysis-runs/priority): which results the model itself finds
// suspicious and that no physician has reviewed yet come first. It is an ORDER
// OF READING, never a diagnosis; every place that shows it says so.

import { type DashboardStatusTone } from "@/types/dashboard";

import {
  type AiPriority,
  type AiPriorityLevel,
  type AiPriorityReason,
  type AiRunListItem,
} from "./ai-analyses.types";
import { pendingAge } from "./runs-tracking";

type Translate = (key: string, params?: Record<string, number | string>) => string;
type PriorityLocale = "ar" | "fr";

/** The most runs the dashboard card lists. */
export const PRIORITY_CARD_SIZE = 5;

/** Only these levels are flagged: a ROUTINE run is not, it is read in its turn. */
export const FLAGGED_LEVELS: readonly AiPriorityLevel[] = ["URGENT", "HIGH"];

// A level is always written next to its colour.
export const priorityTones: Record<AiPriorityLevel, DashboardStatusTone> = {
  HIGH: "warning",
  ROUTINE: "neutral",
  URGENT: "danger",
};

export function isFlagged(priority: Pick<AiPriority, "level">): boolean {
  return FLAGGED_LEVELS.includes(priority.level);
}

const intlLocale = (locale: PriorityLocale) => (locale === "ar" ? "ar-DZ" : "fr-DZ");

// A parameter as the reader should see it: a probability as a percentage, a
// score with two decimals, a class or a structure by its name.
function formatParam(name: string, value: number | string, locale: PriorityLocale, t: Translate): string {
  if (typeof value === "number") {
    if (name === "probability") {
      return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0, style: "percent" }).format(value);
    }
    return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: name === "count" ? 0 : 2 }).format(value);
  }
  if (name === "label") return t(`aiAnalyses.classes.${value}`);
  if (name === "structure") return t(`aiAnalyses.priority.structures.${value}`);
  return value;
}

/** One reason in words, in the user's language. */
export function describeReason(reason: AiPriorityReason, locale: PriorityLocale, t: Translate): string {
  // The stored answer alone (no score to quote).
  const code = reason.code === "BREAST_MALIGNANT" && !reason.params ? "BREAST_MALIGNANT_NO_SCORE" : reason.code;
  const params = Object.fromEntries(
    Object.entries(reason.params ?? {}).map(([name, value]) => [name, formatParam(name, value, locale, t)]),
  );
  const key = `aiAnalyses.priority.reasons.${code}`;
  const text = t(key, params);

  // A code the screen does not know yet reads as the code, not as a key.
  return text === key ? reason.code : text;
}

export function priorityReasons(priority: AiPriority, locale: PriorityLocale, t: Translate): string[] {
  return priority.reasons.map((reason) => describeReason(reason, locale, t));
}

/**
 * What the badge says on hover (and to a screen reader): the level, why, and
 * that it is an order of reading.
 */
export function priorityTitle(priority: AiPriority, locale: PriorityLocale, t: Translate): string {
  return [
    t("aiAnalyses.priority.badgeTitle", { level: t(`aiAnalyses.priority.levels.${priority.level}`) }),
    ...priorityReasons(priority, locale, t).map((reason) => `• ${reason}`),
    t("aiAnalyses.priority.disclaimerShort"),
  ].join("\n");
}

/** The runs the dashboard card lists: the flagged ones, in the order the API gave them. */
export function priorityQueue<T extends Pick<AiRunListItem, "priority">>(items: readonly T[], size = PRIORITY_CARD_SIZE): T[] {
  return items.filter((item) => isFlagged(item.priority)).slice(0, size);
}

/** How long a run has been waiting, in hours then days (as the pending figures say it). */
export function waitingAge(createdAt: string, now: Date): { unit: "days" | "hours"; value: number } {
  const hours = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 3_600_000));
  return pendingAge(hours) as { unit: "days" | "hours"; value: number };
}
