import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../../auth/types/authenticated-request.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../../common/guards/verified-account.guard';
import { AiTimelineQueryDto } from './ai-timeline.dto';
import { AiTimelineService } from './ai-timeline.service';

// Same guards as the patient record the runs belong to. A read: open without
// a live subscription, like the rest of the record.
@Controller('patients/:id/ai-timeline')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class AiTimelineController {
  constructor(private readonly timelineService: AiTimelineService) {}

  @Get()
  timeline(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Query() query: AiTimelineQueryDto,
  ) {
    return this.timelineService.timeline(user, id, query.pipeline);
  }
}
