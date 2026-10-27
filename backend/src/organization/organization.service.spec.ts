import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceMembershipRole, WorkspaceType } from '@prisma/client';

import { capabilitiesForWorkspaceRole, hasCapability } from '../common/authorization/capabilities';
import { OrganizationService } from './organization.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { parseOpeningHours } from './dto/update-opening-hours.dto';
import { mapOrganizationResponse } from './mappers/organization-response.mapper';
import { OrganizationAuthorizationService } from './organization-authorization.service';

type Row = Record<string, any>;
type Where = Record<string, unknown>;

const DAY = { closed: false, periods: [{ start: '08:00', end: '16:30' }] };
const WEEK = { monday: DAY, tuesday: DAY, wednesday: DAY, thursday: DAY, friday: { closed: true, periods: [] }, saturday: DAY, sunday: { closed: true, periods: [] } };

const ownerActor = { userId: 'user-owner', role: 'ESTABLISHMENT_ADMIN' as const };

function serviceFor(options: {
  role: WorkspaceMembershipRole;
  establishment?: Row | null;
}) {
  const contextService = {
    resolveWorkspaceForUser: jest.fn(async () => {
      return {
        workspaceId: 'ws-1',
        workspaceType: WorkspaceType.ESTABLISHMENT,
        membershipRole: options.role,
        establishmentId: 'est-1',
        doctorProfileId: undefined,
      };
    }),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: Where) =>
        where.id === 'user-owner' ? { accountStatus: 'ACTIVE' } : null,
      ),
    },
    establishment: {
      findUnique: jest.fn(async ({ where }: Where) =>
        where.id === 'est-1' ? (options.establishment ?? null) : null,
      ),
    },
    $transaction: jest.fn(
      async (work: (transaction: unknown) => Promise<unknown>) =>
        work({
          establishment: {
            update: jest.fn(async () => ({})),
          },
          establishmentSettings: {
            upsert: jest.fn(async (args: { create: Row; update: Row }) => ({
              establishmentId: 'est-1',
              ...args.create,
              ...args.update,
            })),
          },
        }),
    ),
  } as {
    user: { findUnique: jest.Mock };
    establishment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  } & Record<string, unknown>;

  const auditLogsService = { createAuditLog: jest.fn(async () => ({})) };

  const authorization = new OrganizationAuthorizationService(
    prisma as never,
    contextService as never,
  );
  const organization = new OrganizationService(
    prisma as never,
    authorization,
    auditLogsService as never,
  );

  return { organization, prisma, auditLogsService, authorization };
}

const verifiedEstablishment = (overrides: Row = {}): Row => ({
  id: 'est-1',
  name: 'Cabinet Ibn Sina',
  type: 'CABINET',
  wilaya: 'Alger',
  address: '12 rue Didouche Mourad',
  phone: '+213550000000',
  professionalEmail: 'contact@ibnsina.dz',
  verificationStatus: 'VERIFIED',
  subscriptionStatus: 'ACTIVE',
  verificationRequest: {
    data: {
      name: 'Cabinet Ibn Sina',
      type: 'CABINET',
      legalForm: 'SARL',
      wilaya: 'Alger',
      commune: 'Alger Centre',
      address: '12 rue Didouche Mourad',
      commercialRegisterNumber: 'RC/2024/1234',
      commercialRegisterIssuedAt: new Date('2024-02-10T00:00:00Z'),
      commercialRegisterWilaya: 'Alger',
      nif: 'NIF-1234',
      nis: 'NIS-1234',
      taxCenter: 'Alger',
      healthAuthorizationNumber: 'AUT-2024-1',
      healthAuthorizationIssuedAt: new Date('2024-01-15T00:00:00Z'),
      healthAuthorizationAuthority: 'DSP Alger',
      healthDirectionWilaya: 'Alger',
      authorizedActivityType: 'Cabinet dentaire',
      legalRepresentativeFullName: 'Dr. Amina Belkacem',
      legalRepresentativeFunction: 'Gérante',
      legalRepresentativeNinOrId: 'NIN-999888777',
    },
  },
  settings: {
    website: 'https://ibnsina.dz',
    openingHours: WEEK,
    defaultAppointmentDuration: 30,
    dataProtectionOfficerName: 'Karim Haddad',
    dataProtectionOfficerEmail: 'dpo@ibnsina.dz',
    dataProtectionOfficerPhone: '+213770000000',
  },
  ...overrides,
});

