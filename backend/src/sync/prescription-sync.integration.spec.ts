import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { OfflineGrantService } from '../offline-devices/offline-grant.service';
import {
  type OfflineActor,
  type OfflineGrantClaims,
} from '../offline-devices/offline-device.types';
import { OfflineDevicesService } from '../offline-devices/offline-devices.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { OfflineScopeService } from './offline-scope.service';
import { PrescriptionSyncService } from './prescription-sync.service';
import { SyncService } from './sync.service';

// The second offline vertical: prescription drafts are created, edited and
// synchronized from the desktop while every clinical and regulatory invariant
// stays on the server — deducts prescriber/workspace/author identity from the
// offline actor, re-reads the medication catalog, guards updates with the
// optimistic syncVersion, surfaces conflicts without overwriting, renders
// VALIDATED/CANCELED orders read-only and tombstones deleted drafts. The real
// PrescriptionsService rule book backs the sync path (the PDF pipeline is
// stubbed so this suite runs without Chromium). Real MySQL, skipped without
// TEST_DATABASE_URL.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const MEDICATION_SOURCE = 'sync-prescription-spec';

// PrescriptionsModule chains the real storage providers: they only need a
// writable UPLOAD_ROOT (written only by the stubbed PDF pipeline output) so
// the module starts like in the application.
const uploadRoot = join(tmpdir(), 'healixdz-sync-prescription-uploads');

