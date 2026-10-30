import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Where the offline reliability suite finds its pieces. Every value can be
// overridden through the environment; the defaults match
// docker-compose.offline-e2e.yml and a debug build of the harness.

export const BACKEND_DIR = resolve(__dirname, '..', '..', '..');
export const REPO_ROOT = resolve(BACKEND_DIR, '..');

// The suite writes and deletes rows: only a database made for it, never the
// development or production one.
const OFFLINE_E2E_DATABASE_NAME = /^healixdz_offline_e2e[a-z0-9_]*$/;

export const DEFAULT_DATABASE_URL =
  'mysql://root:offline-e2e-root@127.0.0.1:33306/healixdz_offline_e2e';

export function readDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.OFFLINE_E2E_DATABASE_URL || DEFAULT_DATABASE_URL;
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!OFFLINE_E2E_DATABASE_NAME.test(name)) {
    throw new Error(
      `OFFLINE_E2E_DATABASE_URL must name a database called healixdz_offline_e2e*, not "${name}".`,
    );
  }
  return url;
}

export function harnessBinary(): string {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const path =
    process.env.OFFLINE_E2E_HARNESS_BIN ||
    join(
      REPO_ROOT,
      'desktop',
      'src-tauri',
      'target',
      'debug',
      `offline-e2e-harness${exe}`,
    );
  if (!existsSync(path)) {
    throw new Error(
      `Desktop harness not built (${path}). Run: cargo build --features e2e-harness --bin offline-e2e-harness (in desktop/src-tauri), or scripts/test-offline-e2e.mjs.`,
    );
  }
  return path;
}

export function backendEntry(): string {
  const path = join(BACKEND_DIR, 'dist', 'src', 'main.js');
  if (!existsSync(path)) {
    throw new Error(
      `Backend not built (${path}). Run: npm run build (in backend).`,
    );
  }
  return path;
}
