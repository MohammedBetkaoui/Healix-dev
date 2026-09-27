import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
