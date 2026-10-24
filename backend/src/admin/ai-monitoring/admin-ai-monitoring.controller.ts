import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { ModelMonitoringQueryDto } from '../../ai-analysis-runs/monitoring/model-monitoring.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminAiMonitoringService } from './admin-ai-monitoring.service';

// Same figures as GET /ai-analysis-runs/model-monitoring, across all the
// workspaces. Same access as the subscriptions console.
@Controller('admin/ai-analysis-runs')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION)
export class AdminAiMonitoringController {
  constructor(private readonly monitoring: AdminAiMonitoringService) {}

  @Get('model-monitoring')
  modelMonitoring(@Query() query: ModelMonitoringQueryDto) {
    return this.monitoring.modelMonitoring(query);
  }
}
