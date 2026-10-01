import { ForbiddenException } from '@nestjs/common';
import {
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceType,
} from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from './workspace-context.service';

describe('WorkspaceContextService', () => {
  const findFirst = jest.fn();
  const prisma = {
    workspaceMembership: { findFirst },
  } as unknown as PrismaService;
  const service = new WorkspaceContextService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the active establishment workspace for its owner', async () => {
    findFirst.mockResolvedValue({
      id: 'membership-1',
      role: WorkspaceMembershipRole.OWNER,
      workspace: {
        id: 'workspace-1',
        type: WorkspaceType.ESTABLISHMENT,
        establishmentId: 'establishment-1',
        ownerDoctorProfileId: null,
      },
      user: { doctorProfile: null },
    });

    await expect(
      service.resolveWorkspaceForUser({
        userId: 'user-owner',
        role: UserRole.ESTABLISHMENT_ADMIN,
      }),
    ).resolves.toEqual({
      workspaceId: 'workspace-1',
      workspaceType: WorkspaceType.ESTABLISHMENT,
      membershipRole: WorkspaceMembershipRole.OWNER,
      establishmentId: 'establishment-1',
      doctorProfileId: undefined,
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-owner',
          status: WorkspaceMembershipStatus.ACTIVE,
          role: {
            in: [WorkspaceMembershipRole.OWNER, WorkspaceMembershipRole.ADMIN],
          },
          workspaceId: undefined,
          workspace: { type: WorkspaceType.ESTABLISHMENT },
        },
      }),
    );
  });

  it('resolves the private-practice workspace for an independent doctor', async () => {
    findFirst.mockResolvedValue({
      id: 'membership-2',
      role: WorkspaceMembershipRole.OWNER,
      workspace: {
        id: 'workspace-2',
        type: WorkspaceType.PRIVATE_PRACTICE,
        establishmentId: null,
        ownerDoctorProfileId: 'doctor-1',
      },
      user: { doctorProfile: { id: 'doctor-1' } },
    });

    await expect(
      service.resolveWorkspaceForUser(
        {
          userId: 'user-doctor',
          role: UserRole.INDEPENDENT_DOCTOR,
        },
        'workspace-2',
      ),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-2',
      workspaceType: WorkspaceType.PRIVATE_PRACTICE,
      membershipRole: WorkspaceMembershipRole.OWNER,
      doctorProfileId: 'doctor-1',
    });
  });

  it('resolves an affiliated doctor as a doctor member', async () => {
    findFirst.mockResolvedValue({
      id: 'membership-3',
      role: WorkspaceMembershipRole.DOCTOR,
      workspace: {
        id: 'workspace-3',
        type: WorkspaceType.ESTABLISHMENT,
        establishmentId: 'establishment-2',
        ownerDoctorProfileId: null,
      },
      user: { doctorProfile: { id: 'doctor-2' } },
    });

    await expect(
      service.resolveWorkspaceForUser({
        userId: 'user-affiliated',
        role: UserRole.AFFILIATED_DOCTOR,
      }),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-3',
      workspaceType: WorkspaceType.ESTABLISHMENT,
      membershipRole: WorkspaceMembershipRole.DOCTOR,
      establishmentId: 'establishment-2',
      doctorProfileId: 'doctor-2',
    });
  });

  it('rejects a user without a matching active membership', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.resolveWorkspaceForUser({
        userId: 'user-without-workspace',
        role: UserRole.AFFILIATED_DOCTOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects platform roles before querying tenant memberships', async () => {
    await expect(
      service.resolveWorkspaceForUser({
        userId: 'super-admin',
        role: UserRole.SUPER_ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
