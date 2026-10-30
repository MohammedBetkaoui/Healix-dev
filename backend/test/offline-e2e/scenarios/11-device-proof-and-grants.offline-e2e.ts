import { adapters } from '../support/entities';
import { type Tamper, revokeDevice } from '../support/raw-device';
import { OfflineE2EStack } from '../support/stack';

// Scénarios 20, 21 et 22 — la preuve de possession (Device PoP), l'anti-rejeu,
// la révocation d'appareil et l'expiration du grant sont appliqués par le vrai
// backend sur les vraies routes /sync/*, sans qu'aucune opération clinique ne
// s'exécute quand la requête est refusée.
describe('Offline E2E — device proof-of-possession, grants and revocation', () => {
  let stack: OfflineE2EStack;

  beforeAll(async () => {
    stack = await OfflineE2EStack.start();
  });
  afterAll(async () => {
    await stack.stop();
  });

  const tampers: Tamper[] = [
    'badSignature',
    'wrongBodyHash',
    'wrongDeviceId',
    'staleTimestamp',
    'badNonce',
    'missingSignature',
    'noGrant',
  ];

  it.each(tampers)(
    'invalid proof (%s): 401 on /sync/push, no operation executed; the honest request is accepted',
    async (tamper) => {
      const clinic = await stack.fixtures.clinic(`s22-${tamper.toLowerCase()}`);
      const device = await stack.rawDevice(clinic, tamper);
      const operation = adapters[0].operation({
        patientId: clinic.alpha.id,
        operation: 'CREATE',
        variant: 'A',
      });

      const refused = await device.push([operation], { tamper });
      expect(refused.status).toBe(401);
      expect(await stack.probe.operations(device.deviceId)).toHaveLength(0);
      expect(await stack.probe.consultations(clinic.alpha.id)).toHaveLength(0);

      const honest = await device.push([operation]);
      expect(honest.status).toBe(201);
      expect(honest.body.results[0]).toMatchObject({ status: 'ACK' });
      expect(await stack.probe.consultations(clinic.alpha.id)).toHaveLength(1);
    },
  );

  it('a timestamp too far in the future is refused too', async () => {
    const clinic = await stack.fixtures.clinic('s22-future');
    const device = await stack.rawDevice(clinic, 'future');
    const refused = await device.reconcile({
      timestamp: Math.floor(Date.now() / 1000) + 3_600,
    });
    expect(refused.status).toBe(401);
  });

  it('reused nonce: the replay of an accepted request is refused and never processed twice', async () => {
    const clinic = await stack.fixtures.clinic('s22-replay');
    const device = await stack.rawDevice(clinic, 'replay');
    const operation = adapters[0].operation({
      patientId: clinic.alpha.id,
      operation: 'CREATE',
      variant: 'A',
    });

    const accepted = await device.push([operation]);
    expect(accepted.status).toBe(201);
    const replay = await device.push([operation], { nonce: accepted.nonce });
    expect(replay.status).toBe(401);
    expect(JSON.stringify(replay.body)).toContain('rejoué');
    expect(await stack.probe.consultations(clinic.alpha.id)).toHaveLength(1);
    expect(await stack.probe.operations(device.deviceId)).toHaveLength(1);

    const pulled = await device.pull('');
    expect(pulled.status).toBe(200);
    expect((await device.pull('', { nonce: pulled.nonce })).status).toBe(401);
  });

  it('revoked device: reconcile, push, pull and ack are refused; the Desktop keeps its data and loses its session', async () => {
    const clinic = await stack.fixtures.clinic('s20');
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();
    const saved = await adapters[0].save(desktop, clinic.alpha.id, 'A');
    const { localId, operationId } = saved.result!;
    const deviceId = (await desktop.local()).deviceId;
    const web = await stack.webSession(clinic);
    expect((await revokeDevice(web, deviceId)).status).toBeLessThan(300);

    const refused = await desktop.sync();
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/révoqu/i);

    // Local data is intact, nothing reached the Cloud.
    const local = await desktop.local();
    expect(local.consultation(localId)).toBeDefined();
    expect(local.outbox(operationId)).toMatchObject({ status: 'PENDING' });
    expect(await stack.probe.consultations(clinic.alpha.id)).toHaveLength(0);
    // The engine is in its locked state: no session, no local write.
    const locked = await desktop.status();
    expect(locked.ok).toBe(false);
    expect(locked.error).toMatch(/Session offline/i);
    expect(
      (await adapters[0].save(desktop, clinic.alpha.id, 'B', localId)).ok,
    ).toBe(false);
    expect(adapters[0].localMarker(await desktop.local(), localId)).toBe(
      'Motif E2E A',
    );

    // Re-registering never resurrects a revoked device.
    const again = await desktop.run('register', {
      api: desktop.api,
      input: JSON.stringify({
        accountType: 'INDEPENDENT_DOCTOR',
        email: clinic.credentials.email,
        password: clinic.credentials.password,
        deviceName: 'Poste E2E A',
      }),
    });
    expect(again.ok).toBe(false);

    // The same four routes, at the protocol level, on another revoked device.
    const raw = await stack.rawDevice(clinic, 'to-revoke');
    expect((await revokeDevice(web, raw.deviceId)).status).toBeLessThan(300);
    const operation = adapters[0].operation({
      patientId: clinic.alpha.id,
      operation: 'CREATE',
      variant: 'A',
    });
    for (const call of [
      () => raw.reconcile(),
      () => raw.push([operation]),
      () => raw.pull(''),
      () => raw.ack(''),
    ]) {
      expect((await call()).status).toBe(401);
    }
    expect(await stack.probe.operations(raw.deviceId)).toHaveLength(0);
  });

  it('expired offline grant: refused by the server, no silent refresh, local data kept', async () => {
    const clinic = await stack.fixtures.clinic('s21');
    const desktop = await stack.desktop(clinic, 'A');
    await desktop.register();
    const { localId, operationId } = (
      await adapters[1].save(desktop, clinic.alpha.id, 'A')
    ).result!;
    const deviceId = (await desktop.local()).deviceId;
    await stack.prisma.offlineAccessGrant.updateMany({
      where: { deviceId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const before = desktop.network.count();
    const refused = await desktop.sync();
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/révoquée ou expirée/i);
    // Nothing but the refused sync call: no login, no grant renewal.
    const since = desktop.network.requests().slice(before);
    expect(since.every((entry) => entry.path.startsWith('/api/sync/'))).toBe(
      true,
    );
    expect(
      since.some(
        (entry) =>
          entry.path.includes('/auth') || entry.path.includes('/devices'),
      ),
    ).toBe(false);

    const local = await desktop.local();
    expect(local.prescription(localId)).toBeDefined();
    expect(local.outbox(operationId)).toMatchObject({ status: 'PENDING' });
    expect(await stack.probe.prescriptions(clinic.alpha.id)).toHaveLength(0);
    expect((await desktop.status()).ok).toBe(false);

    const raw = await stack.rawDevice(clinic, 'grant');
    await stack.prisma.offlineAccessGrant.updateMany({
      where: { deviceId: raw.deviceId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect((await raw.reconcile()).status).toBe(401);
    expect((await raw.pull('')).status).toBe(401);
  });
});
