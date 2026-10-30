import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { wipeOfflineE2EData } from './support/database';
import {
  BACKEND_DIR,
  backendEntry,
  harnessBinary,
  readDatabaseUrl,
} from './support/config';

// Once per run, before any scenario: the artefacts exist, the dedicated MySQL
// database carries the schema of the migrations (the same ones production
// applies) and starts empty.
export default async function globalSetup() {
  const databaseUrl = readDatabaseUrl();
  backendEntry();
  harnessBinary();
  execFileSync(
    process.execPath,
    [
      join(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js'),
      'migrate',
      'deploy',
    ],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    },
  );
  // Leftovers of an aborted run must not leak into this one.
  await wipeOfflineE2EData();
}
