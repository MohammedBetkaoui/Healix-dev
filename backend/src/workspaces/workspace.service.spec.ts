import { NotFoundException } from '@nestjs/common';
import {
  type Prisma,
  type Workspace,
  WorkspaceMembershipRole,
  WorkspaceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspaceService } from './workspace.service';

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: 'workspace-1',
  type: WorkspaceType.ESTABLISHMENT,
  name: 'Clinique Atlas',
  establishmentId: 'establishment-1',
  ownerDoctorProfileId: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

describe('WorkspaceService', () => {
  const upsert = jest.fn();
  const findUnique = jest.fn();
  const ensureMembership = jest.fn();
  const prisma = {
    workspace: { upsert, findUnique },
  } as unknown as PrismaService;
  const memberships = {
    ensureMembership,
  } as unknown as WorkspaceMembershipService;
  const service = new WorkspaceService(prisma, memberships);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an establishment workspace and its owner membership', async () => {
    upsert.mockResolvedValue(workspace());

    await expect(
      service.createForEstablishment({
        establishmentId: 'establishment-1',
        name: 'Clinique Atlas',
        ownerUserId: 'user-owner',
      }),
    ).resolves.toMatchObject({ id: 'workspace-1' });

    expect(upsert).toHaveBeenCalledWith({
      where: { establishmentId: 'establishment-1' },
      create: {
        type: WorkspaceType.ESTABLISHMENT,
        name: 'Clinique Atlas',
        establishmentId: 'establishment-1',
      },
      update: {
        type: WorkspaceType.ESTABLISHMENT,
        name: 'Clinique Atlas',
      },
    });
    expect(ensureMembership).toHaveBeenCalledWith(
      {
        workspaceId: 'workspace-1',
        userId: 'user-owner',
        role: WorkspaceMembershipRole.OWNER,
      },
      prisma,
    );
  });

  it('creates a private-practice workspace and its owner membership', async () => {
    upsert.mockResolvedValue(
      workspace({
        type: WorkspaceType.PRIVATE_PRACTICE,
        establishmentId: null,
        ownerDoctorProfileId: 'doctor-1',
      }),
    );

    await service.createForPrivatePractice({
      name: 'Dr Amine',
      ownerDoctorProfileId: 'doctor-1',
      ownerUserId: 'user-doctor',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { ownerDoctorProfileId: 'doctor-1' },
      create: {
        type: WorkspaceType.PRIVATE_PRACTICE,
        name: 'Dr Amine',
        ownerDoctorProfileId: 'doctor-1',
      },
      update: {
        type: WorkspaceType.PRIVATE_PRACTICE,
        name: 'Dr Amine',
      },
    });
    expect(ensureMembership).toHaveBeenCalledWith(
      {
        workspaceId: 'workspace-1',
        userId: 'user-doctor',
        role: WorkspaceMembershipRole.OWNER,
      },
      prisma,
    );
  });

  it('adds an affiliated doctor to the establishment workspace', async () => {
    const transaction = {
      workspace: { findUnique },
    } as unknown as Prisma.TransactionClient;
    findUnique.mockResolvedValue({ id: 'workspace-establishment' });

    await service.addDoctorToEstablishment(
      'establishment-1',
      'user-doctor',
      transaction,
    );

    expect(ensureMembership).toHaveBeenCalledWith(
      {
        workspaceId: 'workspace-establishment',
        userId: 'user-doctor',
        role: WorkspaceMembershipRole.DOCTOR,
      },
      transaction,
    );
  });

  it('rejects an affiliated doctor when the workspace is missing', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.addDoctorToEstablishment('missing-establishment', 'user-doctor'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ensureMembership).not.toHaveBeenCalled();
  });
});
