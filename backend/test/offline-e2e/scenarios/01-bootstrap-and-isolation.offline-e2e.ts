import { adapters, markerOf } from '../support/entities';
import { OfflineE2EStack } from '../support/stack';

// Scénario 1 (+ 17 pour le bootstrap) — bootstrap en ligne puis coupure du
// réseau : les données autorisées sont en local, rien d'un autre workspace.
describe('Offline E2E — bootstrap, cache and workspace isolation', () => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  it('bootstraps the authorized scope into the encrypted local database, then works with the network cut', async () => {
    const clinic = await stack.fixtures.clinic('s01');
    const rival = await stack.fixtures.clinic('s01-rival');
    const consultation = await stack.fixtures.cloudConsultation(
      clinic,
      clinic.alpha.id,
      'Toux E2E',
    );
    const prescription = await stack.fixtures.cloudPrescriptionDraft(
      clinic,
      clinic.alpha.id,
    );
    await stack.fixtures.appointment(
      clinic.alpha.id,
      clinic.doctor.profile.id,
      clinic.doctor.user.id,
      new Date(Date.now() + 86_400_000),
    );
    // Data of another workspace, in the same database: it must never arrive.
    await stack.fixtures.cloudConsultation(
      rival,
      rival.alpha.id,
      'Autre cabinet E2E',
    );
    await stack.fixtures.cloudPrescriptionDraft(rival, rival.alpha.id);

    const desktop = await stack.desktop(clinic, 'A');
    // This one lets the engine generate its own device key.
    const session = await desktop.register({ engineKeygen: true });
    expect(session.authorized).toBe(true);
    expect(session.workspace.id).toBe(clinic.workspaceId);

    const local = await desktop.local();
    // SQLCipher is really in use: a cipher version, and no plain SQLite header.
    expect(local.dump.cipherVersion).toMatch(/^\d/);
    expect(desktop.databaseHeader().startsWith('SQLite format 3')).toBe(false);

    // Workspace and scope.
    expect(local.dump.workspace.map((row) => row.id)).toEqual([
      clinic.workspaceId,
    ]);
    expect(local.dump.user.map((row) => row.id)).toEqual([
      clinic.doctor.user.id,
    ]);
    expect(local.dump.patients.map((row) => row.server_id).sort()).toEqual(
      [clinic.alpha.id, clinic.beta.id].sort(),
    );
    expect(
      local.dump.patients.every(
        (row) => row.workspace_id === clinic.workspaceId,
      ),
    ).toBe(true);
    expect(local.dump.patients.every((row) => row.locked === 0)).toBe(true);
    expect(local.dump.patients.map((row) => row.server_id)).not.toContain(
      rival.alpha.id,
    );

    // Read-only caches and the writable drafts.
    expect(local.dump.appointments).toHaveLength(1);
    expect(local.dump.appointments[0].patient_server_id).toBe(clinic.alpha.id);
    expect(local.dump.consultations.map((row) => row.server_id)).toEqual([
      consultation.id,
    ]);
    expect(local.dump.prescriptions.map((row) => row.server_id)).toEqual([
      prescription.id,
    ]);
    expect(local.dump.prescriptions[0].server_status).toBe('DRAFT');
    expect(local.dump.prescriptions[0].number).toBeNull();
    expect(local.dump.prescriptionItems).toHaveLength(1);
    expect(local.medicationCount).toBeGreaterThanOrEqual(1);

    // The cursor is stored and the outbox starts empty.
    expect(local.cursor).not.toBe('');
    expect(local.dump.outbox).toHaveLength(0);
    expect(local.dump.conflicts).toHaveLength(0);

    // Network OFF: the local engine keeps answering, without any request.
    desktop.network.goOffline();
    const before = desktop.network.count();
    const patients = await desktop.expectOk<unknown[]>('patients');
    expect(patients).toHaveLength(2);
    expect((await desktop.status()).ok).toBe(true);
    expect(desktop.network.count()).toBe(before);
  });

  it('refuses a device of workspace A everything of workspace B at the protocol level', async () => {
    const clinicA = await stack.fixtures.clinic('s01-a');
    const clinicB = await stack.fixtures.clinic('s01-b');
    await stack.fixtures.cloudConsultation(
      clinicB,
      clinicB.alpha.id,
      'B seulement',
    );
    await stack.fixtures.cloudPrescriptionDraft(clinicB, clinicB.alpha.id);
    await stack.fixtures.appointment(
      clinicB.alpha.id,
      clinicB.doctor.profile.id,
      clinicB.doctor.user.id,
      new Date(Date.now() + 86_400_000),
    );
    const device = await stack.rawDevice(clinicA, 'iso');

    const bootstrap = await device.bootstrap();
    expect(bootstrap.status).toBe(201);
    const ids = (bootstrap.body.patients as { id: string }[]).map(
      (row) => row.id,
    );
    expect(ids).toContain(clinicA.alpha.id);
    expect(ids).not.toContain(clinicB.alpha.id);
    expect(bootstrap.body.consultations).toHaveLength(0);
    expect(bootstrap.body.prescriptions).toHaveLength(0);
    expect(bootstrap.body.appointments).toHaveLength(0);

    const reconcile = await device.reconcile();
    expect(reconcile.body.authorizedPatientIds).not.toContain(clinicB.alpha.id);

    const pull = await device.pull('');
    expect(pull.status).toBe(200);
    expect(JSON.stringify(pull.body.changes)).not.toContain(clinicB.alpha.id);
  });

  it.each(adapters)(
    'never lets a device of workspace A write into workspace B — $entity',
    async (adapter) => {
      const clinicA = await stack.fixtures.clinic(
        `s17w-${adapter.entity.toLowerCase()}-a`,
      );
      const clinicB = await stack.fixtures.clinic(
        `s17w-${adapter.entity.toLowerCase()}-b`,
      );
      const victim = await adapter.seedCloud(
        stack,
        clinicB,
        clinicB.alpha.id,
        1,
      );
      const device = await stack.rawDevice(clinicA, 'intruder');

      // Create for a patient of B.
      const create = await device.push([
        adapter.operation({
          patientId: clinicB.alpha.id,
          operation: 'CREATE',
          variant: 'B',
        }),
      ]);
      expect(create.body.results[0]).toMatchObject({
        status: 'REJECTED',
        code: 'PATIENT_OUTSIDE_OFFLINE_SCOPE',
      });
      // Update of an entity of B, naming its server id and the right version.
      const update = await device.push([
        adapter.operation({
          patientId: clinicB.alpha.id,
          operation: 'UPDATE',
          variant: 'B',
          baseVersion: 1,
          serverEntityId: victim.id,
        }),
      ]);
      expect(update.body.results[0]).toMatchObject({ status: 'REJECTED' });
      // Update of an entity of B while claiming one of A's patients.
      const disguised = await device.push([
        adapter.operation({
          patientId: clinicA.alpha.id,
          operation: 'UPDATE',
          variant: 'B',
          baseVersion: 1,
          serverEntityId: victim.id,
        }),
      ]);
      expect(disguised.body.results[0]).toMatchObject({ status: 'REJECTED' });

      // B is untouched: same content, same version, nothing created for A.
      const rows = await adapter.cloudRows(stack.probe, clinicB.alpha.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(victim.id);
      expect(rows[0].syncVersion).toBe(1);
      expect(adapter.cloudMarker(rows[0])).toBe(markerOf(adapter, 'A'));
      expect(
        await adapter.cloudRows(stack.probe, clinicA.alpha.id),
      ).toHaveLength(0);
    },
  );
});
