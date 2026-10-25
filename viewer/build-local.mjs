// Builds the OHIF viewer without Docker, the way viewer/Dockerfile does, for
// local development:
//
//   node viewer/build-local.mjs        (then)   node viewer/serve-local.mjs
//
// Same commit, same pnpm, same frozen lockfile, same base path (/viewer/), same
// configuration (viewer/app-config.js), same inline-script and service-worker
// treatment as the image. The one difference: Node. OHIF needs Node >= 24; if
// yours is older, Node 24.15.0 (the version of the Dockerfile) is downloaded
// from nodejs.org, its SHA-256 checked against the published list, and used for
// this build only (nothing is installed on the machine).
//
// Everything goes to BUILD_DIR (viewer/local-paths.mjs, outside the repository)
// and takes several gigabytes of disk and memory, and several minutes. Run it
// again to rebuild: what is already there is reused. `npm run start:dev` of the
// backend runs it by itself when the build is missing or out of date
// (viewer/dev-viewer.mjs).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NODE_VERSION,
  OHIF_COMMIT,
  OHIF_VERSION,
  PNPM_VERSION,
  PUBLIC_URL,
  writeStamp,
} from './build-info.mjs';
import { BUILD_DIR, DIST_DIR } from './local-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WINDOWS = process.platform === 'win32';

const SRC = join(BUILD_DIR, 'src');
const TOOLS = join(BUILD_DIR, 'tools');

const log = (message) => console.log(`\n== ${message}`);
const fail = (message) => {
  console.error(`\nÉCHEC : ${message}`);
  process.exit(1);
};

function run(command, args, { cwd, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: WINDOWS && /\.(cmd|bat)$/i.test(command),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} (code ${result.status ?? result.signal})`);
  }
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// A few tries: a connection that is slow to open (10 s limit of fetch) is not a
// reason to start the whole build again.
async function fetchWithRetry(url) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!response.ok) fail(`${url} : HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
      console.warn(`${url} : essai ${attempt} sans réponse (${error.cause?.code ?? error.message})`);
    }
  }
  return fail(`${url} : ${last?.cause?.code ?? last?.message}`);
}

async function download(url, target) {
  writeFileSync(target, await fetchWithRetry(url));
}

// 1. Node >= 24: the current one, or a portable copy of 24.15.0.
async function ensureNode() {
  if (Number(process.versions.node.split('.')[0]) >= 24) {
    return { directory: dirname(process.execPath), node: process.execPath };
  }

  const platform = WINDOWS ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const base = `node-v${NODE_VERSION}-${platform}-${arch}`;
  const archive = `${base}.${WINDOWS ? 'zip' : 'tar.xz'}`;
  const home = join(TOOLS, base);
  const directory = WINDOWS ? home : join(home, 'bin');
  const node = join(directory, WINDOWS ? 'node.exe' : 'node');

  if (!existsSync(node)) {
    log(`Node ${NODE_VERSION} portable (le vôtre est ${process.versions.node})`);
    mkdirSync(TOOLS, { recursive: true });
    const file = join(TOOLS, archive);
    await download(`https://nodejs.org/dist/v${NODE_VERSION}/${archive}`, file);
    const list = (await fetchWithRetry(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)).toString('utf8');
    const expected = list.split('\n').find((line) => line.endsWith(` ${archive}`))?.split(/\s+/)[0];
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (!expected || expected !== actual) fail(`SHA-256 de ${archive} différent de celui publié par nodejs.org.`);
    // bsdtar reads zip as well as tar.xz. On Windows, the one of the system: a
    // GNU tar found first on the PATH (Git Bash) takes "C:" for a host name.
    const tar = WINDOWS ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    run(tar, ['-xf', file, '-C', TOOLS]);
    rmSync(file);
  }
  return { directory, node };
}

