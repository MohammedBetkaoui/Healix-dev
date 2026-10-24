import {
  DASHBOARD_TIME_ZONE,
  localDayKey,
  localMidnight,
} from '../dashboard/dashboard-period';
import { BillingPeriod } from '../common/enums/billing-period.enum';

export const DAY_MS = 24 * 60 * 60 * 1_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// Calendar months, in UTC. A day that does not exist in the target month
// lands on its last day (31 January + 1 month is 28 February, not 3 March).
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function billingPeriodMonths(billingPeriod: string): number {
  return billingPeriod === BillingPeriod.ANNUAL ? 12 : 1;
}

export function addBillingPeriod(date: Date, billingPeriod: string): Date {
  return addMonths(date, billingPeriodMonths(billingPeriod));
}

// Whole days left, rounded up (a subscription that ends in 3 hours has one
// day left); 0 once it has ended.
export function daysLeft(expiresAt: Date | null, now: Date): number | null {
  if (!expiresAt) {
    return null;
  }

  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
}

// The monthly AI quota restarts on the 1st at midnight in Algiers (UTC+1, no
// daylight saving), whatever the time zone of the server.
export function startOfQuotaMonth(now: Date): Date {
  const [year, month] = localDayKey(now, DASHBOARD_TIME_ZONE).split('-');
  return localMidnight(`${year}-${month}-01`, DASHBOARD_TIME_ZONE);
}
