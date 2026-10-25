// node --test viewer/serve-local.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createViewerServer, isProcessAlive, resolveViewerFile, VIEWER_CSP, watchParent } from './serve-local.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('serve-local', () => {
  const root = mkdtempSync(join(tmpdir(), 'viewer-dist-'));
  const dist = join(root, 'dist');
  const config = join(root, 'app-config.js');
  let server;
  let base;

  before(async () => {
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>OHIF</title>');
    writeFileSync(join(dist, 'app-config.js'), '// the one built into the image');
    writeFileSync(join(dist, 'assets', 'app.bundle.js'), 'console.log(1)');
    writeFileSync(join(dist, 'assets', 'decoder.wasm'), Buffer.from([0, 97, 115, 109]));
    writeFileSync(join(root, 'secret.txt'), 'outside the build');
    writeFileSync(config, "window.config = { name: 'repo' };");
    server = createViewerServer({ configFile: config, distDir: dist });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    rmSync(root, { force: true, recursive: true });
  });

  const get = (path, init) => fetch(base + path, { redirect: 'manual', ...init });

  it('serves the files of the build under /viewer/, with their types', async () => {
    const js = await get('/viewer/assets/app.bundle.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /^text\/javascript/);
    assert.equal(await js.text(), 'console.log(1)');

    const wasm = await get('/viewer/assets/decoder.wasm');
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  });

  it('answers every request with the Content-Security-Policy of /viewer and nosniff', async () => {
    for (const path of ['/viewer/', '/viewer/assets/app.bundle.js', '/viewer/missing.js']) {
      const response = await get(path);
      assert.equal(response.headers.get('content-security-policy'), VIEWER_CSP, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    }
  });

  it('has the policy Caddy gives /viewer in production', () => {
    const caddy = readFileSync(join(HERE, '..', 'caddy', 'healixdz-site.caddy'), 'utf8');
    assert.ok(caddy.includes(`header Content-Security-Policy "${VIEWER_CSP}"`));
  });

  it('reads app-config.js from the repository, not from the build, at every request', async () => {
    assert.equal(await (await get('/viewer/app-config.js')).text(), "window.config = { name: 'repo' };");
    writeFileSync(config, "window.config = { name: 'edited' };");
    assert.equal(await (await get('/viewer/app-config.js')).text(), "window.config = { name: 'edited' };");
  });

  it('serves the application for its own routes, with or without the final slash', async () => {
    for (const path of ['/viewer', '/viewer/', '/viewer/viewer?StudyInstanceUIDs=1.2.3', '/viewer/some/route']) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      assert.match(await response.text(), /<title>OHIF<\/title>/, path);
    }
  });

  it('answers 404 to a missing asset and to anything outside /viewer', async () => {
    for (const path of ['/viewer/missing.js', '/viewer/assets/missing.wasm', '/', '/api/dicomweb/studies', '/viewerx/index.html']) {
      assert.equal((await get(path)).status, 404, path);
    }
  });

  it('never leaves the build', async () => {
    for (const path of ['/viewer/../secret.txt', '/viewer/%2e%2e/secret.txt', '/viewer/..%2fsecret.txt', '/viewer/assets/..%5c..%5csecret.txt', '/viewer/%00']) {
      const response = await get(path);
      assert.notEqual(response.status, 200, path);
      assert.doesNotMatch(await response.text(), /outside the build/, path);
    }
    assert.equal(resolveViewerFile('/viewer/../secret.txt', dist, config), null);
    assert.equal(resolveViewerFile('/viewer/a/../../secret.txt', dist, config), null);
  });

  it('takes GET and HEAD only', async () => {
    const head = await get('/viewer/assets/app.bundle.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '14');
    assert.equal(await head.text(), '');

    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await get('/viewer/', { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  });
});

describe('watchParent', () => {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it('calls back once, when the process is gone', async () => {
    let alive = true;
    let calls = 0;
    watchParent(1, () => (calls += 1), { intervalMs: 5, isAlive: () => alive });

    await pause(30);
    assert.equal(calls, 0);
    alive = false;
    await pause(40);
    assert.equal(calls, 1);
  });

  it('can be stopped', async () => {
    let calls = 0;
    const stop = watchParent(1, () => (calls += 1), { intervalMs: 5, isAlive: () => false });
    stop();

    await pause(30);
    assert.equal(calls, 0);
  });

  it('knows a process that is there, and one that is not', async () => {
    assert.equal(isProcessAlive(process.pid), true);
    // A pid that cannot exist.
    assert.equal(isProcessAlive(2 ** 30), false);
  });
});
