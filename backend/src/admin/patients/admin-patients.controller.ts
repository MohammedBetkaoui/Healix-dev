import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
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
}
