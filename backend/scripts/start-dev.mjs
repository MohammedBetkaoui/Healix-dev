// `npm run start:dev`: the API in watch mode (nest start --watch), and with it
// the DICOM viewer of local development, built if need be and served on
// http://127.0.0.1:8090/viewer/ (viewer/dev-viewer.mjs, which says what it does
// and never stops the API). Both stop together.
//
//   npm run start:dev               the API and the viewer
//   VIEWER=off npm run start:dev    the API alone (as `npm run start:dev:api`)
//
// Anything after "--" replaces the API's command (used by the tests of this file).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { startViewerForDev } from '../../viewer/dev-viewer.mjs';

const separator = process.argv.indexOf('--');
const command =
  separator === -1
    ? [process.execPath, createRequire(import.meta.url).resolve('@nestjs/cli/bin/nest.js'), 'start', '--watch']
    : process.argv.slice(separator + 1);

const viewer = startViewerForDev();
const api = spawn(command[0], command.slice(1), { stdio: 'inherit' });

let leaving = false;
function leave(code) {
  if (leaving) return;
  leaving = true;
  viewer.stop();
  process.exit(code);
}

// The API's own exit ends everything, with its code.
api.once('exit', (code, signal) => leave(code ?? (signal ? 1 : 0)));
api.once('error', (error) => {
  console.error(`Impossible de lancer l'API : ${error.message}`);
  leave(1);
});

// Ctrl+C reaches every process of the console, the API included: it leaves by
// itself. Any other way to be stopped (SIGTERM, a closed terminal) stops it
// here, with what it started: `taskkill /T` on Windows, where killing the
// parent leaves its children.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(signal, () => {
    if (signal !== 'SIGINT' && api.pid !== undefined && api.exitCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(api.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        api.kill('SIGTERM');
      }
    }
    leave(130);
  });
}
