// What the local build of the viewer is made of, and whether the one on disk is
// that one. Shared by build-local.mjs (which writes the stamp when it is done)
// and dev-viewer.mjs (which only builds when the stamp says it must).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DIST_DIR } from './local-paths.mjs';

// Keep in step with viewer/Dockerfile.
export const NODE_VERSION = '24.15.0';
export const OHIF_VERSION = '3.13.13';
export const OHIF_COMMIT = '1fa151f5133934c953a2ab4c0056ca91f929c32f';
export const PNPM_VERSION = '12.8.1';
export const PUBLIC_URL = '/viewer/';

export const STAMP_NAME = '.healixdz-build.json';

// What a build made today would be: another OHIF commit or another base path is
// another build. (app-config.js is not part of it: it is read from the
// repository when the viewer is served.)
export const currentStamp = () => ({
  commit: OHIF_COMMIT,
  publicUrl: PUBLIC_URL,
  version: OHIF_VERSION,
});

export function writeStamp(distDir = DIST_DIR) {
  writeFileSync(join(distDir, STAMP_NAME), `${JSON.stringify(currentStamp(), null, 2)}\n`);
}

// A build that is there, finished (the stamp is written last), and the one the
// repository asks for.
export function isViewerBuilt(distDir = DIST_DIR) {
  if (!existsSync(join(distDir, 'index.html'))) return false;
  try {
    const stamp = JSON.parse(readFileSync(join(distDir, STAMP_NAME), 'utf8'));
    const wanted = currentStamp();
    return Object.keys(wanted).every((key) => stamp[key] === wanted[key]);
  } catch {
    return false;
  }
}
