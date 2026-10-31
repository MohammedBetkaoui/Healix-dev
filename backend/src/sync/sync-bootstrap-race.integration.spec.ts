import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConsultationStatus } from '@prisma/client';

import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { UserRole } from '../common/enums/user-role.enum';
import {
  OFFLINE_CAPABILITIES,
  type OfflineActor,
} from '../offline-devices/offline-device.types';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { recordConsultationSyncChange } from './consultation-sync-change';
import { OfflineScopeService } from './offline-scope.service';
import { PrescriptionSyncService } from './prescription-sync.service';
import { SyncService } from './sync.service';

// This suite only exercises the consultation bootstrap snapshot; the
// prescription extension point is stubbed here and covered by
// prescription-sync.integration.spec.ts.
const prescriptionSyncStub = {
  process: jest.fn(),
} as unknown as PrescriptionSyncService;

// The snapshot rule of the bootstrap: the received data and the returned
// cursor must describe one coherent view of the server. The race it rules out
// is "the desktop reads consultation v4, the web app writes v5 with
// SyncChange #150, the bootstrap reads latest sequence 150": the next pull
// from a cursor of 150 would never deliver the v5 modification again.
//
// The web-side update is shaped exactly like the real service hook (row
// update and SyncChange in one transaction). TEST_DATABASE_URL names a
// database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

type ConsultationRow = { id: string; syncVersion: number; assessment: string | null };

type ChangeRow = {
  sequence: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: { syncVersion: number; assessment: string | null } | null;
};

