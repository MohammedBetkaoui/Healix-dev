import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AdminJwtGuard } from '../../admin-auth/guards/admin-jwt.guard';
import { type AdminAuthenticatedRequest } from '../../admin-auth/types/admin-authenticated-request.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get(':id')
  getUserById(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.usersService.getUserById(id, request.user.sub, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/suspend')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  suspendUser(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.usersService.suspendUser(id, request.user.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Patch(':id/reactivate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  reactivateUser(
    @Param('id') id: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.usersService.reactivateUser(id, request.user.sub, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    });
  }
}
