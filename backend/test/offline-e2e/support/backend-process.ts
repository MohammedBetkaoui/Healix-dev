import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { backendEntry, BACKEND_DIR } from './config';
import { pollUntil } from './wait';

// The real NestJS backend, as a child process: it can be killed without
// warning (a crash) or restarted, which a Nest testing module in the test
// process could not do honestly.

export type BackendOptions = {
  databaseUrl: string;
  // Extra environment, e.g. OFFLINE_GRANT_LIFETIME_HOURS.
  env?: Record<string, string>;
};

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });

// A process killed by a signal has exitCode === null and a signalCode: both
// must be empty for the process to be alive.
const isAlive = (child: ChildProcess | null): boolean =>
  child !== null && child.exitCode === null && child.signalCode === null;

export class BackendProcess {
  private child: ChildProcess | null = null;
  private readonly workDir = mkdtempSync(join(tmpdir(), 'healix-e2e-backend-'));
  private readonly logPath = join(this.workDir, 'backend.log');
  // Fixed for the life of the stack so a restarted backend still accepts the
  // grants it issued before the restart.
  private readonly grantKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  private readonly secrets = {
    access: randomBytes(24).toString('hex'),
    refresh: randomBytes(24).toString('hex'),
    adminAccess: randomBytes(24).toString('hex'),
    adminRefresh: randomBytes(24).toString('hex'),
    storage: randomBytes(32).toString('base64'),
    messaging: `e2e:${randomBytes(32).toString('base64')}`,
  };
  port = 0;

  constructor(private readonly options: BackendOptions) {}

  baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  get running() {
    return isAlive(this.child);
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.port) this.port = await freePort();
    const log = createWriteStream(this.logPath, { flags: 'a' });
    const child = spawn(process.execPath, [backendEntry()], {
      cwd: BACKEND_DIR,
      env: { ...process.env, ...this.environment() },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    this.child = child;
    try {
      // An unauthenticated sync route answers 401 once the app is up.
      await pollUntil(
        'the backend to answer',
        async () => {
          if (!isAlive(child)) {
            throw new Error(
              `backend exited early (code ${child.exitCode}): ${this.tail()}`,
            );
          }
          const response = await fetch(`${this.baseUrl()}/api/sync/pull`, {
            signal: AbortSignal.timeout(2_000),
          }).catch(() => null);
          return response?.status === 401;
        },
        { timeoutMs: 90_000, intervalMs: 250 },
      );
    } catch (error) {
      await this.kill();
      throw error;
    }
  }

  // SIGKILL: no shutdown hook, no flush, as a crashed process.
  async kill(): Promise<void> {
    const child = this.child;
    if (!child || !isAlive(child)) return;
    const exited = new Promise<void>((resolve) =>
      child.once('exit', () => resolve()),
    );
    child.kill('SIGKILL');
    await exited;
  }

  async restart(): Promise<void> {
    await this.kill();
    await this.start();
  }

  async stop(): Promise<void> {
    await this.kill();
    rmSync(this.workDir, { recursive: true, force: true });
  }

  // The end of the backend log, for a failure message only.
  tail(lines = 25): string {
    try {
      return readFileSync(this.logPath, 'utf8')
        .split('\n')
        .slice(-lines)
        .join('\n');
    } catch {
      return '(no log)';
    }
  }

  private environment(): Record<string, string> {
    return {
      NODE_ENV: 'test',
      PORT: String(this.port),
      DATABASE_URL: this.options.databaseUrl,
      DATABASE_VERIFY_ON_STARTUP: 'true',
      DATABASE_SOCKET_TIMEOUT_MS: '10000',
      JWT_ACCESS_SECRET: this.secrets.access,
      JWT_REFRESH_SECRET: this.secrets.refresh,
      JWT_ACCESS_EXPIRES_IN: '30m',
      JWT_REFRESH_EXPIRES_IN: '1d',
      ADMIN_JWT_ACCESS_SECRET: this.secrets.adminAccess,
      ADMIN_JWT_REFRESH_SECRET: this.secrets.adminRefresh,
      COOKIE_SECURE: 'false',
      ADMIN_COOKIE_SECURE: 'false',
      BCRYPT_SALT_ROUNDS: '4',
      FRONTEND_URL: 'http://localhost:3000',
      APP_PUBLIC_URL: 'http://localhost:3000',
      CORS_ENABLED: 'false',
      // Loopback is trusted: the fault proxy tells the backend which client
      // it stands for (X-Forwarded-For) so the per-IP login limit holds per device.
      TRUST_PROXY: 'loopback',
      THROTTLE_USER_LIMIT: '100000',
      THROTTLE_ANON_LIMIT: '100000',
      OFFLINE_GRANT_PRIVATE_KEY: Buffer.from(
        this.grantKeys.privateKey,
      ).toString('base64'),
      OFFLINE_GRANT_PUBLIC_KEY: Buffer.from(this.grantKeys.publicKey).toString(
        'base64',
      ),
      OFFLINE_GRANT_LIFETIME_HOURS: '24',
      STORAGE_MASTER_KEY: this.secrets.storage,
      STORAGE_LOCAL_ROOT: join(this.workDir, 'storage'),
      UPLOAD_ROOT: join(this.workDir, 'uploads'),
      MESSAGING_KEYS: this.secrets.messaging,
      // Never contacted by the offline scenarios; the backend wants them set.
      ORTHANC_URL: 'http://127.0.0.1:1',
      ORTHANC_USERNAME: 'e2e',
      ORTHANC_PASSWORD: 'e2e-not-used',
      AI_SERVICE_URL: 'http://127.0.0.1:1',
      AI_SERVICE_TOKEN: 'e2e-not-used',
      ...this.options.env,
    };
  }
}
