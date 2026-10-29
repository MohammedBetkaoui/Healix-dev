import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { WorkspaceModule } from '../workspaces/workspace.module';
import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceProofGuard } from '../offline-devices/device-proof.guard';
import {
  OfflineGrantGuard,
} from '../offline-devices/offline-grant.guard';
import { OfflineGrantService } from '../offline-devices/offline-grant.service';
import {
  type OfflineActor,
  type OfflineGrantClaims,
} from '../offline-devices/offline-device.types';
import { OfflineDevicesService } from '../offline-devices/offline-devices.service';
import { OfflineScopeService } from './offline-scope.service';
import { PrescriptionSyncService } from './prescription-sync.service';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync.dto';

// The consultation-only suites never dispatch a prescription operation: the
// stub keeps the SyncService constructor resolvable, and the real behavior
// (including its prescription reuse of PrescriptionsService) is covered by
// prescription-sync.integration.spec.ts.
const prescriptionSyncStub = { process: jest.fn() } as unknown as PrescriptionSyncService;

// The consultation stays the only writable offline aggregate, multi-device
// conflicts and idempotency behave, cross-workspace isolation holds, and the
// grant guard refuses revoked devices, suspended memberships and expired
// grants. TEST_DATABASE_URL names a database ending in "_test"; skipped
// without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const flattenErrors = (errors: unknown[]): string[] => {
  const messages: string[] = [];
  for (const error of errors) {
    const node = error as {
      constraints?: Record<string, string>;
      children?: unknown[];
    };
    messages.push(...Object.values(node.constraints ?? {}));
    if (node.children?.length) {
      messages.push(...flattenErrors(node.children));
    }
  }
  return messages;
};

