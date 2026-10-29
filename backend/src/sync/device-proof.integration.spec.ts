import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

import {
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEVICE_ID_HEADER,
  DEVICE_NONCE_HEADER,
  DEVICE_SIGNATURE_HEADER,
  DEVICE_TIMESTAMP_HEADER,
  DEVICE_TIMESTAMP_WINDOW_SECONDS,
  buildDeviceCanonicalString,
  sha256Hex,
} from '../offline-devices/device-proof';
import { DeviceProofGuard } from '../offline-devices/device-proof.guard';
import { UserRole } from '../common/enums/user-role.enum';

// The device proof-of-possession of the sync API, with the real crypto: the
// request that the desktop signs with its registered RSA private key must be
// accepted, and every failure mode the spec calls for (another key, tampered
// body, replayed nonce, stale timestamp, mismatched device id, missing
// headers, revoked device) must be refused.
// TEST_DATABASE_URL names a database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

const generateKeypair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

// The desktop signs: RSA-PSS/SHA-256 with a salt of the digest length
// (see docs/offline-first-v1.md and desktop/src-tauri/src/protocol.rs).
const signCanonical = (privateKeyPem: string, canonical: string) =>
  sign('sha256', Buffer.from(canonical, 'utf8'), {
    key: createPrivateKey(privateKeyPem),
    padding: 6,
    saltLength: 32,
  }).toString('base64');

const nowSeconds = () => Math.floor(Date.now() / 1000);

