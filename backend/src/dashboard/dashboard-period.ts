// Days of the dashboard, in the time zone of the practices (Algeria): "today"
// and every day of the activity series start at local midnight, whatever the
// server's own time zone.

export const DASHBOARD_TIME_ZONE = 'Africa/Algiers';

const MINUTE_MS = 60_000;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      year: 'numeric',
    });
    dayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    dayFormatter(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  };
}

// Minutes to add to UTC to read the local clock at that instant (+60 in
// Algiers, which keeps UTC+1 all year round).
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const local = localParts(date, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return Math.round(
    (asUtc - Math.floor(date.getTime() / 1000) * 1000) / MINUTE_MS,
  );
}

// "YYYY-MM-DD" of the local calendar day of an instant.
export function localDayKey(date: Date, timeZone: string): string {
  const { day, month, year } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// The UTC instant of local midnight starting that day.
export function localMidnight(dayKey: string, timeZone: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  // The offset at midnight itself (one correction covers zones with DST).
  const guess =
    utcMidnight -
    timeZoneOffsetMinutes(new Date(utcMidnight), timeZone) * MINUTE_MS;
  return new Date(
    utcMidnight - timeZoneOffsetMinutes(new Date(guess), timeZone) * MINUTE_MS,
  );
}

export type DashboardPeriod = {
  // Local days of the period, oldest first, today last.
  days: string[];
  // [from, to): local midnight of the first day, local midnight after today.
  from: Date;
  to: Date;
  todayStart: Date;
  // Local offset used by the SQL per-day grouping. Constant over the period
  // in Algiers (no daylight saving time).
  offsetMinutes: number;
  timeZone: string;
};

export function buildPeriod(
  now: Date,
  days: number,
  timeZone: string = DASHBOARD_TIME_ZONE,
): DashboardPeriod {
  const today = localDayKey(now, timeZone);
  const dayKeys = Array.from({ length: days }, (_, index) =>
    shiftDayKey(today, index - days + 1),
  );
  return {
    days: dayKeys,
    from: localMidnight(dayKeys[0], timeZone),
    offsetMinutes: timeZoneOffsetMinutes(now, timeZone),
    timeZone,
    to: localMidnight(shiftDayKey(today, 1), timeZone),
    todayStart: localMidnight(today, timeZone),
  };
}

// One value per day of the period, 0 for a day without any row; rows outside
// the period are ignored.
export function fillDailyCounts(
  days: readonly string[],
  rows: readonly { day: string; count: number | bigint }[],
): number[] {
  const counts = new Map(rows.map((row) => [row.day, Number(row.count)]));
  return days.map((day) => counts.get(day) ?? 0);
}