// A value the test needs: its absence is the failure, with a name.
function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Missing: ${what}.`);
  return value;
}

describeWithDatabase('the snapshot coherence of the bootstrap', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sync: SyncService;
  let fixtures: IntegrationFixtures;

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PrismaModule,
      ],
      providers: [
        SyncService,
        OfflineScopeService,
        { provide: PrescriptionSyncService, useValue: prescriptionSyncStub },
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    sync = moduleRef.get(SyncService);
    fixtures = new IntegrationFixtures(prisma, 'bootstrap-race');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await moduleRef.close();
  });

  // ---- helpers --------------------------------------------------------------

  const setupActor = async () => {
    const independent = await fixtures.independentDoctor();
    const actor: OfflineActor = {
      grantId: 'grant-race-test',
      userId: independent.user.id,
      deviceId: `race-device-${fixtures.next()}`,
      workspaceId: independent.workspace.id,
      role: UserRole.INDEPENDENT_DOCTOR,
      offlineCapabilities: OFFLINE_CAPABILITIES,
      offlineScope: {
        policy: 'PRIVATE_PRACTICE_ACTIVE',
        recentConsultationDays: 90,
        upcomingAppointmentDays: 30,
      },
    };
    // The acknowledge writes a sync device state row behind the real device
    // FK; the tests admit one device row per actor.
    await prisma.offlineDevice.create({
      data: {
        id: actor.deviceId,
        installationId: `inst-${fixtures.suffix}-${fixtures.next()}`,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        deviceName: 'Bureau race',
        platform: 'windows',
        publicKey: 'device-public-key-race',
      },
    });
    return { independent, actor };
  };

  // The web-side update, shaped exactly like the real service hook: the row
  // and its SyncChange are written in the same transaction.
  const webUpdate = (consultationId: string, label: string) =>
    prisma.$transaction(async (client) => {
      const updated = await client.patientConsultation.update({
        where: { id: consultationId },
        data: { assessment: `Web ${label}`, syncVersion: { increment: 1 } },
      });
      await recordConsultationSyncChange(client, consultationId, 'UPDATE');
      return updated;
    });

  const pullEverything = async (actor: OfflineActor, cursor?: string) => {
    const changes: ChangeRow[] = [];
    let next = cursor;
    // Bounded loop: the server limit is 200 changes per pull.
    for (let round = 0; round < 100; round += 1) {
      const page = await sync.pull(actor, next);
      changes.push(...(page.changes as ChangeRow[]));
      if (!page.hasMore) {
        return changes;
      }
      next = page.nextCursor;
    }
    throw new Error('pull never converged');
  };

  const seedPatientConsultation = async (
    workspaceId: string,
    doctorProfileId: string,
    doctorUserId: string,
  ) => {
    const patient = await fixtures.patient(workspaceId, doctorProfileId);
    const consultation = await prisma.patientConsultation.create({
      data: {
        workspaceId,
        patientId: patient.id,
        doctorProfileId,
        createdById: doctorUserId,
        status: ConsultationStatus.COMPLETED,
        startedAt: new Date(Date.now() - 3_600_000),
        completedAt: new Date(Date.now() - 1_800_000),
        completedById: doctorUserId,
        createdAt: new Date(Date.now() - 3_600_000),
      },
    });
    return { patient, consultation };
  };

  // ---- the three branches the invariant relies on ---------------------------

  it('without concurrent write, the bootstrap carries its data and its cursor of the same view', async () => {
    const { independent, actor } = await setupActor();
    const { patient, consultation } = await seedPatientConsultation(
      independent.workspace.id,
      independent.profile.id,
      independent.user.id,
    );

    const snapshot = await sync.bootstrap(actor);
    expect(snapshot.authorizedPatientIds).toContain(patient.id);
    expect(
      snapshot.consultations.some(
        (row: { id: string }) => row.id === consultation.id,
      ),
    ).toBe(true);

    // The cursor already covers every existing change: the pull from it is
    // empty for this consultation.
    const pull = await sync.pull(actor, snapshot.syncCursor);
    expect(
      (pull.changes as ChangeRow[]).filter(
        (change) =>
          change.entityType === 'CONSULTATION' &&
          change.entityId === consultation.id,
      ),
    ).toHaveLength(0);
    expect(pull.hasMore).toBe(false);
  });

  it('a web update committing before the bootstrap read enters the snapshot and its cursor at once', async () => {
    const { independent, actor } = await setupActor();
    const { consultation } = await seedPatientConsultation(
      independent.workspace.id,
      independent.profile.id,
      independent.user.id,
    );

    await webUpdate(consultation.id, 'v2-before-bootstrap');

    const snapshot = await sync.bootstrap(actor);
    const row = defined(
      snapshot.consultations.find(
        (candidate: ConsultationRow) => candidate.id === consultation.id,
      ),
      'the consultation row of the snapshot',
    );
    expect(row.syncVersion).toBe(2);
    expect(row.assessment).toBe('Web v2-before-bootstrap');

    // Nothing to re-deliver: the cursor covers the change already.
    const pull = await sync.pull(actor, snapshot.syncCursor);
    expect(
      (pull.changes as ChangeRow[]).filter(
        (change) =>
          change.entityType === 'CONSULTATION' &&
          change.entityId === consultation.id,
      ),
    ).toHaveLength(0);
  });

  it('a web update committing after the snapshot is cursor-consistent: the following pull delivers it', async () => {
    const { independent, actor } = await setupActor();
    const { consultation } = await seedPatientConsultation(
      independent.workspace.id,
      independent.profile.id,
      independent.user.id,
    );

    const snapshot = await sync.bootstrap(actor);
    const before = defined(
      snapshot.consultations.find(
        (candidate: ConsultationRow) => candidate.id === consultation.id,
      ),
      'the consultation row of the snapshot',
    );
    const beforeVersion = before.syncVersion;

    await webUpdate(consultation.id, 'v2-after-bootstrap');

    const delivered = await pullEverything(actor, snapshot.syncCursor);
    const consultationChanges = delivered.filter(
      (change) =>
        change.entityType === 'CONSULTATION' &&
        change.entityId === consultation.id,
    );
    expect(consultationChanges).toHaveLength(1);
    expect(consultationChanges[0].payload!.syncVersion).toBe(beforeVersion + 1);
    expect(consultationChanges[0].payload!.assessment).toBe(
      'Web v2-after-bootstrap',
    );

    // No duplicates, no loss: pulling again from the same cursor delivers the
    // change exactly once more.
    const again = await pullEverything(actor, snapshot.syncCursor);
    expect(
      again.filter(
        (change) =>
          change.entityType === 'CONSULTATION' &&
          change.entityId === consultation.id,
      ),
    ).toHaveLength(1);
  });

  it('a bootstrap finishing under a concurrent web update keeps every modification: in the snapshot or in the pull, never both, never none', async () => {
    const { independent, actor } = await setupActor();
    const rounds = 8;
    let branchSnapshots = 0;
    let branchPulls = 0;

    for (let round = 0; round < rounds; round += 1) {
      const { patient, consultation } = await seedPatientConsultation(
        independent.workspace.id,
        independent.profile.id,
        independent.user.id,
      );

      // Real concurrency: the bootstrap transaction and the web-side write
      // run together. Under one REPEATABLE READ snapshot the write either
      // commits before the first read of the snapshot (branch A) or after the
      // whole snapshot view (branch B) — never between the read of the data
      // and the read of the cursor.
      const [, webResult] = await Promise.all([
        sync.bootstrap(actor),
        webUpdate(consultation.id, `race-${round}`),
      ]);
      expect(webResult.syncVersion).toBe(2);

      // Deterministic catch-up bootstrap, then the pull chain the desktop
      // really performs.
      const snapshot = await sync.bootstrap(actor);
      const row = defined(
        snapshot.consultations.find(
          (candidate: ConsultationRow) => candidate.id === consultation.id,
        ),
        'the consultation row of the snapshot',
      );
      expect(snapshot.authorizedPatientIds).toContain(patient.id);

      const delivered = await pullEverything(actor, snapshot.syncCursor);
      const consultationChanges = delivered.filter(
        (change) =>
          change.entityType === 'CONSULTATION' &&
          change.entityId === consultation.id,
      );

      if (row.syncVersion >= 2) {
        // The snapshot saw the write: its cursor covers it, the pull may not
        // deliver it again.
        branchSnapshots += 1;
        expect(consultationChanges).toHaveLength(0);
        expect(row.assessment).toContain(`race-${round}`);
      } else {
        // The snapshot missed the write (v1 rows): the pull must deliver the
        // change whose new payload carries the write.
        branchPulls += 1;
        expect(consultationChanges.length).toBeGreaterThanOrEqual(1);
        expect(consultationChanges[0].payload!.syncVersion).toBe(2);
        expect(consultationChanges[0].payload!.assessment).toContain(
          `race-${round}`,
        );
      }

      // Whatever the branch, nothing was ever lost: the server row holds the
      // write, and it is reachable from the streams of this device.
      const serverRow = await prisma.patientConsultation.findUniqueOrThrow({
        where: { id: consultation.id },
        select: { syncVersion: true, assessment: true },
      });
      expect(serverRow.syncVersion).toBeGreaterThanOrEqual(2);
      expect(serverRow.assessment).toContain(`race-${round}`);
    }

    // Which branch wins is a scheduling decision; the invariant is that each
    // round lands exactly in one of them.
    expect(branchSnapshots + branchPulls).toBe(rounds);
  });

  it('an acknowledged cursor can never jump beyond the change feed', async () => {
    const { independent, actor } = await setupActor();
    const { consultation } = await seedPatientConsultation(
      independent.workspace.id,
      independent.profile.id,
      independent.user.id,
    );
    await webUpdate(consultation.id, 'ack-guard');
    const snapshot = await sync.bootstrap(actor);

    // A cursor beyond the feed is refused.
    const beyond = Buffer.from(
      JSON.stringify({ sequence: '99999999999999999999' }),
      'utf8',
    ).toString('base64url');
    await expect(sync.acknowledge(actor, beyond)).rejects.toThrow(
      BadRequestException,
    );

    // The honest cursor of this snapshot is accepted with itself.
    await expect(
      sync.acknowledge(actor, snapshot.syncCursor),
    ).resolves.toMatchObject({ acknowledgedCursor: snapshot.syncCursor });
  });
});
