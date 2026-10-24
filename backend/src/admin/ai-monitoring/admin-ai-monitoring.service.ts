import { Injectable } from '@nestjs/common';

import { type ModelMonitoringQueryDto } from '../../ai-analysis-runs/monitoring/model-monitoring.dto';
import { loadModelMonitoring } from '../../ai-analysis-runs/monitoring/model-monitoring.query';
import { PrismaService } from '../../prisma/prisma.service';

// The monitoring board over every workspace: the figures of all the
// physicians together, to see a model getting worse before any single
// workspace has enough decisions to show it. Counts only, never a patient.
@Injectable()
export class AdminAiMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  modelMonitoring(query: ModelMonitoringQueryDto) {
    return loadModelMonitoring(this.prisma, {}, query);
  }
}
