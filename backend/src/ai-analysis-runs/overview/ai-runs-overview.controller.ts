import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../../common/guards/verified-account.guard';
import {
  AiRunsSummaryQueryDto,
  ListAiAnalysisRunsQueryDto,
} from './ai-runs-overview.dto';
import { AiRunsOverviewService } from './ai-runs-overview.service';

// Same guards as patients/:id/ai-analysis-runs, across the user's patients.
@Controller('ai-analysis-runs')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class AiRunsOverviewController {
  constructor(private readonly overviewService: AiRunsOverviewService) {}

  // Filters: decision (pending | VALIDATED | CORRECTED | REJECTED), status,
  // from / to, requestedBy=me; page, limit (50 at most).
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ListAiAnalysisRunsQueryDto,
  ) {
    return this.overviewService.list(user, query);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: AiRunsSummaryQueryDto,
  ) {
    return this.overviewService.summary(user, query);
  }
}
