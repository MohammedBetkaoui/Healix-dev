import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { hasCapability } from '../common/authorization/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto, updatedOrganizationFields } from './dto/update-organization.dto';
import { parseOpeningHours } from './dto/update-opening-hours.dto';
import {
  mapOrganizationResponse,
  type OrganizationResponse,
} from './mappers/organization-response.mapper';
import {
  OrganizationAuthorizationService,
  actorOf,
  type Actor,
  type WorkspaceActorContext,
} from './organization-authorization.service';

// Only what the mapper needs: exactly these fields, and never the
// representative national ID.
const establishmentSelect = {
  id: true,
  name: true,
  type: true,
  wilaya: true,
  address: true,
  phone: true,
  professionalEmail: true,
  verificationStatus: true,
  subscriptionStatus: true,
  verificationRequest: {
    select: {
      data: {
        select: {
          name: true,
          type: true,
          legalForm: true,
          wilaya: true,
          commune: true,
          address: true,
          commercialRegisterNumber: true,
          commercialRegisterIssuedAt: true,
          commercialRegisterWilaya: true,
          nif: true,
          nis: true,
          taxCenter: true,
          healthAuthorizationNumber: true,
          healthAuthorizationIssuedAt: true,
          healthAuthorizationAuthority: true,
          healthDirectionWilaya: true,
          authorizedActivityType: true,
          legalRepresentativeFullName: true,
          legalRepresentativeFunction: true,
        },
      },
    },
  },
  settings: {
    select: {
      website: true,
      openingHours: true,
      defaultAppointmentDuration: true,
      dataProtectionOfficerName: true,
      dataProtectionOfficerEmail: true,
      dataProtectionOfficerPhone: true,
    },
  },
} satisfies Prisma.EstablishmentSelect;

type EstablishmentWithOrganization = Prisma.EstablishmentGetPayload<{
  select: typeof establishmentSelect;
}>;

type RequestContext = { ipAddress: string | null; userAgent: string | null };

// The one place where the legal identity and the operational settings are
// read as a whole, and where the operational part alone is written. The legal
// part is not writable here at all: modification of verified data can only
// happen through a future verification flow, never through an update.
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getOrganization(actor: Actor): Promise<OrganizationResponse> {
    const context = await this.authorization.resolveActor(actor);
    const establishment = await this.readEstablishment(context);

    return mapOrganizationResponse({
      workspaceId: context.workspaceId,
      workspaceType: 'ESTABLISHMENT',
      capabilities: context.capabilities,
      scope: hasCapability(context.capabilities, 'organization.read')
        ? 'FULL'
        : 'BASIC',
      establishment,
      openingHours: establishment.settings?.openingHours ?? null,
      defaultAppointmentDuration:
        establishment.settings?.defaultAppointmentDuration ?? 30,
      website: establishment.settings?.website ?? null,
      dpoName: establishment.settings?.dataProtectionOfficerName ?? null,
      dpoEmail: establishment.settings?.dataProtectionOfficerEmail ?? null,
      dpoPhone: establishment.settings?.dataProtectionOfficerPhone ?? null,
    });
  }

  async updateOrganization(
    actor: Actor,
    dto: UpdateOrganizationDto,
    requestContext: RequestContext,
  ): Promise<OrganizationResponse> {
    const context = await this.authorization.resolveActor(actor);
    this.authorization.require(context, 'organization.updateOperational');

    // The DTO refuses legal fields, and exactly-the-sent-fields bookkeeping
    // guarantees an empty body changes nothing and writes no audit line.
    const fields = updatedOrganizationFields(dto);

    if (fields.length === 0) {
      return this.getOrganization(actor);
    }

    await this.prisma.$transaction(async (transaction) => {
      // Professional contacts live on the establishment row, the operational
      // settings on their own table (the backfilled row can also miss on a
      // hand-made database: upsert, and no data gets lost either way).
      const establishmentData: Prisma.EstablishmentUpdateInput = {};
      if (dto.phone !== undefined) {
        establishmentData.phone = dto.phone;
      }
      if (dto.professionalEmail !== undefined) {
        establishmentData.professionalEmail = dto.professionalEmail;
      }

      if (Object.keys(establishmentData).length > 0) {
        await transaction.establishment.update({
          where: { id: context.establishmentId },
          data: establishmentData,
        });
      }

      const settingsData: Prisma.EstablishmentSettingsUncheckedUpdateInput = {};
      if (dto.website !== undefined) {
        settingsData.website = dto.website;
      }
      if (dto.defaultAppointmentDuration !== undefined) {
        settingsData.defaultAppointmentDuration =
          dto.defaultAppointmentDuration;
      }
      if (dto.dataProtectionOfficerName !== undefined) {
        settingsData.dataProtectionOfficerName =
          dto.dataProtectionOfficerName ?? null;
      }
      if (dto.dataProtectionOfficerEmail !== undefined) {
        settingsData.dataProtectionOfficerEmail =
          dto.dataProtectionOfficerEmail ?? null;
      }
      if (dto.dataProtectionOfficerPhone !== undefined) {
        settingsData.dataProtectionOfficerPhone =
          dto.dataProtectionOfficerPhone ?? null;
      }

      await transaction.establishmentSettings.upsert({
        where: { establishmentId: context.establishmentId },
        // Same scalar fields in both shapes: the spread covers only what was
        // sent, an absent field keeps its default (30 minutes) or null.
        create: {
          establishmentId: context.establishmentId,
          ...settingsData,
        } as Prisma.EstablishmentSettingsUncheckedCreateInput,
        update: settingsData,
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'ORGANIZATION_SETTINGS_UPDATED',
          entityType: 'ESTABLISHMENT',
          entityId: context.establishmentId,
          ipAddress: requestContext.ipAddress,
          // Field names only: the values are personal data.
          metadata: {
            workspaceId: context.workspaceId,
            fields,
          },
          userAgent: requestContext.userAgent,
          userId: actor.userId,
        },
        transaction,
      );
    });

    return this.getOrganization(actor);
  }

  async updateOpeningHours(
    actor: Actor,
    dto: { openingHours: unknown },
    requestContext: RequestContext,
  ): Promise<OrganizationResponse> {
    const context = await this.authorization.resolveActor(actor);
    this.authorization.require(context, 'organization.updateOperational');

    // Rebuilt server-side: the stored JSON never contains anything else than
    // the validated seven-day structure.
    const openingHours = parseOpeningHours(dto.openingHours);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.establishmentSettings.upsert({
        where: { establishmentId: context.establishmentId },
        create: {
          establishmentId: context.establishmentId,
          openingHours,
        },
        update: { openingHours },
      });

      await this.auditLogsService.createAuditLog(
        {
          action: 'ORGANIZATION_SETTINGS_UPDATED',
          entityType: 'ESTABLISHMENT',
          entityId: context.establishmentId,
          ipAddress: requestContext.ipAddress,
          metadata: {
            workspaceId: context.workspaceId,
            fields: ['openingHours'],
          },
          userAgent: requestContext.userAgent,
          userId: actor.userId,
        },
        transaction,
      );
    });

    return this.getOrganization(actor);
  }

  // A workspace exists without its establishment record only if data was
  // deleted by hand: every workspace operation scope needs its establishment.
  private async readEstablishment(
    context: WorkspaceActorContext,
  ): Promise<EstablishmentWithOrganization> {
    const establishment = await this.prisma.establishment.findUnique({
      where: { id: context.establishmentId },
      select: establishmentSelect,
    });

    if (!establishment) {
      throw new NotFoundException('Établissement introuvable.');
    }

    return establishment;
  }
}