describeWithDatabase('the prescription vertical against real queries', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let devices: OfflineDevicesService;
  let grants: OfflineGrantService;
  let sync: SyncService;
  let prescriptions: PrescriptionsService;

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    mkdirSync(uploadRoot, { recursive: true });
    process.env.UPLOAD_ROOT = uploadRoot;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        JwtModule.register({}),
        PrismaModule,
        WorkspaceModule,
        // The whole prescription vertical: PatientsService, the authorization,
        // the safety/regulatory rules, the real number sequence and the real
        // storage — exactly the way the application wires them (template of
        // the report-numbering suite).
        PrescriptionsModule,
      ],
      providers: [
        OfflineDevicesService,
        OfflineGrantService,
        OfflineScopeService,
        PrescriptionSyncService,
        SyncService,
      ],
    })
      // The prescription PDF pipeline is stubbed so this suite does not need
      // Chromium: the validation test below still exercises the real number
      // sequence, snapshots and fingerprint bookkeeping, and
      // prescription-pdf.service.integration.spec.ts covers the renderer.
      .overrideProvider(AiReportRenderer)
      .useValue({ render: async () => Buffer.from('%PDF-stub') })
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    devices = moduleRef.get(OfflineDevicesService);
    grants = moduleRef.get(OfflineGrantService);
    sync = moduleRef.get(SyncService);
    prescriptions = moduleRef.get(PrescriptionsService);
    fixtures = new IntegrationFixtures(prisma, 'sync-rx');
  });

  afterAll(async () => {
    // A failing module init leaves the getters undefined: never mask the
    // original failure with a cleanup TypeError.
    if (prisma) {
      await prisma.medicationReference.deleteMany({
        where: { source: MEDICATION_SOURCE },
      });
      await fixtures.cleanup();
    }
    await moduleRef?.close();
    rmSync(uploadRoot, { recursive: true, force: true });
  });

  // ---- helpers --------------------------------------------------------------

  const generateKeypair = () =>
    generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

  type RegisteredDevice = {
    claims: OfflineGrantClaims;
    actor: OfflineActor;
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
    return { claims, actor };
  };

  const draftItem = (overrides: Record<string, unknown> = {}) => ({
    dci: 'Paracétamol',
    strength: '500 mg',
    pharmaceuticalForm: 'TABLET',
    route: 'ORAL',
    regulatoryCategory: 'STANDARD',
    dosePerIntake: '1 comprimé',
    frequency: '3 fois par jour',
    quantity: '1 boîte',
    ...overrides,
  });

  const prescriptionOperation = (input: {
    operationId: string;
    localEntityId: string;
    patientId: string;
    operation: 'CREATE' | 'UPDATE';
    baseVersion?: number;
    serverEntityId?: string;
    validUntil?: string | null;
    regulatory?: {
      acknowledgement: boolean;
      carnetReference?: string;
      note?: string;
    };
    items?: Record<string, unknown>[];
  }) => ({
    operationId: input.operationId,
    entityType: 'PRESCRIPTION',
    localEntityId: input.localEntityId,
    operation: input.operation,
    baseVersion: input.baseVersion,
    occurredAt: new Date().toISOString(),
    payload: {
      patientId: input.patientId,
      ...(input.serverEntityId !== undefined
        ? { serverEntityId: input.serverEntityId }
        : {}),
      ...(input.validUntil !== undefined
        ? { validUntil: input.validUntil }
        : {}),
      ...(input.regulatory !== undefined
        ? { regulatory: input.regulatory }
        : {}),
      items: input.items ?? [draftItem()],
    } as never,
  });

  const referenceMedication = (
    overrides: Record<string, unknown> = {},
    ) =>
    prisma.medicationReference.create({
      data: {
        source: MEDICATION_SOURCE,
        sourceReference: randomUUID(),
        dci: 'Paracétamol',
        brandName: 'Doliprane',
        strength: '500 mg',
        pharmaceuticalForm: 'TABLET',
        route: 'ORAL',
        regulatoryCategory: 'STANDARD',
        ...overrides,
      },
    });

  const createResult = async (
    device: RegisteredDevice,
    patientId: string,
    overrides: Partial<Parameters<typeof prescriptionOperation>[0]> = {},
  ) =>
    (await sync.push(device.actor, {
      operations: [
        prescriptionOperation({
          operationId: randomUUID(),
          localEntityId: randomUUID(),
          patientId,
          operation: 'CREATE',
          ...overrides,
        }),
      ],
    } as never)).results[0] as {
    status: string;
    code?: string;
    serverEntityId?: string;
    serverVersion?: number;
    serverPayload?: { items?: { dci: string }[]; number?: string | null };
    localPayload?: { items?: { dci: string }[] };
  };

  describe('offline draft creation', () => {
    it('a pushed draft becomes a server DRAFT owned by the actor, with catalog values re-read from the reference table', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'create');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const catalog = await referenceMedication();
      // The device claims values diagnostically different from the catalog:
      // the server re-reads the MedicationReference and its values win.
      const operationId = randomUUID();
      const localEntityId = randomUUID();
      const operation = prescriptionOperation({
        operationId,
        localEntityId,
        patientId: patient.id,
        operation: 'CREATE',
        items: [
          draftItem({
            medicationId: catalog.id,
            dci: 'DCI-FAUX-DU-CACHE',
            strength: '999 g',
          }),
          draftItem({ dci: 'Metformine', strength: '850 mg' }),
        ],
      });
      const result = (await sync.push(device.actor, {
        operations: [operation],
      } as never)).results[0] as {
      status: string;
      code?: string;
      serverEntityId?: string;
      serverVersion?: number;
    };

      expect(result.status).toBe('ACK');
      expect(result.serverVersion).toBe(1);
      expect(device.claims.offlineCapabilities.prescriptions).toEqual({
        draft: true,
        validate: false,
      });

      const row = await prisma.prescription.findUniqueOrThrow({
        where: { id: result.serverEntityId! },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      expect(row.workspaceId).toBe(doctor.workspace.id);
      expect(row.patientId).toBe(patient.id);
      expect(row.prescriberDoctorProfileId).toBe(doctor.profile.id);
      expect(row.createdById).toBe(doctor.user.id);
      expect(row.status).toBe('DRAFT');
      expect(row.type).toBe('STANDARD');
      expect(row.syncVersion).toBe(1);
      expect(row.number).toBeNull();
      expect(row.items).toHaveLength(2);
      expect(row.items[0].dci).toBe('Paracétamol');
      expect(row.items[0].strength).toBe('500 mg');
      expect(row.items[0].brandName).toBe('Doliprane');
      expect(row.items[0].medicationId).toBe(catalog.id);
      expect(row.items[1].dci).toBe('Metformine');
      expect(row.items[1].medicationId).toBeNull();

      const audits = await prisma.auditLog.findMany({
        where: { entityType: 'PRESCRIPTION', entityId: row.id },
      });
      const offlineAudit = audits.find(
        (audit) => audit.action === 'PRESCRIPTION_CREATED_OFFLINE',
      );
      expect(offlineAudit?.metadata).toMatchObject({
        deviceId: device.claims.deviceId,
        operationId: expect.any(String),
      });

      const change = await prisma.syncChange.findFirstOrThrow({
        where: { entityType: 'PRESCRIPTION', entityId: row.id },
      });
      expect(change.operation).toBe('CREATE');
      expect(change.patientId).toBe(patient.id);
      const payload = change.payload as { items: unknown[] };
      expect(payload.items).toHaveLength(2);

      const mapping = await prisma.syncEntityMap.findUniqueOrThrow({
        where: {
          deviceId_entityType_localEntityId: {
            deviceId: device.claims.deviceId,
            entityType: 'PRESCRIPTION',
            localEntityId,
          },
        },
      });
      expect(mapping.serverEntityId).toBe(row.id);
    });

    it('the same operationId replays the durable result, another device may not claim it, and an out-of-scope or empty draft is rejected', async () => {
      const doctor = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctor, 'idem-a');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const operationId = randomUUID();
      const localEntityId = randomUUID();
      const first = await createResult(deviceA, patient.id, {
        operationId,
        localEntityId,
      });
      expect(first.status).toBe('ACK');

      const replay = await createResult(deviceA, patient.id, {
        operationId,
        localEntityId,
      });
      expect(replay).toEqual(first);

      const stranger = await fixtures.independentDoctor();
      const deviceB = await registerDevice(stranger, 'idem-b');
      // A device without the mapping learns the server id through the payload
      // fallback and can never claim the durable result of device A.
      const hijack = await createResult(deviceB, patient.id, {
        operationId,
        localEntityId,
        serverEntityId: first.serverEntityId,
      });
      expect(hijack.status).toBe('REJECTED');
      expect(hijack.code).toBe('OPERATION_ID_ALREADY_USED');

      const elseSnake = await fixtures.independentDoctor();
      const deviceC = await registerDevice(elseSnake, 'idem-c');
      const strangerPatient = await fixtures.patient(
        stranger.workspace.id,
        stranger.profile.id,
      );
      const outOfScope = await createResult(deviceC, strangerPatient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
      });
      expect(outOfScope.status).toBe('REJECTED');
      expect(outOfScope.code).toBe('PATIENT_OUTSIDE_OFFLINE_SCOPE');

      // The empty-draft rejection runs inside C's own scope (the scope gate
      // is evaluated before the payload rules).
      const localPatient = await fixtures.patient(
        elseSnake.workspace.id,
        elseSnake.profile.id,
      );
      const empty = await createResult(deviceC, localPatient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        items: [],
      });
      expect(empty.status).toBe('REJECTED');
      expect(empty.code).toBe('PRESCRIPTION_EMPTY');
    });

    it('a payload with an unexpected field is durably REJECTED as INVALID_PAYLOAD', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'invalid-payload');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const operation = prescriptionOperation({
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        patientId: patient.id,
        operation: 'CREATE',
      });
      (operation.payload as Record<string, unknown>).prescriberDoctorProfileId =
        doctor.profile.id;
      const result = (await sync.push(device.actor, {
        operations: [operation],
      } as never)).results[0] as { status: string; code?: string };
      expect(result.status).toBe('REJECTED');
      expect(result.code).toBe('INVALID_PAYLOAD');
      const stored = await prisma.syncOperation.findUniqueOrThrow({
        where: { operationId: operation.operationId },
        select: { status: true },
      });
      expect(stored.status).toBe('REJECTED');
    });
  });

  describe('draft updates and conflicts without overwrite', () => {
    it('an update with the current baseVersion bumps the version and replaces the items', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'update');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const created = await createResult(device, patient.id);
      expect(created.status).toBe('ACK');

      const result = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Amoxicilline', strength: '1 g' })],
      });
      expect(result.status).toBe('ACK');
      expect(result.serverVersion).toBe(2);

      const row = await prisma.prescription.findUniqueOrThrow({
        where: { id: created.serverEntityId! },
        include: { items: true },
      });
      expect(row.syncVersion).toBe(2);
      expect(row.items).toHaveLength(1);
      expect(row.items[0].dci).toBe('Amoxicilline');
    });

    it('a stale baseVersion conflicts: the server content and version are preserved', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'stale');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const created = await createResult(device, patient.id);
      const second = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Amoxicilline', strength: '1 g' })],
      });
      expect(second.status).toBe('ACK');

      const stale = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Ibuprofène', strength: '400 mg' })],
      });
      expect(stale.status).toBe('CONFLICT');
      expect(stale.code).toBe('SYNC_CONFLICT');
      expect(stale.serverVersion).toBe(2);
      expect(stale.serverPayload?.items?.[0]?.dci).toBe('Amoxicilline');
      expect(stale.localPayload?.items?.[0]?.dci).toBe('Ibuprofène');

      const row = await prisma.prescription.findUniqueOrThrow({
        where: { id: created.serverEntityId! },
        select: {
          syncVersion: true,
          items: { select: { dci: true }, orderBy: { position: 'asc' } },
        },
      });
      expect(row.syncVersion).toBe(2);
      expect(row.items[0].dci).toBe('Amoxicilline');
    });

    it('two devices editing the same draft: the first wins, the second conflicts', async () => {
      const doctor = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctor, 'multi-a');
      const deviceB = await registerDevice(doctor, 'multi-b');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const created = await createResult(deviceA, patient.id);
      const updateA = await createResult(deviceA, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Amoxicilline', strength: '1 g' })],
      });
      expect(updateA.status).toBe('ACK');

      const updateB = await createResult(deviceB, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Ibuprofène', strength: '400 mg' })],
      });
      expect(updateB.status).toBe('CONFLICT');
      expect(updateB.serverVersion).toBe(2);
      expect(updateB.serverPayload?.items?.[0]?.dci).toBe('Amoxicilline');

      const row = await prisma.prescription.findUniqueOrThrow({
        where: { id: created.serverEntityId! },
        select: {
          syncVersion: true,
          items: { select: { dci: true }, orderBy: { position: 'asc' } },
        },
      });
      expect(row.syncVersion).toBe(2);
      expect(row.items[0].dci).toBe('Amoxicilline');
    });
  });

  describe('final states stay server-authoritative', () => {
    it('a draft submitted then validated on the cloud is never moved back or overwritten by the device', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'final-authority');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const created = await createResult(device, patient.id);
      expect(created.status).toBe('ACK');

      const submitted = await prescriptions.submit(
        doctor.actor,
        created.serverEntityId!,
      );
      expect(submitted.status).toBe('PENDING_VALIDATION');
      const rejectedWhilePending = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Ibuprofène', strength: '400 mg' })],
      });
      expect(rejectedWhilePending.status).toBe('CONFLICT');
      expect(rejectedWhilePending.code).toBe('PRESCRIPTION_NOT_EDITABLE');
      const pendingPayload =
        rejectedWhilePending.serverPayload as { status: string };
      expect(pendingPayload.status).toBe('PENDING_VALIDATION');

      const validated = await prescriptions.validate(
        doctor.actor,
        created.serverEntityId!,
      );
      expect(validated.status).toBe('VALIDATED');
      expect(validated.number).toMatch(/^ORD-\d{4}-\d{6}$/);
      const numberUsed = validated.number;

      const rejectedAfterValidation = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Doliprane', strength: '1 g' })],
      });
      expect(rejectedAfterValidation.status).toBe('CONFLICT');
      expect(rejectedAfterValidation.code).toBe('PRESCRIPTION_NOT_EDITABLE');
      const validatedPayload =
        rejectedAfterValidation.serverPayload as { number: string | null };
      expect(validatedPayload.number).toBe(numberUsed);

      const row = await prisma.prescription.findUniqueOrThrow({
        where: { id: created.serverEntityId! },
      });
      expect(row.status).toBe('VALIDATED');
      expect(row.number).toBe(numberUsed);
      expect(row.contentFingerprint).toHaveLength(64);
      expect(row.syncVersion).toBe(3);
    });

    it('a web edit during the outage ends in a conflict on the next device push', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'web-edit');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const created = await createResult(device, patient.id);

      await prescriptions.update(doctor.actor, created.serverEntityId!, {
        items: [draftItem({ dci: 'Amoxicilline', strength: '1 g' })],
      });

      const push = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: created.serverEntityId,
        items: [draftItem({ dci: 'Ibuprofène', strength: '400 mg' })],
      });
      expect(push.status).toBe('CONFLICT');
      expect(push.serverVersion).toBe(2);
      expect(push.serverPayload?.items?.[0]?.dci).toBe('Amoxicilline');
    });
  });

  describe('change feed, bootstrap and repossession', () => {
    it('the change feed reports drafts, finalized states read-only and the tombstone of deleted drafts', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'feed');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      // The prescription draft + validation it is removed from the cloud.
      const created = await createResult(device, patient.id);
      const pullDraft = await sync.pull(device.actor);
      const draftChanges = (
        pullDraft.changes as {
          entityType: string;
          entityId: string;
          operation: string;
        }[]
      ).filter(
        (change) =>
          change.entityType === 'PRESCRIPTION' &&
          change.entityId === created.serverEntityId,
      );
      expect(draftChanges.length).toBeGreaterThanOrEqual(1);
      expect(draftChanges.at(-1)?.operation).toBe('CREATE');

      const resignedDraft = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
      });
      await prescriptions.validate(doctor.actor, resignedDraft.serverEntityId!);
      const pullValidated = await sync.pull(device.actor);
      const validatedChange = (
        pullValidated.changes as {
          entityType: string;
          entityId: string;
          operation: string;
          payload: { status: string; number: string | null };
        }[]
      ).filter(
        (change) =>
          change.entityType === 'PRESCRIPTION' &&
          change.entityId === resignedDraft.serverEntityId,
      );
      expect(validatedChange.at(-1)?.operation).toBe('UPDATE');
      expect(validatedChange.at(-1)?.payload.status).toBe('VALIDATED');
      expect(validatedChange.at(-1)?.payload.number).toMatch(
        /^ORD-\d{4}-\d{6}$/,
      );

      await prescriptions.remove(doctor.actor, created.serverEntityId!);
      const pullTombstone = await sync.pull(device.actor);
      const tombstone = (
        pullTombstone.changes as {
          entityType: string;
          entityId: string;
          operation: string;
          payload: { deletedAt?: string; status?: string } | null;
        }[]
      ).find(
        (change) =>
          change.entityType === 'PRESCRIPTION' &&
          change.operation === 'TOMBSTONE',
      );
      expect(tombstone?.entityId).toBe(created.serverEntityId);
      expect(tombstone?.payload?.deletedAt).toBeTruthy();
      await expect(
        prisma.prescription.findUnique({
          where: { id: created.serverEntityId! },
        }),
      ).resolves.toBeNull();
    });

    it('the bootstrap carries only the doctor unsettled drafts inside the current scope', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'bootstrap');
      const patient = await fixtures.patient(
        doctor.workspace.id,
        doctor.profile.id,
      );
      const draft = await createResult(device, patient.id);
      const outdated = await createResult(device, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
      });
      await prescriptions.validate(doctor.actor, outdated.serverEntityId!);

      const bootstrap = await sync.bootstrap(device.actor);
      const ids = (bootstrap.prescriptions as { id: string }[]).map(
        (row) => row.id,
      );
      expect(ids).toContain(draft.serverEntityId);
      expect(ids).not.toContain(outdated.serverEntityId);
    });

    it('in a shared workspace a second doctor may not edit a draft he does not own, even when the patient is in its scope', async () => {
      const establishment = await fixtures.establishmentWithDoctors(2);
      const [owner, colleague] = establishment.doctors;
      const deviceOwner = await registerDevice(
        { ...establishment, ...owner } as never,
        'owner',
      );
      const deviceColleague = await registerDevice(
        { ...establishment, ...colleague } as never,
        'colleague',
      );
      const patient = await fixtures.patient(
        establishment.workspace.id,
        owner.profile.id,
      );
      // Both doctors have a draft consultation with the patient in their scope.
      await prisma.patientConsultation.create({
        data: {
          patientId: patient.id,
          doctorProfileId: owner.profile.id,
          workspaceId: establishment.workspace.id,
          status: 'DRAFT',
          createdById: owner.user.id,
        },
      });
      await prisma.patientConsultation.create({
        data: {
          patientId: patient.id,
          doctorProfileId: colleague.profile.id,
          workspaceId: establishment.workspace.id,
          status: 'DRAFT',
          createdById: colleague.user.id,
        },
      });

      const draft = await createResult(deviceOwner, patient.id);
      expect(draft.status).toBe('ACK');

      const forbidden = (await sync.push(deviceColleague.actor, {
        operations: [
          prescriptionOperation({
            operationId: randomUUID(),
            localEntityId: randomUUID(),
            patientId: patient.id,
            operation: 'UPDATE',
            baseVersion: 1,
            serverEntityId: draft.serverEntityId,
            items: [draftItem({ dci: 'Ibuprofène', strength: '400 mg' })],
          }),
        ],
      } as never)).results[0] as { status: string; code?: string };
      expect(forbidden.status).toBe('REJECTED');
      expect(forbidden.code).toBe('PRESCRIBER_REQUIRED');
      const row = await prisma.prescription.findUniqueOrThrow({
        where: { id: draft.serverEntityId! },
        select: { syncVersion: true },
      });
      expect(row.syncVersion).toBe(1);

      const colleagueBootstrap = await sync.bootstrap(deviceColleague.actor);
      expect(colleagueBootstrap.prescriptions as { id: string }[]).toHaveLength(
        0,
      );

      // The prescriber himself keeps editing his draft.
      const ownUpdate = await createResult(deviceOwner, patient.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
        operation: 'UPDATE',
        baseVersion: 1,
        serverEntityId: draft.serverEntityId,
        items: [draftItem({ dci: 'Amoxicilline', strength: '1 g' })],
      });
      expect(ownUpdate.status).toBe('ACK');
      expect(ownUpdate.serverVersion).toBe(2);
    });

    it('no prescription of another workspace leaks through pull, bootstrap or push', async () => {
      const doctorA = await fixtures.independentDoctor();
      const deviceA = await registerDevice(doctorA, 'cross-a');
      const doctorB = await fixtures.independentDoctor();
      const deviceB = await registerDevice(doctorB, 'cross-b');
      const patientA = await fixtures.patient(
        doctorA.workspace.id,
        doctorA.profile.id,
      );
      const patientB = await fixtures.patient(
        doctorB.workspace.id,
        doctorB.profile.id,
      );
      await createResult(deviceA, patientA.id);

      const pullB = await sync.pull(deviceB.actor);
      const leaks = (
        pullB.changes as { entityType: string; payload: { patientId: string } }[]
      ).filter(
        (change) =>
          change.entityType === 'PRESCRIPTION' &&
          change.payload?.patientId === patientA.id,
      );
      expect(leaks).toHaveLength(0);

      const bootstrapB = await sync.bootstrap(deviceB.actor);
      const foreign = (bootstrapB.prescriptions as { patientId: string }[]).some(
        (row) => row.patientId === patientA.id,
      );
      expect(foreign).toBe(false);

      const attempt = await createResult(deviceB, patientA.id, {
        operationId: randomUUID(),
        localEntityId: randomUUID(),
      });
      expect(attempt.status).toBe('REJECTED');
      expect(attempt.code).toBe('PATIENT_OUTSIDE_OFFLINE_SCOPE');
    });
  });

  describe('medication catalog for the offline UX', () => {
    it('the endpoint returns the active references with their minimal projection', async () => {
      const doctor = await fixtures.independentDoctor();
      const device = await registerDevice(doctor, 'medications');
      const active = await referenceMedication();
      await referenceMedication({
        dci: 'Retiré du catalogue',
        active: false,
      });

      const view = await sync.medications(device.actor);
      const rows = view.medications as {
        id: string;
        dci: string;
        regulatoryCategory: string;
        updatedAt: string;
      }[];
      expect(
        (rows as { dci: string }[]).some((row) => row.dci === 'Retiré du catalogue'),
      ).toBe(false);
      const found = rows.find((row) => row.id === active.id);
      expect(found?.dci).toBe('Paracétamol');
      expect(found?.regulatoryCategory).toBe('STANDARD');
      expect(typeof found?.updatedAt).toBe('string');
    });
  });
});
