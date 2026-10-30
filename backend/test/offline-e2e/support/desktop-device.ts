import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtempSync,
  openSync,
  readSync,
  closeSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { harnessBinary } from './config';
import { type NetworkFaultController } from './network-fault-controller';
import { trace } from './wait';

// One Desktop: a profile folder (encrypted SQLCipher database + secrets) and
// the real Rust engine, started as a fresh process for every command, so that
// "the app was killed and relaunched" is simply "run the next command".

export type HarnessResult<T = any> = {
  ok: boolean;
  result?: T;
  error?: string;
  exitCode: number;
  // The process died without answering: a crash point or a kill.
  crashed: boolean;
};

export type OutboxRow = {
  operation_id: string;
  device_id: string;
  entity_type: 'CONSULTATION' | 'PRESCRIPTION';
  local_entity_id: string;
  operation: 'CREATE' | 'UPDATE';
  base_version: number | null;
  // The stored envelope, as sent on the wire (JSON text).
  payload: string;
  sequence: number;
  status: 'PENDING' | 'RETRYABLE' | 'ACK' | 'CONFLICT' | 'REJECTED';
  retry_count: number;
  attempt_count: number;
  first_attempted_at: string | null;
  last_attempted_at: string | null;
};

export type LocalDump = {
  cipherVersion: string | null;
  user: { id: string; full_name: string; email: string; role: string }[];
  workspace: { id: string; name: string; workspace_type: string }[];
  device: { id: string; workspace_id: string }[];
  patients: {
    server_id: string;
    workspace_id: string;
    locked: number;
    lock_reason: string | null;
  }[];
  appointments: { server_id: string; patient_server_id: string }[];
  medicationCount: { count: number }[];
  consultations: Record<string, any>[];
  prescriptions: Record<string, any>[];
  prescriptionItems: {
    prescription_local_id: string;
    position: number;
    payload: string;
  }[];
  outbox: OutboxRow[];
  entityMap: {
    entity_type: string;
    local_entity_id: string;
    server_entity_id: string;
  }[];
  conflicts: Record<string, any>[];
  syncState: { cursor: string; last_synced_at: string | null }[];
  audit: { action: string; entity_id: string; synced_at: string | null }[];
};

export const envelopeOf = (row: OutboxRow) => JSON.parse(row.payload);
export const payloadOf = (row: OutboxRow) => envelopeOf(row).payload;

export class Local {
  constructor(readonly dump: LocalDump) {}

  get deviceId() {
    return this.dump.device[0]?.id;
  }

  get cursor() {
    return this.dump.syncState[0]?.cursor ?? '';
  }

  get medicationCount() {
    return this.dump.medicationCount[0]?.count ?? 0;
  }

  outboxFor(localId: string) {
    return this.dump.outbox.filter((row) => row.local_entity_id === localId);
  }

  outbox(operationId: string) {
    return this.dump.outbox.find((row) => row.operation_id === operationId);
  }

  consultation(localId: string) {
    return this.dump.consultations.find((row) => row.local_id === localId);
  }

  prescription(localId: string) {
    return this.dump.prescriptions.find((row) => row.local_id === localId);
  }

  mappingFor(localId: string) {
    return this.dump.entityMap.find((row) => row.local_entity_id === localId);
  }

  openConflicts() {
    return this.dump.conflicts.filter((row) => row.status === 'OPEN');
  }

  patient(serverId: string) {
    return this.dump.patients.find((row) => row.server_id === serverId);
  }
}

export type DesktopCredentials = { email: string; password: string };

export class DesktopDevice {
  readonly profileDir = mkdtempSync(join(tmpdir(), 'healix-e2e-profile-'));
  // Shortens the HTTP timeout of the engine so a real timeout is cheap to get.
  httpTimeoutMs: number | undefined;

  constructor(
    readonly label: string,
    readonly network: NetworkFaultController,
    private readonly credentials: DesktopCredentials,
  ) {}

  get api() {
    return `${this.network.baseUrl()}/api`;
  }

