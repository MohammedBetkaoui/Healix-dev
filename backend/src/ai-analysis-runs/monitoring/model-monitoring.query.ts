import { BadRequestException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { type PrismaService } from '../../prisma/prisma.service';
import {
  buildModelMonitoring,
  MAX_MONITORING_MONTHS,
  type ModelMonitoring,
  MONITORING_RUN_SELECT,
  resolveMonitoringWindow,
} from './model-monitoring';

// GET /ai-analysis-runs/model-monitoring and its back-office twin: the months
// asked for (ISO instants, both optional), the same for both.
export type ModelMonitoringPeriod = { from?: string; to?: string };

/**
 * Reads the runs of a scope and builds the board. The scope is the caller's
 * (their patients, or everything for the back-office); the period is added
 * here, widened by the baseline months of the first month shown.
 */
export async function loadModelMonitoring(
  prisma: Pick<PrismaService, 'aiAnalysisRun'>,
  scope: Prisma.AiAnalysisRunWhereInput,
  period: ModelMonitoringPeriod,
  now: Date = new Date(),
): Promise<ModelMonitoring> {
  const window = resolveMonitoringWindow(
    {
      from: period.from ? new Date(period.from) : undefined,
      to: period.to ? new Date(period.to) : undefined,
    },
    now,
  );

  if (window === 'INVALID_PERIOD') {
    throw new BadRequestException({
      code: 'AI_RUNS_INVALID_PERIOD',
      message: 'La date de début doit précéder la date de fin.',
    });
  }
  if (window === 'PERIOD_TOO_LONG') {
    throw new BadRequestException({
      code: 'AI_MONITORING_PERIOD_TOO_LONG',
      message: `La période ne peut pas dépasser ${MAX_MONITORING_MONTHS} mois.`,
    });
  }

  const runs = await prisma.aiAnalysisRun.findMany({
    select: MONITORING_RUN_SELECT,
    where: {
      AND: [scope, { createdAt: { gte: window.fetchFrom, lte: window.to } }],
    },
  });

  return buildModelMonitoring(runs, window);
}