describeWithDatabase('the device proof-of-possession guard', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let guard: DeviceProofGuard;
  let fixtures: IntegrationFixtures;

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PrismaModule,
      ],
      providers: [DeviceProofGuard],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    guard = moduleRef.get(DeviceProofGuard);
    fixtures = new IntegrationFixtures(prisma, 'device-proof');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await moduleRef.close();
  });

  // ---- helpers --------------------------------------------------------------

  const requestPath = '/api/sync/push';
  const requestBody = Buffer.from(
    JSON.stringify({ operations: [{ patientId: 'anything' }] }),
  );

  // The device the tests authenticate: a real keypair, its public half in the
  // offline device row, exactly as the desktop stores it at registration.
  type ProofActor = {
    grantId: string;
    userId: string;
    deviceId: string;
    workspaceId: string;
    role: string;
  };

  // The device the tests authenticate: a real keypair, its public half in the
  // offline device row, exactly as the desktop stores it at registration.
  const seedDeviceWithKeys = async (
    context: { user: { id: string }; workspace: { id: string } },
    options: {
      revoked?: boolean;
      publicKeyOverride?: string;
    } = {},
  ) => {
    const keys = generateKeypair();
    const device = await prisma.offlineDevice.create({
      data: {
        installationId: `inst-${fixtures.suffix}-${fixtures.next()}`,
        userId: context.user.id,
        workspaceId: context.workspace.id,
        deviceName: 'Bureau integration',
        platform: 'windows',
        publicKey: options.publicKeyOverride ?? keys.publicKey,
        revokedAt: options.revoked ? new Date() : null,
      },
    });
    return { keys, device };
  };

  const buildHeaders = (input: {
    keys: { privateKey: string; publicKey: string };
    deviceId: string;
    body: Buffer;
    overrides?: {
      timestamp?: number;
      nonce?: string;
      deviceId?: string;
      bodyHash?: string;
    };
  }) => {
    const timestamp = input.overrides?.timestamp ?? nowSeconds();
    const nonce = input.overrides?.nonce ?? `nonce-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const deviceId = input.overrides?.deviceId ?? input.deviceId;
    const bodyHash =
      input.overrides?.bodyHash ?? createHash('sha256').update(input.body).digest('hex');
    const canonical = buildDeviceCanonicalString({
      method: 'POST',
      path: requestPath,
      timestamp,
      nonce,
      bodySha256: bodyHash,
      deviceId,
    });
    return {
      [DEVICE_ID_HEADER]: deviceId,
      [DEVICE_TIMESTAMP_HEADER]: String(timestamp),
      [DEVICE_NONCE_HEADER]: nonce,
      [DEVICE_SIGNATURE_HEADER]: signCanonical(input.keys.privateKey, canonical),
    };
  };

  const runGuard = (request: Record<string, unknown>) =>
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);

  const buildRequest = (
    headers: Record<string, string>,
    actorValue: ProofActor,
    body: Buffer = requestBody,
  ) => ({
    method: 'POST',
    originalUrl: requestPath,
    rawBody: body,
    headers,
    offlineActor: {
      ...actorValue,
      role: UserRole.INDEPENDENT_DOCTOR,
      offlineCapabilities: {},
      offlineScope: {},
    },
  });

  describe('an authorized device', () => {
    it('accepts a signed request of the registered key and records its nonce durably', async () => {
      const doctor = await fixtures.independentDoctor();
      const { keys, device } = await seedDeviceWithKeys(doctor);
      const headers = buildHeaders({ keys, deviceId: device.id, body: requestBody });
      const request = buildRequest(headers, {
        grantId: 'grant',
        userId: doctor.user.id,
        deviceId: device.id,
        workspaceId: doctor.workspace.id,
        role: UserRole.INDEPENDENT_DOCTOR,
      });

      await expect(runGuard(request)).resolves.toBe(true);
      // The nonce is durable (its row survives a restart), one row per
      // accepted request for this device.
      const rows = await prisma.deviceRequestNonce.findMany({
        where: { deviceId: device.id },
        select: { nonce: true, deviceId: true, expiresAt: true },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].nonce).toBe(headers[DEVICE_NONCE_HEADER]);
      expect(rows[0].deviceId).toBe(device.id);
      expect(rows[0].expiresAt.getTime()).toBeGreaterThan(
        nowSeconds() * 1000 + DEVICE_TIMESTAMP_WINDOW_SECONDS * 1000 - 60_000,
      );
    });

    it('rejects a signature made with another private key', async () => {
      const doctor = await fixtures.independentDoctor();
      const { device } = await seedDeviceWithKeys(doctor);
      // A different key: the public half stored on the device does not verify
      // the signature we present.
      const forged = generateKeypair();
      const headers = buildHeaders({
        keys: forged as unknown as { privateKey: string; publicKey: string },
        deviceId: device.id,
        body: requestBody,
      });
      const request = buildRequest(headers, {
        grantId: 'grant',
        userId: doctor.user.id,
        deviceId: device.id,
        workspaceId: doctor.workspace.id,
        role: UserRole.INDEPENDENT_DOCTOR,
      });
      await expect(runGuard(request)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a tampered body: the signed SHA-256 no longer matches', async () => {
      const doctor = await fixtures.independentDoctor();
      const { keys, device } = await seedDeviceWithKeys(doctor);
      const realBodyHash = sha256Hex(requestBody);
      // Sign over the real body, then send a different raw body: the
      // canonical the server rebuilds does not match anymore.
      const headers = buildHeaders({
        keys,
        deviceId: device.id,
        body: requestBody,
      });
      const tamperedBody = Buffer.from(JSON.stringify({ tampered: true }));
      const request = buildRequest(
        { ...headers, [DEVICE_SIGNATURE_HEADER]: signCanonical(
            keys.privateKey,
            buildDeviceCanonicalString({
              method: 'POST',
              path: requestPath,
              timestamp: nowSeconds(),
              nonce: headers[DEVICE_NONCE_HEADER],
              bodySha256: realBodyHash,
              deviceId: device.id,
            }),
          ) },
        {
          grantId: 'grant',
          userId: doctor.user.id,
          deviceId: device.id,
          workspaceId: doctor.workspace.id,
          role: UserRole.INDEPENDENT_DOCTOR,
        },
        tamperedBody,
      );
      await expect(runGuard(request)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a replayed nonce with a fresh timestamp', async () => {
      const doctor = await fixtures.independentDoctor();
      const { keys, device } = await seedDeviceWithKeys(doctor);
      const nonce = 'replay-nonce-0123456789abcdef';
      const signHeaderSet = (bodyHash: string, timestamp: number) => {
        const canonical = buildDeviceCanonicalString({
          method: 'POST',
          path: requestPath,
          timestamp,
          nonce,
          bodySha256: bodyHash,
          deviceId: device.id,
        });
        return {
          [DEVICE_ID_HEADER]: device.id,
          [DEVICE_TIMESTAMP_HEADER]: String(timestamp),
          [DEVICE_NONCE_HEADER]: nonce,
          [DEVICE_SIGNATURE_HEADER]: signCanonical(keys.privateKey, canonical),
        };
      };
      const first = buildRequest(signHeaderSet(sha256Hex(requestBody), nowSeconds()), {
        grantId: 'grant',
        userId: doctor.user.id,
        deviceId: device.id,
        workspaceId: doctor.workspace.id,
        role: UserRole.INDEPENDENT_DOCTOR,
      });
      await expect(runGuard(first)).resolves.toBe(true);

      // Same nonce, new timestamp, new signature: still the same nonce —
      // replay refused while the nonce row is alive.
      const second = buildRequest(
        signHeaderSet(sha256Hex(requestBody), nowSeconds()),
        {
          grantId: 'grant',
          userId: doctor.user.id,
          deviceId: device.id,
          workspaceId: doctor.workspace.id,
          role: UserRole.INDEPENDENT_DOCTOR,
        },
      );
      await expect(runGuard(second)).rejects.toThrow(
        /nonce déjà utilisé|Requête rejouée/i,
      );
    });

    it('rejects a stale timestamp outside the accepted window', async () => {
      const doctor = await fixtures.independentDoctor();
      const { keys, device } = await seedDeviceWithKeys(doctor);
      const headers = buildHeaders({
        keys,
        deviceId: device.id,
        body: requestBody,
        overrides: {
          timestamp: nowSeconds() - DEVICE_TIMESTAMP_WINDOW_SECONDS - 30,
        },
      });
      const request = buildRequest(headers, {
        grantId: 'grant',
        userId: doctor.user.id,
        deviceId: device.id,
        workspaceId: doctor.workspace.id,
        role: UserRole.INDEPENDENT_DOCTOR,
      });
      await expect(runGuard(request)).rejects.toThrow(
        /Horodatage device hors fenêtre/,
      );
    });

    it('rejects a device id header different from the grant device', async () => {
      const doctor = await fixtures.independentDoctor();
      const { keys, device } = await seedDeviceWithKeys(doctor);
      const headers = buildHeaders({
        keys,
        deviceId: device.id,
        body: requestBody,
        overrides: { deviceId: 'device-other-mismatched-id' },
      });
      const request = buildRequest(headers, {
        grantId: 'grant',
        userId: doctor.user.id,
        deviceId: device.id,
        workspaceId: doctor.workspace.id,
        role: UserRole.INDEPENDENT_DOCTOR,
      });
      await expect(runGuard(request)).rejects.toThrow(
        /ne correspond pas au device/,
      );
    });

    it('rejects missing proof headers', async () => {
      const doctor = await fixtures.independentDoctor();
      const { device } = await seedDeviceWithKeys(doctor);
      const request = buildRequest(
        {
          [DEVICE_ID_HEADER]: device.id,
          [DEVICE_NONCE_HEADER]: 'nonce-abcdef0123456789',
        },
        {
          grantId: 'grant',
          userId: doctor.user.id,
          deviceId: device.id,
          workspaceId: doctor.workspace.id,
          role: UserRole.INDEPENDENT_DOCTOR,
        },
      );
      await expect(runGuard(request)).rejects.toThrow(/en-têtes/i);
    });

    it('rejects a revoked device even with a perfect signature', async () => {
      const doctor = await fixtures.independentDoctor();
      const { keys, device } = await seedDeviceWithKeys(doctor, {
        revoked: true,
      });
      const headers = buildHeaders({ keys, deviceId: device.id, body: requestBody });
      const request = buildRequest(headers, {
        grantId: 'grant',
        userId: doctor.user.id,
        deviceId: device.id,
        workspaceId: doctor.workspace.id,
        role: UserRole.INDEPENDENT_DOCTOR,
      });
      await expect(runGuard(request)).rejects.toThrow(/révoqué/);
    });
  });
});
