import { BadRequestException, Injectable } from '@nestjs/common';
import { AiAnalysisRunStatus, type Prisma } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { PatientsService } from '../../patients/patients.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiAnalysisRunsService,
  decidedByInclude,
  STALE_RUN_AFTER_MS,
} from '../ai-analysis-runs.service';
import { type ModelMonitoring } from '../monitoring/model-monitoring';
import {
  type AiPriorityLevel,
  computeAiPriority,
  rankByPriority,
} from '../priority/ai-priority';
import { type ModelMonitoringQueryDto } from '../monitoring/model-monitoring.dto';
import { loadModelMonitoring } from '../monitoring/model-monitoring.query';
import {
  type AiRunsPeriodQueryDto,
  type AiRunsSummaryQueryDto,
  type ListAiAnalysisRunsQueryDto,
} from './ai-runs-overview.dto';
import {
  type AiRunsSummary,
  buildRunsWhere,
  runsOrder,
  summarizeRuns,
} from './ai-runs-overview';

// Of the patient, only what names it in the list.
const patientNameSelect = {
  firstName: true,
  firstNameAr: true,
  id: true,
  lastName: true,
  lastNameAr: true,
} as const;

const runListInclude = {
  ...decidedByInclude,
  patient: { select: patientNameSelect },
} as const;

function readPeriod(query: AiRunsPeriodQueryDto): { from?: Date; to?: Date } {
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  if (from && to && from > to) {
    throw new BadRequestException({
      code: 'AI_RUNS_INVALID_PERIOD',
      message: 'La date de début doit précéder la date de fin.',
    });
  }
  return { from, to };
}

// AI analysis runs across every patient the user may see (GET
// /ai-analysis-runs and /ai-analysis-runs/summary). The patient scope is
// part of the query, never checked run by run.
@Injectable()
export class AiRunsOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly runsService: AiAnalysisRunsService,
  ) {}

  async list(
    user: AuthenticatedUserPayload,
    query: ListAiAnalysisRunsQueryDto,
  ) {
    const scope = await this.patientsService.getPatientScopeWhere(user);
    const where = buildRunsWhere(scope, {
      ...readPeriod(query),
      decision: query.decision,
      pipeline: query.pipeline,
      requestedById: query.requestedBy === 'me' ? user.sub : undefined,
      status: query.status,
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // The priority is read from the run, not stored: it cannot be ordered or
    // filtered in SQL, so that order has its own path.
    const byPriority =
      query.sort === 'priority' || query.priority !== undefined;
    const { runs, total } = byPriority
      ? await this.listByPriority(where, query.priority, page, limit)
      : await this.listByDate(where, query.decision, page, limit);

    const items = await Promise.all(
      runs.map(async ({ patient, ...run }) => ({
        ...this.runsService.toRunResponse(
          await this.runsService.expireIfStale(user, run),
        ),
        patient,
        priority: computeAiPriority(run),
      })),
    );

    return {
      items,
      limit,
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async listByDate(
    where: Prisma.AiAnalysisRunWhereInput,
    decision: ListAiAnalysisRunsQueryDto['decision'],
    page: number,
    limit: number,
  ) {
    const [total, runs] = await Promise.all([
      this.prisma.aiAnalysisRun.count({ where }),
      this.prisma.aiAnalysisRun.findMany({
        include: runListInclude,
        orderBy: runsOrder(decision),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
    ]);

    return { runs, total };
  }

  // The runs waiting for a decision, in reading order, then everything else
  // (decided, failed, running: all ROUTINE, with nothing left to review first)
  // the latest first. Only the waiting queue is read to be ranked; the rest is
  // paged by the database after it. With a level, only that level is listed:
  // URGENT and HIGH exist among the waiting runs only.
  private async listByPriority(
    where: Prisma.AiAnalysisRunWhereInput,
    level: AiPriorityLevel | undefined,
    page: number,
    limit: number,
  ) {
    const waiting = {
      decisionStatus: null,
      status: AiAnalysisRunStatus.SUCCEEDED,
    };
    const ranked = rankByPriority(
      await this.prisma.aiAnalysisRun.findMany({
        include: runListInclude,
        where: { AND: [where, waiting] },
      }),
      level,
    ).map((entry) => entry.run);
    const othersWhere: Prisma.AiAnalysisRunWhereInput = {
      AND: [where, { NOT: waiting }],
    };
    const withOthers = level === undefined || level === 'ROUTINE';
    const othersTotal = withOthers
      ? await this.prisma.aiAnalysisRun.count({ where: othersWhere })
      : 0;

    const offset = (page - 1) * limit;
    const fromQueue = ranked.slice(offset, offset + limit);
    const missing = limit - fromQueue.length;
    const others =
      withOthers && missing > 0
        ? await this.prisma.aiAnalysisRun.findMany({
            include: runListInclude,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: Math.max(0, offset - ranked.length),
            take: missing,
            where: othersWhere,
          })
        : [];

    return {
      runs: [...fromQueue, ...others],
      total: ranked.length + othersTotal,
    };
  }

  // How the physicians of the workspace judge each model, month by month
  // (GET /ai-analysis-runs/model-monitoring). The scope is part of the query,
  // like the list's.
  async modelMonitoring(
    user: AuthenticatedUserPayload,
    query: ModelMonitoringQueryDto,
  ): Promise<ModelMonitoring> {
    const scope = await this.patientsService.getPatientScopeWhere(user);

    return loadModelMonitoring(this.prisma, { patient: scope }, query);
  }

  async summary(
    user: AuthenticatedUserPayload,
    query: AiRunsSummaryQueryDto,
  ): Promise<AiRunsSummary> {
    const scope = await this.patientsService.getPatientScopeWhere(user);
    const period = readPeriod(query);
    const where = buildRunsWhere(scope, {
      ...period,
      pipeline: query.pipeline,
    });
    const now = new Date();

    // A run whose request died stays RUNNING: settled first, as a result page
    // would, so the counts match what each run shows.
    const stale = await this.prisma.aiAnalysisRun.findMany({
      include: decidedByInclude,
      where: {
        AND: [
          where,
          {
            createdAt: { lt: new Date(now.getTime() - STALE_RUN_AFTER_MS) },
            status: AiAnalysisRunStatus.RUNNING,
          },
        ],
      },
    });
    for (const run of stale) {
      await this.runsService.expireIfStale(user, run, now);
    }

    const runs = await this.prisma.aiAnalysisRun.findMany({
      select: {
        createdAt: true,
        decisionLabel: true,
        decisionStatus: true,
        pipeline: true,
        predictions: true,
        status: true,
      },
      where,
    });
    return summarizeRuns(runs, now, period);
  }
}
