import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DashboardOverviewQueryDto } from './dashboard-overview.dto';
import {
  buildPeriod,
  fillDailyCounts,
  localDayKey,
  localMidnight,
  timeZoneOffsetMinutes,
} from './dashboard-period';
import { appointmentScopeSql } from './dashboard.service';

describe('Africa/Algiers days', () => {
  it('is UTC+1 all year round (no daylight saving time)', () => {
    for (const instant of [
      '2026-01-15T12:00:00Z',
      '2026-07-15T12:00:00Z',
      '2026-10-25T01:30:00Z',
    ]) {
      expect(timeZoneOffsetMinutes(new Date(instant), 'Africa/Algiers')).toBe(
        60,
      );
    }
  });

  it('puts 23:30 UTC on the next local day', () => {
    expect(
      localDayKey(new Date('2026-10-10T22:59:59Z'), 'Africa/Algiers'),
    ).toBe('2026-10-10');
    expect(
      localDayKey(new Date('2026-10-10T23:00:00Z'), 'Africa/Algiers'),
    ).toBe('2026-10-11');
    expect(
      localDayKey(new Date('2026-10-10T23:30:00Z'), 'Africa/Algiers'),
    ).toBe('2026-10-11');
  });

  it('starts a local day at 23:00 UTC the day before', () => {
    expect(localMidnight('2026-10-11', 'Africa/Algiers').toISOString()).toBe(
      '2026-10-10T23:00:00.000Z',
    );
    // Zones with daylight saving time are handled too.
    expect(localMidnight('2026-07-01', 'Europe/Paris').toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
    expect(localMidnight('2026-01-01', 'Europe/Paris').toISOString()).toBe(
      '2025-12-31T23:00:00.000Z',
    );
  });
});

describe('buildPeriod', () => {
  it('covers the last N local days, today included, from local midnight to the next one', () => {
    // 00:30 in Algiers on 11 October.
    const period = buildPeriod(new Date('2026-10-10T23:30:00Z'), 3);

    expect(period.days).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(period.from.toISOString()).toBe('2026-10-08T23:00:00.000Z');
    expect(period.todayStart.toISOString()).toBe('2026-10-10T23:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-10-11T23:00:00.000Z');
    expect(period.offsetMinutes).toBe(60);
    expect(period.timeZone).toBe('Africa/Algiers');
  });

  it('crosses month and year boundaries', () => {
    const period = buildPeriod(new Date('2027-01-01T10:00:00Z'), 3);
    expect(period.days).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('has as many days as asked', () => {
    expect(buildPeriod(new Date('2026-10-11T08:00:00Z'), 30).days).toHaveLength(
      30,
    );
    expect(buildPeriod(new Date('2026-10-11T08:00:00Z'), 1).days).toEqual([
      '2026-10-11',
    ]);
  });
});

describe('fillDailyCounts', () => {
  it('keeps every day, 0 where nothing happened, and drops rows outside the period', () => {
    const days = ['2026-10-09', '2026-10-10', '2026-10-11'];
    expect(
      fillDailyCounts(days, [
        { count: 2n, day: '2026-10-11' },
        { count: 5, day: '2026-10-09' },
        { count: 9, day: '2026-10-01' },
      ]),
    ).toEqual([5, 0, 2]);
    expect(fillDailyCounts(days, [])).toEqual([0, 0, 0]);
  });
});

describe('DashboardOverviewQueryDto', () => {
  const daysOf = async (query: Record<string, unknown>) => {
    const dto = plainToInstance(DashboardOverviewQueryDto, query);
    const errors = await validate(dto);
    return errors.length > 0 ? 'invalid' : dto.days;
  };

  it('defaults to 30 days and accepts 1 to 90', async () => {
    await expect(daysOf({})).resolves.toBe(30);
    await expect(daysOf({ days: '7' })).resolves.toBe(7);
    await expect(daysOf({ days: '90' })).resolves.toBe(90);
  });

  it('refuses anything else', async () => {
    for (const days of ['0', '91', '7.5', 'abc', '-3']) {
      await expect(daysOf({ days })).resolves.toBe('invalid');
    }
  });
});

describe('appointmentScopeSql', () => {
  it('matches the appointments module: the establishment through the doctor, or the doctor', () => {
    const establishment = appointmentScopeSql({
      doctorProfileId: null,
      establishmentId: 'est-1',
    });
    expect(establishment.sql).toBe('d.establishment_id = ?');
    expect(establishment.values).toEqual(['est-1']);

    const doctor = appointmentScopeSql({
      doctorProfileId: 'doc-1',
      establishmentId: null,
    });
    expect(doctor.sql).toBe('a.doctor_profile_id = ?');
    expect(doctor.values).toEqual(['doc-1']);
  });
});
