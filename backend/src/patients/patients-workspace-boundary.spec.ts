import { NotFoundException } from '@nestjs/common';
import {
  type Patient,
  type Prisma,
  WorkspaceMembershipRole,
  WorkspaceType,
} from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { PatientGender } from '../common/enums/patient-gender.enum';
import { PatientInsurance } from '../common/enums/patient-insurance.enum';
import { PatientSector } from '../common/enums/patient-sector.enum';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import { PatientFileStorageService } from './documents/patient-file-storage.service';
import { PatientFileValidator } from './documents/patient-file-validator';
import { PatientAuditService } from './patient-audit.service';
import { PatientsService } from './patients.service';

describe('PatientsService workspace boundary', () => {
  const create = jest.fn<Promise<Patient>, [Prisma.PatientCreateArgs]>();
  const findFirst = jest.fn();
  const log = jest.fn();
  const resolveWorkspaceForUser = jest.fn();
  const prisma = {
    patient: { create, findFirst },
  } as unknown as PrismaService;
  const audit = { log } as unknown as PatientAuditService;
  const context = {
    resolveWorkspaceForUser,
  } as unknown as WorkspaceContextService;
  const service = new PatientsService(
    prisma,
    audit,
    {} as PatientFileValidator,
    {} as PatientFileStorageService,
    context,
  );
  const actor = {
    sub: 'owner-a',
    email: 'owner-a@healix.dz',
    role: UserRole.ESTABLISHMENT_ADMIN,
    tokenType: 'access' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceForUser.mockResolvedValue({
      workspaceId: 'workspace-a',
      workspaceType: WorkspaceType.ESTABLISHMENT,
      membershipRole: WorkspaceMembershipRole.OWNER,
      establishmentId: 'establishment-a',
    });
  });

  it('dual-writes the workspace and legacy owner on patient creation', async () => {
    create.mockResolvedValue({ id: 'patient-a' } as unknown as Patient);
    log.mockResolvedValue(undefined);

    await service.create(actor, {
      firstName: 'Amine',
      firstNameAr: 'Amine',
      lastName: 'Benali',
      lastNameAr: 'Benali',
      gender: PatientGender.MALE,
      birthDate: '1990-01-01',
      nationalId: '1234567890',
      phone: '0550000000',
      address: '1 rue Didouche Mourad',
      wilaya: 'Alger',
      commune: 'Alger Centre',
      emergencyContactName: 'Nadia Benali',
      emergencyContactPhone: '0550000001',
      insurance: PatientInsurance.CNAS,
      sector: PatientSector.PRIVATE,
    });

    const createArgs = create.mock.calls[0]?.[0];

    expect(createArgs?.data).toEqual(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        establishmentId: 'establishment-a',
        doctorProfileId: undefined,
      }),
    );
  });

  it('always scopes a patient lookup by the resolved workspace', async () => {
    findFirst.mockResolvedValue({ id: 'patient-a' });

    await service.findOne(actor, 'patient-a');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-a', workspaceId: 'workspace-a' },
    });
  });

  it('does not expose a patient absent from the current workspace', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.findOne(actor, 'patient-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-b', workspaceId: 'workspace-a' },
    });
  });
});
