import { BadRequestException, Injectable } from '@nestjs/common';
import { AiAnalysisRunStatus } from '@prisma/client';

import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { PatientsService } from '../../patients/patients.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiAnalysisRunsService,
  decidedByInclude,
  STALE_RUN_AFTER_MS,
} from '../ai-analysis-runs.service';
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
      requestedById: query.requestedBy === 'me' ? user.sub : undefined,
      status: query.status,
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, runs] = await Promise.all([
      this.prisma.aiAnalysisRun.count({ where }),
      this.prisma.aiAnalysisRun.findMany({
        include: {
          ...decidedByInclude,
          patient: { select: patientNameSelect },
        },
        orderBy: runsOrder(query.decision),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
    ]);

    const items = await Promise.all(
      runs.map(async ({ patient, ...run }) => ({
        ...this.runsService.toRunResponse(
          await this.runsService.expireIfStale(user, run),
        ),
        patient,
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

  async summary(
    user: AuthenticatedUserPayload,
    query: AiRunsSummaryQueryDto,
  ): Promise<AiRunsSummary> {
    const scope = await this.patientsService.getPatientScopeWhere(user);
    const period = readPeriod(query);
    const where = buildRunsWhere(scope, period);
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
        predictions: true,
        status: true,
      },
      where,
    });
    return summarizeRuns(runs, now, period);
  }
}
