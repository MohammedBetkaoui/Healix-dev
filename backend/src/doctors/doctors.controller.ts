import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAffiliatedDoctorDto } from './dto/create-affiliated-doctor.dto';
import { UpdateAffiliatedDoctorDto } from './dto/update-affiliated-doctor.dto';
import { DoctorsService } from './doctors.service';

@Controller('establishment/doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateAffiliatedDoctorDto,
  ) {
    const establishmentId = await this.resolveEstablishmentId(user);
    return this.doctorsService.createAffiliatedDoctor(establishmentId, dto);
  }

  @Get()
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async list(@CurrentUser() user: AuthenticatedUserPayload) {
    const establishmentId = await this.resolveEstablishmentId(user);
    return this.doctorsService.listAffiliatedDoctors(establishmentId);
  }

  @Patch(':doctorProfileId')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async update(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('doctorProfileId') doctorProfileId: string,
    @Body() dto: UpdateAffiliatedDoctorDto,
  ) {
    const establishmentId = await this.resolveEstablishmentId(user);
    return this.doctorsService.updateAffiliatedDoctor(
      establishmentId,
      doctorProfileId,
      dto,
    );
  }

  @Post(':doctorProfileId/reset-password')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async resetPassword(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('doctorProfileId') doctorProfileId: string,
  ) {
    const establishmentId = await this.resolveEstablishmentId(user);
    return this.doctorsService.resetAffiliatedDoctorPassword(
      establishmentId,
      doctorProfileId,
    );
  }

  @Post(':doctorProfileId/suspend')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async suspend(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('doctorProfileId') doctorProfileId: string,
  ) {
    const establishmentId = await this.resolveEstablishmentId(user);
    return this.doctorsService.suspendAffiliatedDoctor(
      establishmentId,
      doctorProfileId,
    );
  }

  @Post(':doctorProfileId/reactivate')
  @Roles(UserRole.ESTABLISHMENT_ADMIN)
  async reactivate(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('doctorProfileId') doctorProfileId: string,
  ) {
    const establishmentId = await this.resolveEstablishmentId(user);
    return this.doctorsService.reactivateAffiliatedDoctor(
      establishmentId,
      doctorProfileId,
    );
  }

  private async resolveEstablishmentId(
    user: AuthenticatedUserPayload,
  ): Promise<string> {
    const establishment = await this.prisma.establishment.findUnique({
      where: { ownerId: user.sub },
    });

    if (!establishment) {
      throw new NotFoundException('Établissement introuvable.');
    }

    return establishment.id;
  }
}