// 2. The sources, at the exact commit.
function ensureSources() {
  log(`OHIF ${OHIF_VERSION} (${OHIF_COMMIT.slice(0, 10)})`);
  mkdirSync(SRC, { recursive: true });
  if (capture('git', ['rev-parse', 'HEAD'], SRC) !== OHIF_COMMIT) {
    if (!existsSync(join(SRC, '.git'))) {
      run('git', ['init', '-q', '.'], { cwd: SRC });
      run('git', ['remote', 'add', 'origin', 'https://github.com/OHIF/Viewers.git'], { cwd: SRC });
    }
    run('git', ['fetch', '-q', '--depth', '1', 'origin', OHIF_COMMIT], { cwd: SRC });
    run('git', ['checkout', '-q', '-f', 'FETCH_HEAD'], { cwd: SRC });
  }
  if (capture('git', ['rev-parse', 'HEAD'], SRC) !== OHIF_COMMIT) fail('le commit récupéré n’est pas celui attendu.');
  const version = JSON.parse(readFileSync(join(SRC, 'platform/app/package.json'), 'utf8')).version;
  if (version !== OHIF_VERSION) fail(`platform/app est en version ${version}, pas ${OHIF_VERSION}.`);
}

// 3. pnpm, at the version OHIF pins, installed in BUILD_DIR only.
function ensurePnpm(node) {
  const prefix = join(BUILD_DIR, 'pnpm');
  const bin = join(prefix, 'node_modules', '.bin', WINDOWS ? 'pnpm.cmd' : 'pnpm');
  if (!existsSync(bin)) {
    log(`pnpm ${PNPM_VERSION}`);
    const npm = join(node.directory, WINDOWS ? 'npm.cmd' : 'npm');
    run(npm, ['install', '--prefix', prefix, '--no-audit', '--no-fund', `pnpm@${PNPM_VERSION}`], {
      env: { PATH: `${node.directory}${delimiter}${process.env.PATH}` },
    });
  }
  return bin;
}

function copyDirectory(from, to) {
  rmSync(to, { force: true, recursive: true });
  cpSync(from, to, { recursive: true });
}

async function main() {
  const node = await ensureNode();
  ensureSources();
  const pnpm = ensurePnpm(node);
  // OHIF's scripts call `pnpm` and `node` themselves: both first on the PATH.
  const env = {
    CYPRESS_INSTALL_BINARY: '0',
    HUSKY: '0',
    PATH: [dirname(pnpm), node.directory, process.env.PATH].join(delimiter),
  };

  log('pnpm install --frozen-lockfile (plusieurs minutes)');
  run(pnpm, ['install', '--frozen-lockfile'], { cwd: SRC, env });

  // Our configuration is the one the build copies to app-config.js.
  copyFileSync(join(HERE, 'app-config.js'), join(SRC, 'platform/app/public/config/healixdz.js'));

  log(`pnpm run build (PUBLIC_URL=${PUBLIC_URL}) : plusieurs minutes et plusieurs Go de mémoire`);
  run(pnpm, ['run', 'build'], {
    cwd: SRC,
    env: {
      ...env,
      APP_CONFIG: 'config/healixdz.js',
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=6144',
      PUBLIC_URL,
      QUICK_BUILD: 'true',
    },
  });

  log('inline scripts, service worker');
  const built = join(SRC, 'platform/app/dist');
  if (!existsSync(join(built, 'index.html'))) fail('la construction n’a pas produit platform/app/dist/index.html.');
  run(node.node, [join(HERE, 'externalize-inline-scripts.mjs'), built, PUBLIC_URL]);
  copyFileSync(join(HERE, 'init-service-worker.js'), join(built, 'init-service-worker.js'));
  rmSync(join(built, 'sw.js'), { force: true });
  for (const entry of readdirSync(built, { recursive: true })) {
    if (String(entry).endsWith('.map')) rmSync(join(built, String(entry)), { force: true });
  }
  for (const file of ['index.html', 'init-service-worker.js']) {
    if (readFileSync(join(built, file), 'utf8').includes('storage.googleapis.com')) {
      fail(`${file} appelle encore storage.googleapis.com.`);
    }
  }

  copyDirectory(built, DIST_DIR);
  // Last: a build that was interrupted has no stamp, and is built again.
  writeStamp();
  const size = readdirSync(DIST_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((total, entry) => total + statSync(join(entry.parentPath, entry.name)).size, 0);
  log(`Prêt : ${DIST_DIR} (${(size / 1e6).toFixed(0)} Mo)\nLancez : node viewer/serve-local.mjs`);
}

await main();
