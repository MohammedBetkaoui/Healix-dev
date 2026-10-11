import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  AiAnalysisRunStatus,
  AppointmentStatus,
  PatientAdministrativeStatus,
  PatientConsentStatus,
  PatientConsentType,
  Prisma,
} from '@prisma/client';

import { getTopLabel } from '../ai-analysis-runs/ai-analysis-runs.service';
import { UNCERTAINTY_THRESHOLD } from '../ai-analysis-runs/report/ai-report-rules';
import { AppointmentsService } from '../appointments/appointments.service';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { UserRole } from '../common/enums/user-role.enum';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type DashboardAttentionKind,
  type DashboardOverview,
} from './dashboard-overview.dto';
import {
  buildPeriod,
  type DashboardPeriod,
  fillDailyCounts,
} from './dashboard-period';

const HOUR_MS = 3_600_000;
const RECENT_ANALYSES = 5;
// Classes the brain classifier scores; the top probability is taken over
// them without relying on the order the predictions were stored in.
const PREDICTION_SLOTS = 4;

const patientNameSelect = {
  firstName: true,
  firstNameAr: true,
  lastName: true,
  lastNameAr: true,
} as const;

type DayCountRow = { day: string; count: number | bigint };

type Scopes = {
  // Prisma filters, from the services of each module.
  patients: Prisma.PatientWhereInput;
  appointments: Prisma.AppointmentWhereInput;
  // The same scopes as SQL conditions, for the per-day aggregates.
  workspaceId: string;
  appointmentOwner: {
    establishmentId: string | null;
    doctorProfileId: string | null;
  };
};

// SQL condition on appointments a (joined to doctor_profiles d), equal to
// AppointmentsService's scope: the establishment's whole agenda, or the
// doctor's own.
export function appointmentScopeSql(
  owner: Scopes['appointmentOwner'],
): Prisma.Sql {
  return owner.establishmentId
    ? Prisma.sql`d.establishment_id = ${owner.establishmentId}`
    : Prisma.sql`a.doctor_profile_id = ${owner.doctorProfileId}`;
}

// The top-class probability of r.predictions, in SQL (0 when absent).
function topProbabilitySql(): Prisma.Sql {
  const slots = Array.from({ length: PREDICTION_SLOTS }, (_, index) =>
    Prisma.raw(
      `COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.predictions, '$[${index}].probability')) AS DECIMAL(12, 9)), 0)`,
    ),
  );
  return Prisma.sql`GREATEST(${Prisma.join(slots)})`;
}

