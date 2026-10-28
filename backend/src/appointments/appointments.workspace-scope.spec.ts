/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException } from '@nestjs/common';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { type PrismaService } from '../prisma/prisma.service';
import { type WorkspaceContextService } from '../workspaces/workspace-context.service';
import { type AppointmentAuditService } from './appointment-audit.service';
import { AppointmentsService } from './appointments.service';
import { type ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

// The agenda of an establishment account is operational: whoever runs the
// workspace — the owner OR an invited administrator — serves the whole
// establishment, through the same workspace resolution as patients. The
// scope below records what the service asked Prisma for.
const establishedContext = (establishmentId: string | null) => ({
  establishmentId,
  membershipRole: 'ADMIN',
  workspaceId: 'ws-1',
  workspaceType: 'ESTABLISHMENT',
});

function setup(context: Record<string, unknown> | null) {
  const prisma = {
    appointment: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    doctorProfile: { findMany: jest.fn(() => Promise.resolve([])) },
  };
  const workspaceContext = {
    resolveWorkspaceForUser: context
      ? jest.fn(() => Promise.resolve(context))
      : jest.fn(() =>
          Promise.reject(new ForbiddenException('Aucun workspace actif.')),
        ),
  };
  const service = new AppointmentsService(
    prisma as unknown as PrismaService,
    {} as AppointmentAuditService,
    workspaceContext as unknown as WorkspaceContextService,
  );

  return { prisma, service, workspaceContext };
}

const actor = (role: string): AuthenticatedUserPayload =>
  ({ role, sub: 'user-admin' }) as AuthenticatedUserPayload;

describe('AppointmentsService workspace scope of an establishment admin', () => {
  const query = {} as ListAppointmentsQueryDto;

  it('serves the invited administrator the agenda of their workspace establishment', async () => {
    const { service, workspaceContext, prisma } = setup(
      establishedContext('establishment-1'),
    );

    await service.list(actor('ESTABLISHMENT_ADMIN'), query);

    expect(workspaceContext.resolveWorkspaceForUser).toHaveBeenCalledWith({
      role: 'ESTABLISHMENT_ADMIN',
      userId: 'user-admin',
    });
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // buildWhere always adds the scheduledAt window of the query on top
        // of the scope; the scope itself filters through the doctorProfile
        // relation (Appointment has no establishmentId column).
        where: expect.objectContaining({
          doctorProfile: { establishmentId: 'establishment-1' },
        }),
      }),
    );
  });

  it('serves the owner through their workspace too', async () => {
    const { service, workspaceContext } = setup(
      establishedContext('establishment-1'),
    );

    const scope = await service.getAppointmentScope(
      actor('ESTABLISHMENT_ADMIN'),
    );

    expect(workspaceContext.resolveWorkspaceForUser).toHaveBeenCalledTimes(1);
    expect(scope.establishmentId).toBe('establishment-1');
  });

  it('refuses an account without a workspace instead of listing nothing', async () => {
    const { service } = setup(null);

    await expect(
      service.list(actor('ESTABLISHMENT_ADMIN'), query),
    ).rejects.toMatchObject({ status: 403 });
  });
});
