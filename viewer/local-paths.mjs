// Where the local build of the viewer lives, shared by build-local.mjs and
// serve-local.mjs. Outside the repository on purpose: OHIF's sources and
// node_modules weigh several gigabytes, which a synchronised folder (OneDrive)
// or a Docker build context must not carry, and pnpm's deep paths need a short
// root on Windows.
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BUILD_DIR =
  process.env.HEALIXDZ_VIEWER_DIR ||
  join(
    process.env.LOCALAPPDATA || join(homedir(), '.cache'),
    'HealixDz',
    'viewer',
  );

// What build-local.mjs produces and serve-local.mjs serves.
export const DIST_DIR = join(BUILD_DIR, 'dist');