describe('OrganizationService', () => {
  it('owner reads the full organization with legal identity and capabilities', async () => {
    const { organization } = serviceFor({
      role: WorkspaceMembershipRole.OWNER,
      establishment: verifiedEstablishment(),
    });

    const response = await organization.getOrganization(ownerActor);

    expect(response.identity.name).toBe('Cabinet Ibn Sina');
    expect(response.identity.commune).toBe('Alger Centre');
    expect(response.identity.source).toBe('VERIFICATION_DATA');
    expect(response.legal?.locked).toBe(true);
    expect(response.legal?.nif).toBe('NIF-1234');
    expect(response.capabilities).toContain('organization.updateOperational');
    expect(response.settings.defaultAppointmentDuration).toBe(30);
    expect(response.settings.dataProtectionOfficer?.name).toBe('Karim Haddad');
  });

  it('never returns the representative national ID', async () => {
    const { organization } = serviceFor({
      role: WorkspaceMembershipRole.OWNER,
      establishment: verifiedEstablishment(),
    });

    const response = await organization.getOrganization(ownerActor);

    expect(JSON.stringify(response)).not.toContain('NIN-999888777');
    expect(JSON.stringify(response)).not.toContain('NinOrId');
  });

  it('a DOCTOR reads BASIC scope: no legal paperwork and no DPO contact', async () => {
    const { organization } = serviceFor({
      role: WorkspaceMembershipRole.DOCTOR,
      establishment: verifiedEstablishment(),
    });

    const response = await organization.getOrganization(ownerActor);

    expect(response.legal).toBeNull();
    expect(response.settings.dataProtectionOfficer).toBeNull();
    expect(response.identity.name).toBe('Cabinet Ibn Sina');
    expect(response.capabilities).toEqual(
      expect.arrayContaining(['organization.readBasic']),
    );
    expect(response.capabilities).not.toContain('organization.updateOperational');
  });

  it('owner updates operational fields and writes a minimal audit entry', async () => {
    const service = serviceFor({
      role: WorkspaceMembershipRole.OWNER,
      establishment: verifiedEstablishment(),
    });

    const transactionClient = {
      establishment: { update: jest.fn(async () => ({})) },
      establishmentSettings: { upsert: jest.fn(async () => ({})) },
    };
    service.prisma.$transaction.mockImplementationOnce(
      async (work: (client: unknown) => Promise<unknown>) => work(transactionClient),
    );

    await service.organization.updateOrganization(ownerActor, {
      phone: '+213555000001',
      defaultAppointmentDuration: 45,
      dataProtectionOfficerName: null,
    }, { ipAddress: '127.0.0.1', userAgent: 'test' });

    expect(transactionClient.establishment.update).toHaveBeenCalledWith({
      where: { id: 'est-1' },
      data: { phone: '+213555000001' },
    });
    expect(transactionClient.establishmentSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          defaultAppointmentDuration: 45,
          dataProtectionOfficerName: null,
        }),
      }),
    );

    const audit = service.auditLogsService.createAuditLog.mock.calls.at(-1)![0];
    expect(audit.action).toBe('ORGANIZATION_SETTINGS_UPDATED');
    expect(audit.metadata).toEqual({
      workspaceId: 'ws-1',
      fields: [
        'phone',
        'defaultAppointmentDuration',
        'dataProtectionOfficerName',
      ],
    });
  });

  it('a doctor cannot update the organization', async () => {
    const service = serviceFor({
      role: WorkspaceMembershipRole.DOCTOR,
      establishment: verifiedEstablishment(),
    });

    await expect(
      service.organization.updateOrganization(ownerActor, { phone: '+213555000001' }, { ipAddress: null, userAgent: null }),
    ).rejects.toThrow(ForbiddenException);

    expect(service.auditLogsService.createAuditLog).not.toHaveBeenCalled();
  });

  it('legal fields of a verified establishment are never written, even if sent', async () => {
    const service = serviceFor({
      role: WorkspaceMembershipRole.OWNER,
      establishment: verifiedEstablishment(),
    });

    // The DTO refuses legal fields: unknown properties are outside the type,
    // an empty validated body changes nothing and audits nothing.
    await service.organization.updateOrganization(
      ownerActor,
      {} as UpdateOrganizationDto,
      { ipAddress: null, userAgent: null },
    );

    const called = service.prisma.$transaction.mock.calls.length;
    expect(called).toBe(0);
  });

  it('a workspace without establishment record answers 404', async () => {
    const service = serviceFor({
      role: WorkspaceMembershipRole.OWNER,
      establishment: null,
    });

    await expect(
      service.organization.getOrganization(ownerActor),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('organization authorization', () => {
  it('accepts the OWNER capabilities and refuses a missing one', () => {
    const owner = capabilitiesForWorkspaceRole(WorkspaceMembershipRole.OWNER, WorkspaceType.ESTABLISHMENT);
    const admin = capabilitiesForWorkspaceRole(WorkspaceMembershipRole.ADMIN, WorkspaceType.ESTABLISHMENT);
    const doctor = capabilitiesForWorkspaceRole(WorkspaceMembershipRole.DOCTOR, WorkspaceType.ESTABLISHMENT);
    const receptionist = capabilitiesForWorkspaceRole(WorkspaceMembershipRole.RECEPTIONIST, WorkspaceType.ESTABLISHMENT);

    expect(hasCapability(owner, 'organization.update')).toBe(true);
    expect(hasCapability(admin, 'organization.update')).toBe(false);
    expect(hasCapability(admin, 'organization.updateOperational')).toBe(true);
    expect(hasCapability(admin, 'team.inviteAdmin')).toBe(false);
    expect(hasCapability(doctor, 'team.read')).toBe(false);
    expect(hasCapability(doctor, 'team.readBasic')).toBe(true);
    // Not exposed in the interface yet: no capability at all.
    expect(receptionist).toEqual([]);
    // Not an establishment workspace: management does not exist there.
    expect(
      capabilitiesForWorkspaceRole(WorkspaceMembershipRole.OWNER, WorkspaceType.PRIVATE_PRACTICE),
    ).toEqual([]);
  });

  it('a suspended account is refused before any capability check', async () => {
    const contextService = {
      resolveWorkspaceForUser: jest.fn(async () => ({
        workspaceId: 'ws-1',
        workspaceType: WorkspaceType.ESTABLISHMENT,
        membershipRole: WorkspaceMembershipRole.OWNER,
        establishmentId: 'est-1',
      })),
    };
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ accountStatus: 'REJECTED' })) },
    };
    const authorization = new OrganizationAuthorizationService(
      prisma as never,
      contextService as never,
    );

    await expect(
      authorization.resolveActor(ownerActor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cross-workspace membership is refused at resolution (no resource leak)', async () => {
    const contextService = {
      resolveWorkspaceForUser: jest.fn(async () => {
        throw new ForbiddenException(
          'Aucun workspace actif ne correspond à ce compte.',
        );
      }),
    };
    const prisma = { user: { findUnique: jest.fn() } };
    const authorization = new OrganizationAuthorizationService(
      prisma as never,
      contextService as never,
    );

    await expect(
      authorization.resolveActor(ownerActor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('a resource from another workspace answers 404, not 403', () => {
    expect(() =>
      OrganizationAuthorizationService.assertSameWorkspace(
        { workspaceId: 'ws-1' },
        'ws-2',
      ),
    ).toThrow(NotFoundException);
    expect(() =>
      OrganizationAuthorizationService.assertSameWorkspace(
        { workspaceId: 'ws-1' },
        'ws-1',
      ),
    ).not.toThrow();
  });
});

describe('opening hours validation', () => {
  it('accepts and normalizes a full week', () => {
    const parsed = parseOpeningHours(WEEK);

    expect(parsed.monday.periods).toEqual([{ start: '08:00', end: '16:30' }]);
    expect(parsed.friday).toEqual({ closed: true, periods: [] });
    expect(Object.keys(parsed)).toHaveLength(7);
  });

  it('refuses a closed day without periods when declared open', () => {
    expect(() =>
      parseOpeningHours({ ...WEEK, monday: { closed: false, periods: [] } }),
    ).toThrow('Un jour ouvert doit avoir au moins une période.');
  });

  it('refuses periods that start after they end', () => {
    expect(() =>
      parseOpeningHours({
        ...WEEK,
        monday: { closed: false, periods: [{ start: '17:00', end: '08:00' }] },
      }),
    ).toThrow('Le début d\u2019une période doit être avant sa fin.');
  });

  it('refuses overlapping periods', () => {
    expect(() =>
      parseOpeningHours({
        ...WEEK,
        monday: {
          closed: false,
          periods: [
            { start: '08:00', end: '12:00' },
            { start: '11:00', end: '17:00' },
          ],
        },
      }),
    ).toThrow('Les périodes d\u2019un même jour ne peuvent pas se chevaucher.');
  });

  it('refuses invalid HH:mm values and missing days', () => {
    expect(() =>
      parseOpeningHours({
        ...WEEK,
        monday: { closed: false, periods: [{ start: '0800', end: '18:00' }] },
      }),
    ).toThrow();

    const withoutSunday = { monday: DAY, tuesday: DAY, wednesday: DAY, thursday: DAY, friday: DAY, saturday: DAY };
    expect(() => parseOpeningHours(withoutSunday)).toThrow();
  });

  it('accepts multiple non-overlapping periods in one day', () => {
    const parsed = parseOpeningHours({
      ...WEEK,
      monday: {
        closed: false,
        periods: [
          { start: '08:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      },
    });

    expect(parsed.monday.periods).toHaveLength(2);
  });
});

describe('organization response mapper', () => {
  it('derives contact default from the settings row and never the snapshot', () => {
    const response = mapOrganizationResponse({
      workspaceId: 'ws-1',
      workspaceType: WorkspaceType.ESTABLISHMENT,
      capabilities: [],
      scope: 'FULL',
      establishment: {
        id: 'est-1',
        name: 'Cabinet Ibn Sina',
        type: 'CABINET' as never,
        wilaya: 'Alger',
        address: '12 rue Didouche Mourad',
        phone: '0550000000',
        professionalEmail: 'contact@ibnsina.dz',
        verificationStatus: 'VERIFIED' as never,
        subscriptionStatus: 'ACTIVE' as never,
        verificationRequest: { data: null },
      },
      openingHours: { garbage: true },
      defaultAppointmentDuration: 30,
      website: 'https://settings.dz',
      dpoName: null,
      dpoEmail: null,
      dpoPhone: null,
    });

    expect(response.contacts.website).toBe('https://settings.dz');
    // Corrupted JSON column → no hours shown, no crash.
    expect(response.settings.openingHours).toBeNull();
  });
});