  run<T = any>(
    command: string,
    flags: Record<string, string> = {},
    options: { crashAt?: string; timeoutMs?: number } = {},
  ): Promise<HarnessResult<T>> {
    const args = [command, '--profile', this.profileDir];
    for (const [name, value] of Object.entries(flags))
      args.push(`--${name}`, value);
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.HEALIX_E2E_CRASH_AT;
      if (options.crashAt) env.HEALIX_E2E_CRASH_AT = options.crashAt;
      if (this.httpTimeoutMs)
        env.HEALIX_E2E_HTTP_TIMEOUT_MS = String(this.httpTimeoutMs);
      const child = spawn(harnessBinary(), args, { env, windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`harness "${command}" timed out (${this.label})`));
      }, options.timeoutMs ?? 120_000);
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        trace('desktop', {
          device: this.label,
          command,
          ms: Date.now() - startedAt,
          exit: code,
        });
        const line = stdout.trim().split('\n').filter(Boolean).pop();
        if (!line) {
          resolve({
            ok: false,
            exitCode: code ?? -1,
            crashed: true,
            error: stderr.slice(-300),
          });
          return;
        }
        try {
          const parsed = JSON.parse(line) as {
            ok: boolean;
            result?: T;
            error?: string;
          };
          resolve({ ...parsed, exitCode: code ?? 0, crashed: false });
        } catch {
          reject(
            new Error(
              `harness "${command}" printed an unreadable answer (${this.label})`,
            ),
          );
        }
      });
    });
  }

  // Throws with the engine's message when the command failed.
  async expectOk<T>(
    command: string,
    flags: Record<string, string> = {},
    options = {},
  ) {
    const outcome = await this.run<T>(command, flags, options);
    if (!outcome.ok) {
      throw new Error(
        `${this.label}: ${command} failed: ${outcome.error ?? `exit ${outcome.exitCode}`}`,
      );
    }
    return outcome.result as T;
  }

  // Login, device registration, offline grant, bootstrap, medication catalog.
  // The device RSA key is generated here by default (a debug build of the
  // engine needs seconds for it); `engineKeygen: true` lets the engine make
  // its own, as the shipped application does.
  register(options: { engineKeygen?: boolean } = {}) {
    const flags: Record<string, string> = {};
    if (!options.engineKeygen) {
      const keyFile = join(this.profileDir, 'device-key.pem');
      writeFileSync(
        keyFile,
        generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        }).privateKey,
      );
      flags['device-key-file'] = keyFile;
    }
    return this.expectOk<{
      authorized: boolean;
      workspace: { id: string; name: string };
      user: { id: string };
    }>('register', {
      ...flags,
      api: this.api,
      input: JSON.stringify({
        accountType: 'INDEPENDENT_DOCTOR',
        email: this.credentials.email,
        password: this.credentials.password,
        deviceName: `Poste E2E ${this.label}`,
      }),
    });
  }

  // sync_now(); the outcome is returned as is (a sync may legitimately fail).
  sync(options: { crashAt?: string } = {}) {
    return this.run('sync', { api: this.api }, options);
  }

  // `count` sync_now() running at the same time inside one process.
  syncConcurrent(count = 2) {
    return this.run<{ ok: boolean; error?: string }[]>('sync-concurrent', {
      api: this.api,
      count: String(count),
    });
  }

  saveConsultation(input: Record<string, unknown>) {
    return this.run<{ localId: string; operationId: string }>(
      'save-consultation',
      {
        input: JSON.stringify(input),
      },
    );
  }

  savePrescription(input: Record<string, unknown>) {
    return this.run<{ localId: string; operationId: string }>(
      'save-prescription',
      {
        input: JSON.stringify(input),
      },
    );
  }

  status() {
    return this.run('status');
  }

  async local(): Promise<Local> {
    return new Local(await this.expectOk<LocalDump>('dump'));
  }

  // The first bytes of the database file: SQLCipher output is not the
  // "SQLite format 3" header of a plain database.
  databaseHeader(): string {
    const fd = openSync(
      join(this.profileDir, 'data', 'healixdz-offline-v1.db'),
      'r',
    );
    try {
      const header = Buffer.alloc(16);
      readSync(fd, header, 0, 16, 0);
      return header.toString('latin1');
    } finally {
      closeSync(fd);
    }
  }

  dispose() {
    rmSync(this.profileDir, { recursive: true, force: true });
  }
}