describeWithDatabase('the sync contract against real queries', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let devices: OfflineDevicesService;
  let grants: OfflineGrantService;
  let grantGuard: OfflineGrantGuard;
  let sync: SyncService;

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        JwtModule.register({}),
        PrismaModule,
        WorkspaceModule,
      ],
      providers: [
        OfflineDevicesService,
        OfflineGrantService,
        OfflineGrantGuard,
        OfflineScopeService,
        SyncService,
        DeviceProofGuard,
        { provide: PrescriptionSyncService, useValue: prescriptionSyncStub },
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    devices = moduleRef.get(OfflineDevicesService);
    grants = moduleRef.get(OfflineGrantService);
    grantGuard = moduleRef.get(OfflineGrantGuard);
    sync = moduleRef.get(SyncService);
    fixtures = new IntegrationFixtures(prisma, 'sync-contract');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await moduleRef.close();
  });

  // ---- helpers --------------------------------------------------------------

  // One doctor registration: a real device row, a real signed grant token,
  // and a real RSA keypair in the offline device row, exactly as the desktop
  // registers it (the service refuses a non-key public key value).
  const generateKeypair = () =>
    generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

  type RegisteredDevice = {
    registered: Awaited<ReturnType<OfflineDevicesService['register']>>;
    claims: OfflineGrantClaims;
    actor: OfflineActor;
    token: string;
    keys: { privateKey: string; publicKey: string };
  };

  const registerDevice = async (
    doctor: Awaited<ReturnType<IntegrationFixtures['independentDoctor']>>,
    suffix: string,
  ): Promise<RegisteredDevice> => {
    const keys = generateKeypair();
    const registered = await devices.register(doctor.actor, {
      installationId: randomUUID(),
      deviceName: `Bureau ${suffix}`,
      platform: 'windows',
      publicKey: keys.publicKey,
    });
    const claims = await grants.verify(registered.offlineAccessGrant);
    const actor: OfflineActor = {
      grantId: claims.grantId,
      userId: claims.userId,
      deviceId: claims.deviceId,
      workspaceId: claims.workspaceId,
      role: claims.role,
      offlineCapabilities: claims.offlineCapabilities,
      offlineScope: claims.offlineScope,
    };
    return { registered, claims, actor, token: registered.offlineAccessGrant, keys };
  };

  const runGrantGuard = (token: string) =>
    grantGuard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
      }),
    } as unknown as ExecutionContext);

  const consultationOperation = (input: {
    operationId: string;
    localEntityId: string;
    patientId: string;
    operation: 'CREATE' | 'UPDATE';
    baseVersion?: number;
    serverEntityId?: string;
    chiefComplaint: string;
  }) => ({
    operationId: input.operationId,
    entityType: 'CONSULTATION',
    localEntityId: input.localEntityId,
    operation: input.operation,
    baseVersion: input.baseVersion,
    occurredAt: new Date().toISOString(),
    payload: {
      patientId: input.patientId,
      serverEntityId: input.serverEntityId,
      localStatus: 'READY_TO_SYNC',
      chiefComplaint: input.chiefComplaint,
    } as never,
  });

  const prescriptionOperation = (input: {
    operationId: string;
    localEntityId: string;
    patientId: string;
    operation: 'CREATE' | 'UPDATE';
    dci: string;
    regulatoryCategory?: 'STANDARD' | 'REGULATED';
  }) => ({
    operationId: input.operationId,
    entityType: 'PRESCRIPTION',
    localEntityId: input.localEntityId,
    operation: input.operation,
    occurredAt: new Date().toISOString(),
    payload: {
      patientId: input.patientId,
      items: [
        {
          dci: input.dci,
          strength: '500 mg',
          pharmaceuticalForm: 'TABLET',
          route: 'ORAL',
          regulatoryCategory: input.regulatoryCategory ?? 'STANDARD',
          dosePerIntake: '1 comprimé',
          frequency: '2 fois par jour',
          quantity: '12 comprimés',
        },
      ],
    } as never,
  });

  describe('the writable aggregate rule (consultation only)', () => {
    it('the DTO refuses the push of PATIENT and of APPOINTMENT with an explicit message', async () => {
      for (const entityType of ['PATIENT', 'APPOINTMENT']) {
        const dto = plainToInstance(SyncPushDto, {
          operations: [
            {
              operationId: randomUUID(),
              entityType,
              localEntityId: randomUUID(),
              operation: 'CREATE',
              occurredAt: '2026-10-28T08:00:00.000Z',
              payload: {
                patientId: randomUUID(),
                localStatus: 'LOCAL_DRAFT',
              },
            },
          ],
        });
        const errors = await validate(dto);
        expect(flattenErrors(errors)).toHaveLength(1);
        expect(flattenErrors(errors)[0]).toMatch(
          /brouillon d'ordonnance \(PRESCRIPTION DRAFT\)/,
        );
      }
      // The writable aggregate keeps passing validation in the same shape.
      const dto = plainToInstance(SyncPushDto, {
        operations: [
          consultationOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: randomUUID(),
            operation: 'CREATE',
            chiefComplaint: 'Contrôle annuel',
          }),
        ],
      });
      expect(await validate(dto)).toHaveLength(0);
      // The prescription draft joins the writable aggregates with the same
      // envelope, validated in the service once the durable row exists.
      const prescriptionDto = plainToInstance(SyncPushDto, {
        operations: [
          prescriptionOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: randomUUID(),
            operation: 'CREATE',
            dci: 'Paracétamol',
          }),
        ],
      });
      expect(await validate(prescriptionDto)).toHaveLength(0);
    });

    it('the service rejects a consultation push on a patient outside the offline scope', async () => {
      const doctor = await fixtures.independentDoctor();
      const { actor } = await registerDevice(doctor, 'scope-reject');
      // A patient of another workspace is never in this doctor's scope.
      const elsewhere = await fixtures.independentDoctor();
      const strangerPatient = await fixtures.patient(
        elsewhere.workspace.id,
        elsewhere.profile.id,
      );

      const results = await sync.push(actor, {
        operations: [
          consultationOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: strangerPatient.id,
            operation: 'CREATE',
            chiefComplaint: 'Traitement hors périmètre',
          }),
        ],
      } as never);
      const result = results.results[0] as { status: string; code: string };
      expect(result.status).toBe('REJECTED');
      expect(result.code).toBe('PATIENT_OUTSIDE_OFFLINE_SCOPE');
    });
  });

  describe('multi-device behavior', () => {
    it('two devices pushing the same consultation: the first wins, the second conflicts with the server version, and B never overwrites A', async () => {
      const doctor = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctor, 'device-a');
      const deviceB = await registerDevice(doctor, 'device-b');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );

      // Device A wins the first write.
      const pushA = await sync.push(deviceA.actor, {
        operations: [
          consultationOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: patient.id,
            operation: 'CREATE',
            chiefComplaint: 'Douleur poitrine — écrit par A',
          }),
        ],
      } as never);
      const resultA = pushA.results[0] as {
        status: string;
        serverEntityId: string;
        serverVersion: number;
      };
      expect(resultA.status).toBe('ACK');
      expect(resultA.serverVersion).toBe(1);

      // Device B learned the id through the cloud then pushes against the
      // version it still holds (1): conflict, and the server keeps A.
      const pushB = await sync.push(deviceB.actor, {
        operations: [
          consultationOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: patient.id,
            operation: 'UPDATE',
            baseVersion: 1,
            serverEntityId: resultA.serverEntityId,
            chiefComplaint: 'Écrit par B',
          }),
        ],
      } as never);
      const resultB = pushB.results[0] as {
        status: string;
        code?: string;
        serverVersion?: number;
        serverPayload?: { chiefComplaint?: string };
      };
      expect(resultB.status).toBe('CONFLICT');
      expect(resultB.code).toBe('SYNC_CONFLICT');
      // The consultation of A was finalised at creation: B conflicts on
      // status, and the server keeps version 1 with A's content.
      expect(resultB.serverVersion).toBe(1);
      expect(resultB.serverPayload?.chiefComplaint).toBe(
        'Douleur poitrine — écrit par A',
      );

      const stored = await prisma.patientConsultation.findUniqueOrThrow({
        where: { id: resultA.serverEntityId },
        select: { chiefComplaint: true, syncVersion: true },
      });
      expect(stored.chiefComplaint).toBe('Douleur poitrine — écrit par A');
      expect(stored.syncVersion).toBe(1);
    });

    it('a pushed operation is acknowledged again identically, and another device may not reuse the id', async () => {
      const doctor = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctor, 'idem-a');
      const deviceB = await registerDevice(doctor, 'idem-b');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const operationId = randomUUID();
      const operation = consultationOperation({
        operationId,
        localEntityId: randomUUID(),
        patientId: patient.id,
        operation: 'CREATE',
        chiefComplaint: 'Suivi tension',
      });

      const first = (await sync.push(deviceA.actor, {
        operations: [operation],
      } as never)).results[0] as { status: string; serverVersion: number };
      expect(first.status).toBe('ACK');

      // Same device, same operationId replayed: the stored result comes back
      // untouched.
      const replay = (await sync.push(deviceA.actor, {
        operations: [operation],
      } as never)).results[0] as { status: string; serverVersion: number };
      expect(replay).toEqual(first);

      // Another device may not claim the id of A.
      const hijack = (await sync.push(deviceB.actor, {
        operations: [operation],
      } as never)).results[0] as { status: string; code: string };
      expect(hijack.status).toBe('REJECTED');
      expect(hijack.code).toBe('OPERATION_ID_ALREADY_USED');
    });
  });

  describe('cross-workspace isolation', () => {
    it('a device never sees or pushes the patients of another workspace', async () => {
      const doctorA = await fixtures.independentDoctor();
      const doctorB = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctorA, 'cross-a');
      const deviceB = await registerDevice(doctorB, 'cross-b');
      const patientA = await fixtures.patient(
        doctorA.workspace.id,
        doctorA.profile.id,
      );
      const patientB = await fixtures.patient(
        doctorB.workspace.id,
        doctorB.profile.id,
      );

      const bootstrapA = await sync.bootstrap(deviceA.actor);
      expect(bootstrapA.authorizedPatientIds).toContain(patientA.id);
      expect(
        (bootstrapA.patients as { id: string }[]).some(
          (row) => row.id === patientB.id,
        ),
      ).toBe(false);
      expect(bootstrapA.authorizedPatientIds).not.toContain(patientB.id);

      // One consultation in workspace A: no change of it may reach device B.
      await sync.push(deviceA.actor, {
        operations: [
          consultationOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: patientA.id,
            operation: 'CREATE',
            chiefComplaint: 'Confidentiel cabinet A',
          }),
        ],
      } as never);

      const pullB = await sync.pull(deviceB.actor);
      const leaks = (pullB.changes as {
        payload: { patientId: string } | null;
      }[]).filter(
        (change) => change.payload?.patientId === patientA.id,
      );
      expect(leaks).toHaveLength(0);

      // Pushing data of patient B on device A is refused.
      const outOfScope = (await sync.push(deviceA.actor, {
        operations: [
          consultationOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: patientB.id,
            operation: 'CREATE',
            chiefComplaint: 'Tentative cabine B',
          }),
        ],
      } as never)).results[0] as { status: string; code: string };
      expect(outOfScope.status).toBe('REJECTED');
      expect(outOfScope.code).toBe('PATIENT_OUTSIDE_OFFLINE_SCOPE');
    });

    it('the reconcile view carries only the authorized patients of the device', async () => {
      const doctorA = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctorA, 'reconcile-a');
      const doctorB = await fixtures.independentDoctor();
      const patientB = await fixtures.patient(
        doctorB.workspace.id,
        doctorB.profile.id,
      );
      const view = await sync.reconcile(deviceA.actor);
      expect(view.authorizedPatientIds).not.toContain(patientB.id);
    });
  });

  describe('revoked device', () => {
    it('after revoke, the former grant can no longer be used by the guard (the device-side signature changes nothing)', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'revoke-flow');
      await expect(runGrantGuard(device.token)).resolves.toBe(true);

      const revoked = await devices.revoke(doctor.actor, device.claims.deviceId);
      expect(revoked.revokedAt).toBeTruthy();

      // The grant row and the device row are kept: an explicit audit trail,
      // the desktop keeps its encrypted storage; only the sync is refused.
      const grantRow = await prisma.offlineAccessGrant.findUniqueOrThrow({
        where: { id: device.claims.grantId },
        select: { revokedAt: true },
      });
      expect(grantRow.revokedAt).toBeTruthy();
      await expect(runGrantGuard(device.token)).rejects.toThrow(
        UnauthorizedException,
      );

      // A silent re-registration does not resurrect the device.
      await expect(
        devices.register(doctor.actor, {
          installationId: (
            await prisma.offlineDevice.findUniqueOrThrow({
              where: { id: device.claims.deviceId },
              select: { installationId: true },
            })
          ).installationId,
          deviceName: 'Bureau revenu',
          platform: 'windows',
          publicKey: generateKeypair().publicKey,
        }),
      ).rejects.toThrow(/réautoris/);
    });

    it('an explicit reauthorization issues a fresh grant for the revoked device', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'reauth');
      await devices.revoke(doctor.actor, device.claims.deviceId);

      const restored = await devices.reauthorize(
        doctor.actor,
        device.claims.deviceId,
      );
      const claims = await grants.verify(restored.offlineAccessGrant);
      expect(claims.deviceId).toBe(device.claims.deviceId);
      await expect(runGrantGuard(restored.offlineAccessGrant)).resolves.toBe(
        true,
      );
    });

    it('a key rotation revokes the standing grants and issues a fresh grant against the rotating key', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'rotation');
      const rotated = await devices.register(doctor.actor, {
        installationId: (
          await prisma.offlineDevice.findUniqueOrThrow({
            where: { id: device.claims.deviceId },
            select: { installationId: true },
          })
        ).installationId,
        deviceName: 'Bureau tournant',
        platform: 'windows',
        publicKey: generateKeypair().publicKey,
      });
      expect(rotated.keyRotated).toBe(true);
      const existingGrant = await prisma.offlineAccessGrant.findUniqueOrThrow({
        where: { id: device.claims.grantId },
        select: { revokedAt: true },
      });
      expect(existingGrant.revokedAt).toBeTruthy();
      const claims = await grants.verify(rotated.offlineAccessGrant);
      expect(claims.deviceId).toBe(device.claims.deviceId);
    });
  });

  describe('revoked membership', () => {
    it('a suspended membership stops the sync of the doctor even with a live grant', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'membership');
      await expect(runGrantGuard(device.token)).resolves.toBe(true);

      await prisma.workspaceMembership.updateMany({
        where: {
          userId: doctor.user.id,
          workspaceId: doctor.workspace.id,
        },
        data: { status: 'SUSPENDED' },
      });
      await expect(runGrantGuard(device.token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('expired grant', () => {
    it('an expired grant no longer passes the guard, and nothing is auto-deleted nor auto-revoked', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'expired');
      await expect(runGrantGuard(device.token)).resolves.toBe(true);

      await prisma.offlineAccessGrant.update({
        where: { id: device.claims.grantId },
        data: { expiresAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      await expect(runGrantGuard(device.token)).rejects.toThrow(
        UnauthorizedException,
      );

      const row = await prisma.offlineAccessGrant.findUniqueOrThrow({
        where: { id: device.claims.grantId },
        select: { revokedAt: true, userId: true },
      });
      // An expiration is not a revocation: the row stays, the desktop keeps
      // its encrypted data, only the API is closed.
      expect(row.revokedAt).toBeNull();
      expect(row.userId).toBe(doctor.user.id);
    });
  });
});
