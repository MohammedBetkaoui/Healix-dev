#!/usr/bin/env node
// One command for the offline reliability suite (docs/offline-reliability-testing.md):
//
//   node scripts/test-offline-e2e.mjs [options] [-- <jest arguments>]
//
//   1. MySQL      docker compose -f docker-compose.offline-e2e.yml up --wait
//                 (skipped when OFFLINE_E2E_DATABASE_URL points at a database)
//   2. Backend    npm run build                      (backend/)
//   3. Desktop    cargo build --features e2e-harness (desktop/src-tauri)
//   4. Suite      npm run test:offline-e2e           (backend/)
//   5. Cleanup    docker compose down -v, even when the suite failed
//
// Options:  --skip-build   reuse backend/dist and the harness binary
//           --keep         leave the MySQL container up afterwards
//           -- <args>      passed to jest, e.g. -- scenarios/04 -t "lost ACK"

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(root, 'docker-compose.offline-e2e.yml');
const windows = process.platform === 'win32';

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
const options = separator === -1 ? argv : argv.slice(0, separator);
const jestArgs = separator === -1 ? [] : argv.slice(separator + 1);
const skipBuild = options.includes('--skip-build');
const keep = options.includes('--keep');
const ownDatabase = !process.env.OFFLINE_E2E_DATABASE_URL;

const run = (command, args, cwd, env = {}) => {
  console.log(`\n$ ${[command, ...args].join(' ')}   (${cwd.replace(root, '.') || '.'})`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    // npm is a .cmd shim on Windows; everything else is a real executable.
    shell: windows && command === 'npm',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const must = (status, step) => {
  if (status !== 0) {
    console.error(`\nStep failed: ${step}`);
    throw Object.assign(new Error(step), { status });
  }
};

let exitCode = 0;
try {
  if (ownDatabase) {
    must(run('docker', ['compose', '-f', compose, 'up', '-d', '--wait'], root), 'start MySQL');
  }
  if (!skipBuild) {
    must(run('npm', ['run', 'build'], join(root, 'backend')), 'build the backend');
    must(
      run(
        'cargo',
        ['build', '--features', 'e2e-harness', '--bin', 'offline-e2e-harness'],
        join(root, 'desktop', 'src-tauri'),
      ),
      'build the Desktop harness',
    );
  }
  exitCode = run('npm', ['run', 'test:offline-e2e', '--', ...jestArgs], join(root, 'backend'));
} catch (error) {
  exitCode = error.status ?? 1;
} finally {
  if (ownDatabase && !keep) {
    run('docker', ['compose', '-f', compose, 'down', '-v'], root);
  }
}
process.exit(exitCode);
