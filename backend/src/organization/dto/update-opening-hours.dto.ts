import { IsObject } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

// Opening hours never enter the database unparsed: the frontend sends an
// arbitrary JSON, the backend rebuilds a normalized structure or refuses the
// request. Algerian context: the closed days are whatever the establishment
// chooses (Friday is often the closed day in Algeria, not Saturday/Sunday).

export const OPENING_HOURS_DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type OpeningHoursDay = (typeof OPENING_HOURS_DAYS)[number];

export type OpeningHoursPeriod = { start: string; end: string };

export type OpeningHoursStructure = Record<
  OpeningHoursDay,
  { closed: boolean; periods: OpeningHoursPeriod[] }
>;

export class UpdateOpeningHoursDto {
  @IsObject({ message: 'Les horaires sont invalides.' })
  openingHours!: unknown;
}

// true when the JSON looks exactly like a structure parseOpeningHours wrote:
// seven days, boolean closed flags, periods of { start, end } HH:mm strings.
// The column is read everywhere; an unexpected value is treated as "no hours"
// instead of breaking a read.
export function isKnownOpeningHours(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  const days = Object.keys(value as Record<string, unknown>);

  if (days.length !== OPENING_HOURS_DAYS.length) {
    return false;
  }

  return OPENING_HOURS_DAYS.every((day) => {
    const dayValue = (value as Record<string, unknown>)[day];

    if (dayValue === null || dayValue === undefined || typeof dayValue !== 'object') {
      return false;
    }

    const { closed, periods } = dayValue as {
      closed?: unknown;
      periods?: unknown;
    };

    if (typeof closed !== 'boolean') {
      return false;
    }

    if (!Array.isArray(periods)) {
      return false;
    }

    return periods.every(
      (period) =>
        period !== null &&
        typeof period === 'object' &&
        typeof (period as OpeningHoursPeriod).start === 'string' &&
        TIME_PATTERN.test((period as OpeningHoursPeriod).start) &&
        typeof (period as OpeningHoursPeriod).end === 'string' &&
        TIME_PATTERN.test((period as OpeningHoursPeriod).end),
    );
  });
}

// How the organization response reads the column: a stored JSON that was never
// written by parseOpeningHours (manual edit, legacy import) becomes null, and
// the interface simply shows "no hours configured".
export function readOpeningHours(value: unknown): OpeningHoursStructure | null {
  return isKnownOpeningHours(value)
    ? (value as OpeningHoursStructure)
    : null;
}


// HH:mm over 24h: "08:00", "16:30", never "8h", never seconds.
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MAX_PERIODS_PER_DAY = 3;

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function readTime(value: unknown, message: string): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new BadRequestException(message);
  }

  return value;
}

// Teaches one normalized structure or throws; the stored JSON then only ever
// contains the seven days, boolean closed flags and HH:mm periods.
export function parseOpeningHours(input: unknown): OpeningHoursStructure {
  if (input === null || input === undefined || typeof input !== 'object') {
    throw new BadRequestException('Les horaires sont invalides.');
  }

  const raw = input as Record<string, unknown>;
  const days = Object.keys(raw);

  for (const day of OPENING_HOURS_DAYS) {
    if (!(day in raw)) {
      throw new BadRequestException(`Les horaires de ${day} sont manquants.`);
    }
  }
  if (days.length !== OPENING_HOURS_DAYS.length) {
    throw new BadRequestException('Les horaires sont invalides.');
  }

  const structure = {} as OpeningHoursStructure;

  for (const day of OPENING_HOURS_DAYS) {
    const dayValue = raw[day];

    if (dayValue === null || dayValue === undefined || typeof dayValue !== 'object') {
      throw new BadRequestException('Les horaires sont invalides.');
    }
    const { closed, periods } = dayValue as {
      closed?: unknown;
      periods?: unknown;
    };

    if (typeof closed !== 'boolean') {
      throw new BadRequestException('Les horaires sont invalides.');
    }

    const dayPeriods = periods ?? [];
    if (!Array.isArray(dayPeriods)) {
      throw new BadRequestException('Les périodes sont invalides.');
    }
    if (!closed && dayPeriods.length === 0) {
      throw new BadRequestException(
        'Un jour ouvert doit avoir au moins une période.',
      );
    }
    if (dayPeriods.length > MAX_PERIODS_PER_DAY) {
      throw new BadRequestException(
        `Au maximum ${MAX_PERIODS_PER_DAY} périodes par jour.`,
      );
    }

    const parsedPeriods: OpeningHoursPeriod[] = dayPeriods.map((period) => {
      if (period === null || period === undefined || typeof period !== 'object') {
        throw new BadRequestException('Les périodes sont invalides.');
      }
      const { start, end } = period as { start?: unknown; end?: unknown };
      const startAt = readTime(start, 'Les périodes sont invalides.');
      const endAt = readTime(end, 'Les périodes sont invalides.');
      if (minutesOf(startAt) >= minutesOf(endAt)) {
        throw new BadRequestException(
          'Le début d\u2019une période doit être avant sa fin.',
        );
      }
      return { start: startAt, end: endAt };
    });

    // No overlap inside a day: sorted by start, the previous period must have
    // ended before (or exactly when) the next one starts.
    parsedPeriods.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let index = 1; index < parsedPeriods.length; index += 1) {
      const previous = parsedPeriods[index - 1]!;
      const current = parsedPeriods[index]!;
      if (minutesOf(current.start) < minutesOf(previous.end)) {
        throw new BadRequestException(
          'Les périodes d\u2019un même jour ne peuvent pas se chevaucher.',
        );
      }
    }

    structure[day] = {
      closed,
      periods: closed ? [] : parsedPeriods,
    };
  }

  return structure;
}
