// node --test viewer/dev-viewer.test.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';

import { BUILD_SCRIPT, isServing, SERVE_SCRIPT, startViewerForDev } from './dev-viewer.mjs';

// A process that does not exist: it says what it is told, and exits when told.
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.killed = false;
  child.pid = 4242;
  child.finish = (code) => {
    child.exitCode = code;
    child.emit('exit', code);
  };
  return child;
}

function setup({ built = false, serving = false, env = {} } = {}) {
  const children = [];
  const probed = [];
  const lines = [];
  const killed = [];
  const viewer = startViewerForDev({
    env,
    isBuilt: () => built,
    killChild: (child) => killed.push(child),
    log: (line) => lines.push(line),
    probe: (port) => {
      probed.push(port);
      return Promise.resolve(serving);
    },
    spawn: (_command, args, options) => {
      const child = fakeChild();
      child.script = args[0];
      child.options = options;
      children.push(child);
      return child;
    },
  });
  return { children, killed, lines, probed, viewer };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const text = (lines) => lines.join('\n');

describe('startViewerForDev', () => {
  for (const env of [{ VIEWER: 'off' }, { SKIP_VIEWER: '1' }]) {
    it(`does nothing when it is turned off (${JSON.stringify(env)})`, async () => {
      const { children, lines, probed, viewer } = setup({ env });
      await viewer.done;

      assert.equal(children.length, 0);
      assert.equal(probed.length, 0);
      assert.match(text(lines), /\[viewer\] désactivée/);
    });
  }

  it('leaves a viewer that already answers alone', async () => {
    const { children, lines, viewer } = setup({ serving: true });
    // Not `await viewer.done`: with a wrong answer it would wait for a build
    // that never ends, and the test would hang instead of failing.
    await settle();

    assert.equal(children.length, 0);
    assert.match(text(lines), /\[viewer\] déjà en service sur http:\/\/127\.0\.0\.1:8090\/viewer\//);
    viewer.stop();
  });

  it('only serves a build that is there: nothing is rebuilt', async () => {
    const { children, viewer } = setup({ built: true });
    await settle();

    assert.deepEqual(children.map((child) => child.script), [SERVE_SCRIPT]);
    assert.equal(children[0].options.env.VIEWER_PORT, '8090');
    // It leaves by itself if this process is killed without stopping it.
    assert.equal(children[0].options.env.VIEWER_PARENT_PID, String(process.pid));
    viewer.stop();
  });

  it('builds first when the build is missing, in the background, then serves', async () => {
    const { children, lines, viewer } = setup({ built: false });
    await settle();

    assert.deepEqual(children.map((child) => child.script), [BUILD_SCRIPT]);
    assert.match(text(lines), /construction en arrière-plan/);

    children[0].finish(0);
    await settle();

    assert.deepEqual(children.map((child) => child.script), [BUILD_SCRIPT, SERVE_SCRIPT]);
    viewer.stop();
  });

  it('serves nothing, and says why, when the build fails', async () => {
    const { children, lines, viewer } = setup({ built: false });
    await settle();

    children[0].finish(2);
    await viewer.done;

    assert.equal(children.length, 1);
    assert.match(text(lines), /construction échouée \(code 2\)/);
    assert.match(text(lines), /node viewer\/build-local\.mjs/);
  });

  it('treats a build that cannot be started as a failed one', async () => {
    const { children, lines, viewer } = setup({ built: false });
    await settle();

    children[0].emit('error', new Error('spawn ENOENT'));
    await viewer.done;

    assert.equal(children.length, 1);
    assert.match(text(lines), /impossible de lancer .*spawn ENOENT/);
    assert.match(text(lines), /construction échouée/);
  });

  it('uses VIEWER_PORT, to look and to serve', async () => {
    const { children, probed, viewer } = setup({ built: true, env: { VIEWER_PORT: '9123' } });
    await settle();

    assert.deepEqual(probed, [9123]);
    assert.equal(children[0].options.env.VIEWER_PORT, '9123');
    viewer.stop();
  });

  it('prefixes what the scripts print, and skips the empty lines', async () => {
    const { children, lines, viewer } = setup({ built: true });
    await settle();

    children[0].stdout.write('Visionneuse sur http://127.0.0.1:8090/viewer/\n\n');
    children[0].stderr.write('un avertissement\n');
    await settle();

    assert.ok(lines.includes('[viewer] Visionneuse sur http://127.0.0.1:8090/viewer/'));
    assert.ok(lines.includes('[viewer] un avertissement'));
    assert.equal(lines.filter((line) => line.trim() === '[viewer]').length, 0);
    viewer.stop();
  });

  it('says so when the server stops by itself, and not when it is stopped', async () => {
    const first = setup({ built: true });
    await settle();
    first.children[0].finish(3);
    await settle();
    assert.match(text(first.lines), /serveur arrêté \(code 3\)/);

    const second = setup({ built: true });
    await settle();
    second.viewer.stop();
    second.children[0].finish(1);
    await settle();
    assert.doesNotMatch(text(second.lines), /serveur arrêté/);
  });

  it('stops what it started, and starts nothing more once stopped', async () => {
    const { children, killed, viewer } = setup({ built: false });
    await settle();

    viewer.stop();
    assert.deepEqual(killed, [children[0]]);

    children[0].finish(0);
    await viewer.done;
    assert.equal(children.length, 1, 'no server after a stop during the build');
  });
});

describe('isServing', () => {
  it('asks the probe file of the viewer by HEAD, on 127.0.0.1', async () => {
    const seen = [];
    const answer = await isServing(8090, (url, init) => {
      seen.push([url, init.method]);
      return Promise.resolve({ ok: true });
    });

    assert.equal(answer, true);
    assert.deepEqual(seen, [['http://127.0.0.1:8090/viewer/app-config.js', 'HEAD']]);
  });

  it('is false for an answer that is not 2xx, and when nothing answers', async () => {
    assert.equal(await isServing(8090, () => Promise.resolve({ ok: false })), false);
    assert.equal(await isServing(8090, () => Promise.reject(new TypeError('fetch failed'))), false);
  });
});