function hoursSince(date: Date | null, now: Date): number | null {
  return date
    ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / HOUR_MS))
    : null;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async getOverview(
    user: AuthenticatedUserPayload,
    days: number,
    now: Date = new Date(),
  ): Promise<DashboardOverview> {
    const [patientScope, appointmentScope] = await Promise.all([
      this.patientsService.getPatientScope(user),
      this.appointmentsService.getAppointmentScope(user),
    ]);
    const scopes: Scopes = {
      appointmentOwner: {
        doctorProfileId: appointmentScope.doctorProfileId,
        establishmentId: appointmentScope.establishmentId,
      },
      appointments: appointmentScope.where,
      patients: patientScope.where,
      workspaceId: patientScope.workspaceId,
    };
    const period = buildPeriod(now, days);

    const [
      patients,
      appointmentsToday,
      aiAnalyses,
      activity,
      attentionExtras,
      affiliatedDoctors,
    ] = await Promise.all([
      this.patients(scopes, period),
      this.appointmentsToday(scopes, period, now),
      this.aiAnalyses(scopes, period, now),
      this.activity(scopes, period),
      this.attentionCounts(scopes, now),
      user.role === UserRole.ESTABLISHMENT_ADMIN &&
      appointmentScope.establishmentId
        ? this.activeAffiliatedDoctors(appointmentScope.establishmentId)
        : Promise.resolve(null),
    ]);

    const attention: DashboardOverview['attention'] = (
      [
        ['AI_PENDING_OVER_24H', attentionExtras.aiPendingOver24h],
        [
          'APPOINTMENTS_UNCONFIRMED_TODAY',
          appointmentsToday.byStatus.SCHEDULED,
        ],
        ['AI_CONSENT_MISSING', attentionExtras.consentMissing],
      ] as [DashboardAttentionKind, number][]
    )
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => ({ count, kind }));

    return {
      activity,
      affiliatedDoctors:
        affiliatedDoctors === null ? null : { active: affiliatedDoctors },
      aiAnalyses,
      appointmentsToday,
      attention,
      generatedAt: now.toISOString(),
      patients,
      period: {
        days,
        from: period.days[0],
        to: period.days[period.days.length - 1],
      },
      timeZone: period.timeZone,
    };
  }

  private async patients(scopes: Scopes, period: DashboardPeriod) {
    const [total, newInPeriod] = await Promise.all([
      this.prisma.patient.count({ where: scopes.patients }),
      this.prisma.patient.count({
        where: {
          AND: [
            scopes.patients,
            { createdAt: { gte: period.from, lt: period.to } },
          ],
        },
      }),
    ]);
    return { newInPeriod, total };
  }

  private async appointmentsToday(
    scopes: Scopes,
    period: DashboardPeriod,
    now: Date,
  ) {
    const today = { scheduledAt: { gte: period.todayStart, lt: period.to } };
    const [groups, next] = await Promise.all([
      this.prisma.appointment.groupBy({
        _count: { _all: true },
        by: ['status'],
        where: { AND: [scopes.appointments, today] },
      }),
      this.prisma.appointment.findFirst({
        orderBy: { scheduledAt: 'asc' },
        select: { patient: { select: patientNameSelect }, scheduledAt: true },
        where: {
          AND: [
            scopes.appointments,
            { scheduledAt: { gte: now, lt: period.to } },
            {
              status: {
                in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
              },
            },
          ],
        },
      }),
    ]);
    const byStatus = {
      CANCELED: 0,
      COMPLETED: 0,
      CONFIRMED: 0,
      NO_SHOW: 0,
      SCHEDULED: 0,
    };
    for (const group of groups) {
      byStatus[group.status] = group._count._all;
    }
    return {
      byStatus,
      next: next
        ? { patient: next.patient, scheduledAt: next.scheduledAt.toISOString() }
        : null,
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
    };
  }

  private async aiAnalyses(scopes: Scopes, period: DashboardPeriod, now: Date) {
    const inPeriod: Prisma.AiAnalysisRunWhereInput = {
      AND: [
        { patient: scopes.patients },
        { createdAt: { gte: period.from, lt: period.to } },
      ],
    };
    const pendingWhere: Prisma.AiAnalysisRunWhereInput = {
      AND: [
        inPeriod,
        { decisionStatus: null, status: AiAnalysisRunStatus.SUCCEEDED },
      ],
    };
    const [
      total,
      decisions,
      succeeded,
      pending,
      oldestPending,
      uncertainRows,
      recent,
    ] = await Promise.all([
      this.prisma.aiAnalysisRun.count({ where: inPeriod }),
      this.prisma.aiAnalysisRun.groupBy({
        _count: { _all: true },
        by: ['decisionStatus'],
        where: { AND: [inPeriod, { decisionStatus: { not: null } }] },
      }),
      this.prisma.aiAnalysisRun.count({
        where: { AND: [inPeriod, { status: AiAnalysisRunStatus.SUCCEEDED }] },
      }),
      this.prisma.aiAnalysisRun.count({ where: pendingWhere }),
      this.prisma.aiAnalysisRun.aggregate({
        _min: { createdAt: true },
        where: pendingWhere,
      }),
      this.prisma.$queryRaw<{ count: number | bigint }[]>`
          SELECT COUNT(*) AS count
          FROM ai_analysis_runs r
          INNER JOIN patients p ON p.id = r.patient_id
          WHERE p.workspace_id = ${scopes.workspaceId}
            AND r.status = 'SUCCEEDED'
            AND r.created_at >= ${period.from} AND r.created_at < ${period.to}
            AND r.predictions IS NOT NULL
            AND ${topProbabilitySql()} < ${UNCERTAINTY_THRESHOLD}`,
      this.prisma.aiAnalysisRun.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          createdAt: true,
          decisionLabel: true,
          decisionStatus: true,
          id: true,
          patient: { select: { id: true, ...patientNameSelect } },
          predictions: true,
          status: true,
        },
        take: RECENT_ANALYSES,
        where: { patient: scopes.patients },
      }),
    ]);
    const decisionCount = (decision: string) =>
      decisions.find((group) => group.decisionStatus === decision)?._count
        ._all ?? 0;
    const oldest = oldestPending._min.createdAt;
    return {
      corrected: decisionCount('CORRECTED'),
      pending: {
        count: pending,
        oldestAgeHours: hoursSince(oldest, now),
        oldestCreatedAt: oldest ? oldest.toISOString() : null,
      },
      recent: recent.map((run) => ({
        createdAt: run.createdAt.toISOString(),
        decision: run.decisionStatus,
        decisionLabel: run.decisionLabel,
        id: run.id,
        modelLabel: getTopLabel(run.predictions),
        patient: run.patient,
        status: run.status,
      })),
      rejected: decisionCount('REJECTED'),
      total,
      uncertain: {
        count: Number(uncertainRows[0]?.count ?? 0),
        threshold: UNCERTAINTY_THRESHOLD,
        total: succeeded,
      },
      validated: decisionCount('VALIDATED'),
    };
  }

  // Per local day: consultations held, appointments completed, AI analyses
  // requested. Grouped in SQL on the local date (UTC + the zone's offset).
  private async activity(scopes: Scopes, period: DashboardPeriod) {
    const offset = period.offsetMinutes;
    const [consultations, completed, analyses] = await Promise.all([
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT DATE_FORMAT(DATE_ADD(c.date, INTERVAL ${offset} MINUTE), '%Y-%m-%d') AS day,
               COUNT(*) AS count
        FROM patient_consultations c
        INNER JOIN patients p ON p.id = c.patient_id
        WHERE p.workspace_id = ${scopes.workspaceId}
          AND c.date >= ${period.from} AND c.date < ${period.to}
        GROUP BY day`,
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT DATE_FORMAT(DATE_ADD(a.scheduled_at, INTERVAL ${offset} MINUTE), '%Y-%m-%d') AS day,
               COUNT(*) AS count
        FROM appointments a
        INNER JOIN doctor_profiles d ON d.id = a.doctor_profile_id
        WHERE ${appointmentScopeSql(scopes.appointmentOwner)}
          AND a.status = 'COMPLETED'
          AND a.scheduled_at >= ${period.from} AND a.scheduled_at < ${period.to}
        GROUP BY day`,
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT DATE_FORMAT(DATE_ADD(r.created_at, INTERVAL ${offset} MINUTE), '%Y-%m-%d') AS day,
               COUNT(*) AS count
        FROM ai_analysis_runs r
        INNER JOIN patients p ON p.id = r.patient_id
        WHERE p.workspace_id = ${scopes.workspaceId}
          AND r.created_at >= ${period.from} AND r.created_at < ${period.to}
        GROUP BY day`,
    ]);
    const consultationCounts = fillDailyCounts(period.days, consultations);
    const completedCounts = fillDailyCounts(period.days, completed);
    const analysisCounts = fillDailyCounts(period.days, analyses);
    return period.days.map((date, index) => ({
      aiAnalyses: analysisCounts[index],
      completedAppointments: completedCounts[index],
      consultations: consultationCounts[index],
      date,
    }));
  }

  // Whatever their age: work to do does not expire with the period.
  private async attentionCounts(scopes: Scopes, now: Date) {
    const [aiPendingOver24h, consentMissing] = await Promise.all([
      this.prisma.aiAnalysisRun.count({
        where: {
          AND: [
            { patient: scopes.patients },
            { decisionStatus: null, status: AiAnalysisRunStatus.SUCCEEDED },
            { createdAt: { lt: new Date(now.getTime() - 24 * HOUR_MS) } },
          ],
        },
      }),
      this.prisma.patient.count({
        where: {
          AND: [
            scopes.patients,
            { administrativeStatus: PatientAdministrativeStatus.ACTIVE },
            { aiAnalysisRuns: { some: {} } },
            {
              consents: {
                none: {
                  status: PatientConsentStatus.SIGNED,
                  type: PatientConsentType.DIAGNOSTIC_AI,
                },
              },
            },
          ],
        },
      }),
    ]);
    return { aiPendingOver24h, consentMissing };
  }

  private activeAffiliatedDoctors(establishmentId: string): Promise<number> {
    return this.prisma.doctorProfile.count({
      where: { establishmentId, user: { accountStatus: AccountStatus.ACTIVE } },
    });
  }
}
