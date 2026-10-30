import { wipeOfflineE2EData } from './support/database';

// After the run, even a failed one: the dedicated database is left empty
// (OFFLINE_E2E_KEEP_DATA=1 keeps it for a post-mortem).
export default async function globalTeardown() {
  if (process.env.OFFLINE_E2E_KEEP_DATA === '1') return;
  await wipeOfflineE2EData();
}
