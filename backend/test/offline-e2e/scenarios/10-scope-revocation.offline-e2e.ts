import { adapters, markerOf } from '../support/entities';
import { OfflineE2EStack } from '../support/stack';

const SCOPE_LOCK = 'SCOPE_REVOKED_WITH_PENDING_DATA';

// Scénarios 18 et 19 — le Cloud retire un patient du scope (ici : patient
// administrativement inactif). Sans donnée locale non envoyée : purge. Avec :
// verrouillage, jamais de purge silencieuse, données préservées.
describe.each(adapters)(
  'Offline E2E — scope revocation — $entity',
  (adapter) => {
    let stack: OfflineE2EStack;

    beforeAll(async () => {
      stack = await OfflineE2EStack.start();
    });
    afterAll(async () => {
      await stack.stop();
    });

    const revoke = (patientId: string) =>
      stack.prisma.patient.update({
        where: { id: patientId },
        data: { administrativeStatus: 'INACTIVE' },
      });
    const restore = (patientId: string) =>
      stack.prisma.patient.update({
        where: { id: patientId },
        data: { administrativeStatus: 'ACTIVE' },
      });

    it('clean patient: purged locally with the data that hangs on it; the other patient stays', async () => {
      const clinic = await stack.fixtures.clinic(
        `s18-${adapter.entity.toLowerCase()}`,
      );
      await adapter.seedCloud(stack, clinic, clinic.alpha.id, 1);
      await adapter.seedCloud(stack, clinic, clinic.beta.id, 1);
      await stack.fixtures.appointment(
        clinic.alpha.id,
        clinic.doctor.profile.id,
        clinic.doctor.user.id,
        new Date(Date.now() + 86_400_000),
      );
      const desktop = await stack.desktop(clinic, 'A');
      await desktop.register();
      let local = await desktop.local();
      expect(local.dump.patients).toHaveLength(2);
      expect(local.dump.appointments).toHaveLength(1);

      await revoke(clinic.alpha.id);
      expect(await desktop.sync()).toMatchObject({ ok: true });

      local = await desktop.local();
      expect(local.dump.patients.map((row) => row.server_id)).toEqual([
        clinic.beta.id,
      ]);
      expect(local.dump.appointments).toHaveLength(0);
      const rows =
        adapter.entity === 'CONSULTATION'
          ? local.dump.consultations
          : local.dump.prescriptions;
      expect(rows.map((row) => row.patient_server_id)).toEqual([
        clinic.beta.id,
      ]);
      expect((await desktop.status()).result).toMatchObject({
        state: 'ONLINE',
        lockedCount: 0,
      });
    });

    it('dirty patient: locked, nothing is destroyed or written, across several syncs; unlocked when re-authorized', async () => {
      const clinic = await stack.fixtures.clinic(
        `s19-${adapter.entity.toLowerCase()}`,
      );
      const patientId = clinic.alpha.id;
      const desktop = await stack.desktop(clinic, 'A');
      await desktop.register();

      // Offline work on the patient, not synchronized.
      desktop.network.goOffline();
      const saved = await adapter.save(desktop, patientId, 'A');
      const { localId, operationId } = saved.result!;
      desktop.network.restoreNetwork();

      await revoke(patientId);
      expect((await desktop.sync()).ok).toBe(true);

      // Locked, explicit state, data preserved.
      let local = await desktop.local();
      expect(local.patient(patientId)).toMatchObject({
        locked: 1,
        lock_reason: SCOPE_LOCK,
      });
      expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'A'));
      expect((await desktop.status()).result).toMatchObject({
        state: 'SCOPE_REVOKED',
        lockedCount: 1,
      });
      // The Cloud took nothing from outside the scope.
      expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(0);
      const durable = await stack.probe.operation(operationId);
      expect(durable).toMatchObject({ status: 'REJECTED' });
      expect(durable!.result).toMatchObject({
        code: 'PATIENT_OUTSIDE_OFFLINE_SCOPE',
      });

      // No further modification is allowed on a locked folder.
      const refused = await adapter.save(desktop, patientId, 'B', localId);
      expect(refused.ok).toBe(false);
      local = await desktop.local();
      expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'A'));

      // Later sessions must not purge what never reached the Cloud.
      expect((await desktop.sync()).ok).toBe(true);
      expect((await desktop.sync()).ok).toBe(true);
      local = await desktop.local();
      expect(local.patient(patientId)).toMatchObject({ locked: 1 });
      expect(adapter.localRow(local, localId)).toBeDefined();
      expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'A'));
      expect(local.outbox(operationId)).toBeDefined();
      expect(await adapter.cloudRows(stack.probe, patientId)).toHaveLength(0);

      // Scope restored: the folder opens again, the work is still there.
      await restore(patientId);
      expect((await desktop.sync()).ok).toBe(true);
      local = await desktop.local();
      expect(local.patient(patientId)).toMatchObject({ locked: 0 });
      expect(adapter.localMarker(local, localId)).toBe(markerOf(adapter, 'A'));
    });
  },
);
