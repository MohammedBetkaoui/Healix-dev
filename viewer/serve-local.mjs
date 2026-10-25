// Serves the local build of the viewer (viewer/build-local.mjs) under /viewer/,
// for development without Docker, Caddy or nginx:
//
//   node viewer/serve-local.mjs [port]        (default 8090, 127.0.0.1 only)
//
// `next dev` forwards /viewer/* here and /api/dicomweb/* to the backend
// (frontend/next.config.ts), so the viewer shares the origin, and the session
// cookie, of the pages, as it does behind Caddy in production.
//
// What nginx and Caddy do for the image is done here, and nothing more:
//  - the Content-Security-Policy of /viewer (caddy/healixdz-site.caddy; a test
//    keeps both in agreement);
//  - viewer/app-config.js is read from the repository on every request, as
//    docker-compose mounts it over the built one: an edit takes effect when the
//    page is reloaded;
//  - any path without an extension is the application (index.html), for its
//    own routes (/viewer/viewer?StudyInstanceUIDs=...);
//  - GET and HEAD only, nothing outside /viewer, nothing outside the build.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DIST_DIR } from './local-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const VIEWER_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'";

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const PREFIX = '/viewer';

// A file every build of the viewer serves: a request for it tells whether the
// viewer is there (the page of a study asks it too, frontend/src/features/dicom).
export const VIEWER_PROBE_PATH = '/viewer/app-config.js';

// The file a request path designates, or null: below the build, never above it.
export function resolveViewerFile(pathname, distDir, configFile) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  if (path.includes('\0') || path.includes('\\')) return null;

  const relative = path.slice(PREFIX.length).replace(/^\/+/, '');
  if (relative.split('/').includes('..')) return null;
  if (relative === 'app-config.js') return configFile;

  const root = resolve(distDir);
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) return null;

  if (relative !== '' && existsSync(file) && statSync(file).isFile()) return file;
  // The application's own routes have no extension; a missing asset is a 404.
  if (extname(relative) === '') return join(root, 'index.html');
  return null;
}

// Is this process still there? (EPERM: it is, and belongs to someone else.)
export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Calls onGone, once, when the process that started this server is gone: a
// server started by `npm run start:dev` must not outlive it when it is killed
// without a chance to stop its children (a closed terminal, a crash).
export function watchParent(pid, onGone, { intervalMs = 2000, isAlive = isProcessAlive } = {}) {
  const timer = setInterval(() => {
    if (!isAlive(pid)) {
      clearInterval(timer);
      onGone();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

export function createViewerServer({
  configFile = join(HERE, 'app-config.js'),
  distDir = DIST_DIR,
} = {}) {
  return createServer((request, response) => {
    const headers = {
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': VIEWER_CSP,
      'X-Content-Type-Options': 'nosniff',
    };
    const refuse = (status, extra = {}) => {
      response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
      response.end(request.method === 'HEAD' ? undefined : `${status}\n`);
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return refuse(405, { Allow: 'GET, HEAD' });
    }

    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const file = resolveViewerFile(pathname, distDir, configFile);
    if (!file || !existsSync(file)) return refuse(404);

    response.writeHead(200, {
      ...headers,
      'Content-Length': statSync(file).size,
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') return response.end();
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    console.error(`La visionneuse n'est pas construite (${DIST_DIR}).\nLancez d'abord : node viewer/build-local.mjs`);
    process.exit(1);
  }
  const port = Number(process.argv[2] ?? process.env.VIEWER_PORT ?? 8090);
  createViewerServer()
    .on('error', (error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? `Le port ${port} est déjà pris : la visionneuse est peut-être déjà lancée (VIEWER_PORT pour en changer).`
          : `Impossible de servir la visionneuse : ${error.message}`,
      );
      process.exit(1);
    })
    .listen(port, '127.0.0.1', () => {
      console.log(`Visionneuse sur http://127.0.0.1:${port}/viewer/ (construction : ${DIST_DIR})`);
      const parent = Number(process.env.VIEWER_PARENT_PID);
      if (parent) watchParent(parent, () => process.exit(0));
    });
}
