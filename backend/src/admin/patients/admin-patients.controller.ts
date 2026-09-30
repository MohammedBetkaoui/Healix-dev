import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { type AdminAuthenticatedRequest } from '../../admin-auth/types/admin-authenticated-request.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { getRequestContext } from '../../common/utils/request-context';
import { AdminPatientsService } from './admin-patients.service';
import { ListAdminPatientsQueryDto } from './dto/list-admin-patients-query.dto';

@Controller('admin/patients')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION)
export class AdminPatientsController {
  constructor(private readonly patientsService: AdminPatientsService) {}

  @Get()
  listPatients(@Query() query: ListAdminPatientsQueryDto) {
    return this.patientsService.listPatients(query);
  }

  @Get(':id')
  getPatientById(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.patientsService.getPatientById(
      id,
      request.user.sub,
      getRequestContext(request),
    );
  }
}
