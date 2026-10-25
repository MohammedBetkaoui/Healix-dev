// The viewer, for `npm run start:dev` of the backend (backend/scripts/start-dev.mjs):
// builds it when it is missing or out of date (build-local.mjs), then serves it
// (serve-local.mjs), next to the API, and stops it with the API.
//
//  - Never in the way of the API: the build (ten minutes the first time) runs in
//    the background, its output prefixed "[viewer]"; a build that fails, or a
//    port that is taken, is a message, not a reason to stop the backend.
//  - Nothing is done twice: a viewer that already answers on the port (started by
//    hand, or by another `start:dev`) is left alone, and a build that is there and
//    stamped for this repository is not rebuilt.
//  - VIEWER=off (or SKIP_VIEWER=1) turns it all off; VIEWER_PORT changes the port
//    (default 8090, the one frontend/next.config.ts forwards /viewer/* to).
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { isViewerBuilt } from './build-info.mjs';
import { VIEWER_PROBE_PATH } from './serve-local.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BUILD_SCRIPT = join(HERE, 'build-local.mjs');
export const SERVE_SCRIPT = join(HERE, 'serve-local.mjs');
export const DEFAULT_PORT = 8090;

// Does something already answer for the viewer on this port?
export async function isServing(port, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}${VIEWER_PROBE_PATH}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// A process and the ones it started: `taskkill /T` on Windows, where killing
// the parent leaves its children (pnpm, webpack) running.
export function killTree(child) {
  if (!child || child.exitCode !== null || child.killed || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

export function startViewerForDev({
  env = process.env,
  isBuilt = isViewerBuilt,
  killChild = killTree,
  log = (line) => console.log(line),
  probe = isServing,
  spawn = nodeSpawn,
} = {}) {
  const say = (message) => log(`[viewer] ${message}`);
  const children = new Set();
  let stopped = false;

  if (env.VIEWER === 'off' || env.SKIP_VIEWER === '1') {
    say('désactivée (VIEWER=off).');
    return { done: Promise.resolve(), stop() {} };
  }

  const port = Number(env.VIEWER_PORT) || DEFAULT_PORT;

  // A script of this folder, its lines prefixed; resolves with its exit code.
  function run(script, extraEnv = {}) {
    const child = spawn(process.execPath, [script], {
      env: { ...env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.add(child);
    for (const stream of [child.stdout, child.stderr]) {
      if (stream) createInterface({ input: stream }).on('line', (line) => line.trim() && say(line));
    }
    const exited = new Promise((resolve) => {
      child.once('error', (error) => {
        say(`impossible de lancer ${script} : ${error.message}`);
        resolve(1);
      });
      child.once('exit', (code) => {
        children.delete(child);
        resolve(code ?? 1);
      });
    });
    return { child, exited };
  }

  const done = (async () => {
    if (await probe(port)) {
      say(`déjà en service sur http://127.0.0.1:${port}/viewer/.`);
      return;
    }
    if (stopped) return;

    if (!isBuilt()) {
      say('construction en arrière-plan (une dizaine de minutes la première fois) : le backend démarre sans attendre.');
      const code = await run(BUILD_SCRIPT).exited;
      if (stopped) return;
      if (code !== 0) {
        say(`construction échouée (code ${code}) : la page d'une étude dira que la visionneuse n'est pas disponible. Relancez « node viewer/build-local.mjs » pour voir pourquoi.`);
        return;
      }
    }

    // VIEWER_PARENT_PID: the server leaves by itself if this process is killed.
    const { exited } = run(SERVE_SCRIPT, { VIEWER_PARENT_PID: String(process.pid), VIEWER_PORT: String(port) });
    exited.then((code) => {
      if (!stopped) say(`serveur arrêté (code ${code}).`);
    });
  })();

  return {
    done,
    stop() {
      stopped = true;
      for (const child of children) killChild(child);
      children.clear();
    },
  };
}
