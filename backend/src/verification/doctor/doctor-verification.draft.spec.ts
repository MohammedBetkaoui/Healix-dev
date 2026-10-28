/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type AuditLogsService } from '../../audit-logs/audit-logs.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { DoctorVerificationService } from './doctor-verification.service';
import { VerificationDocumentService } from '../documents/verification-document.service';
import { VerificationFileStorageService } from '../documents/verification-file-storage.service';
import { VerificationFileValidator } from '../documents/verification-file-validator';

// A client that only knows verificationRequest.create, enough for
// getOrCreateDraft on a fresh profile: it records the create payload, exactly
// what the test asserts — the type a request is born with.
function fakeClient() {
  return {
    verificationRequest: {
      // No draft on this fresh profile; the create records the payload.
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((input: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'request-1', status: 'DRAFT', ...input.data }),
      ),
    },
  };
}

// OwnedDoctorProfile: the full Prisma DoctorProfile plus its user. What the
// draft prefill reads is `isIndependent` and the display fields only.
function doctorProfile(seed: { fullName: string; isIndependent: boolean }) {
  return {
    establishment: null,
    id: 'profile-1',
    isIndependent: seed.isIndependent,
    professionalAddress: '2 rue des Orangers, Blida',
    professionalPhone: '0550000001',
    speciality: 'Cardiologie',
    user: {
      email: 'doctor@example.dz',
      fullName: seed.fullName,
      phone: '0550000001',
    },
    verificationStatus: 'DRAFT',
    wilaya: 'Blida',
  };
}

function setupWithProfile() {
  const service = new DoctorVerificationService(
    {} as PrismaService,
    {} as AuditLogsService,
    {} as VerificationDocumentService,
    {} as VerificationFileStorageService,
    {} as VerificationFileValidator,
  );
  // The audit of the draft is not what is tested here.
  const internals = service as unknown as Record<string, unknown>;
  internals.auditLogsService = {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  };

  return service;
}

// The private method is called through the typed test double: a service that
// has getOrCreateDraft taking loosely typed arguments (the Prisma client is
// fake, the profile is a subset).
function createDraft(service: unknown, profile: unknown, client: unknown) {
  const serviceWithDraft = service as {
    getOrCreateDraft: (
      profile: unknown,
      userId: string,
      context: object,
      client: unknown,
    ) => Promise<{ id: string }>;
  };

  return serviceWithDraft.getOrCreateDraft(profile, 'user-1', {}, client);
}

describe('DoctorVerificationService draft creation type', () => {
  it("begins an independent doctor's request as INDEPENDENT_DOCTOR", async () => {
    const service = setupWithProfile();
    const client = fakeClient();

    await createDraft(
      service,
      doctorProfile({ fullName: 'Samir Kaci', isIndependent: true }),
      client,
    );

    expect(client.verificationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          doctorProfileId: 'profile-1',
          type: 'INDEPENDENT_DOCTOR',
        }),
      }),
    );
  });

  it("begins an affiliated doctor's request as AFFILIATED_DOCTOR", async () => {
    const service = setupWithProfile();
    const client = fakeClient();

    await createDraft(
      service,
      doctorProfile({ fullName: 'Ramzi Ferahtia', isIndependent: false }),
      client,
    );

    expect(client.verificationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          doctorProfileId: 'profile-1',
          type: 'AFFILIATED_DOCTOR',
        }),
      }),
    );
  });
});
