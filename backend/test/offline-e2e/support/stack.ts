import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../src/prisma/prisma.service';
import { BackendProcess } from './backend-process';
import { readDatabaseUrl } from './config';
import { DesktopDevice } from './desktop-device';
import { HttpFaultProxy } from './fault-proxy';
import { OfflineE2EFixtures } from './fixtures';
import { NetworkFaultController } from './network-fault-controller';
import { RawDevice, webLogin, type WebSession } from './raw-device';
import { ServerProbe } from './server-probe';

type Clinic = Awaited<ReturnType<OfflineE2EFixtures['clinic']>>;

// Everything a scenario file needs, with one cleanup that runs even when a
// test failed: backend process, per-device fault proxies, Desktop profiles
// (SQLCipher databases and their secrets), MySQL rows.

export class OfflineE2EStack {
  private readonly proxies: HttpFaultProxy[] = [];
  private readonly desktops: DesktopDevice[] = [];
  private proxyCounter = 0;

  private constructor(
    readonly backend: BackendProcess,
    readonly prisma: PrismaService,
    readonly fixtures: OfflineE2EFixtures,
    readonly probe: ServerProbe,
  ) {}

  static async start(options: { backendEnv?: Record<string, string> } = {}) {
    const databaseUrl = readDatabaseUrl();
    const prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: databaseUrl }),
    );
    const backend = new BackendProcess({
      databaseUrl,
      env: options.backendEnv,
    });
    const stack = new OfflineE2EStack(
      backend,
      prisma,
      new OfflineE2EFixtures(prisma),
      new ServerProbe(prisma),
    );
    try {
      await stack.fixtures.ensureMedication();
      await backend.start();
    } catch (error) {
      await stack.stop();
      throw error;
    }
    return stack;
  }

  // A fresh network path to the Backend: one fault proxy, one controller.
  // Each Desktop gets its own, so a scenario can cut one machine's network and
  // leave another's alone.
  async network(): Promise<NetworkFaultController> {
    this.proxyCounter += 1;
    const proxy = new HttpFaultProxy(
      { host: '127.0.0.1', port: () => this.backend.port },
      `10.77.0.${this.proxyCounter}`,
    );
    await proxy.start();
    this.proxies.push(proxy);
    return new NetworkFaultController(proxy);
  }

  // A Desktop (profile + its own network path); not yet registered.
  async desktop(clinic: Clinic, label: string): Promise<DesktopDevice> {
    const device = new DesktopDevice(
      label,
      await this.network(),
      clinic.credentials,
    );
    this.desktops.push(device);
    return device;
  }

  webSession(clinic: Clinic): Promise<WebSession> {
    return webLogin(this.backend.baseUrl(), clinic.credentials);
  }

  // A protocol-level device registered through the real API, talking straight
  // to the Backend (or through `network` when given).
  async rawDevice(
    clinic: Clinic,
    label: string,
    network?: NetworkFaultController,
  ): Promise<RawDevice> {
    const session = await this.webSession(clinic);
    return RawDevice.register(
      session,
      label,
      network?.baseUrl() ?? this.backend.baseUrl(),
    );
  }

  async stop(): Promise<void> {
    const errors: unknown[] = [];
    const attempt = async (step: () => unknown) => {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    };
    for (const desktop of this.desktops) await attempt(() => desktop.dispose());
    for (const proxy of this.proxies) await attempt(() => proxy.stop());
    await attempt(() => this.backend.stop());
    await attempt(() => this.fixtures.cleanup());
    await attempt(() => this.prisma.$disconnect());
    if (errors.length > 0) {
      throw new Error(
        `offline-e2e cleanup failed: ${errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')}`,
      );
    }
  }
}

// Server-side counterpart of an offline gesture, done the way the web app
// does it: straight on the database through the same Prisma client.
export { type Clinic };
