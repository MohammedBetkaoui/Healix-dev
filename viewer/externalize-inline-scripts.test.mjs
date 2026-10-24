// node --test viewer/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { externalizeInlineScripts, inlineScriptsLeft } from './externalize-inline-scripts.mjs';

// The two inline scripts of OHIF v3.13.13's index.html, as built.
const OHIF_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script type="text/javascript">
      console.time('scriptToView');
      window.PUBLIC_URL = '/viewer/';
    </script>
    <link rel="manifest" href="/viewer/manifest.json" />
    <script
      rel="preload"
      as="script"
      type="text/javascript"
      src="/viewer/app-config.js"
    ></script>
    <script
      rel="preload"
      as="script"
      type="module"
      src="/viewer/init-service-worker.js"
    ></script>
    <title>OHIF Viewer</title>
    <script>
      function browserImportFunction(moduleId) {
        return import(moduleId);
      }

      window.PUBLIC_URL = '/viewer/';
    </script>
    <script defer src="/viewer/app.bundle.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>
`;

test('moves each inline script to a file, in order, and keeps the others', () => {
  const { files, html } = externalizeInlineScripts(OHIF_PAGE, '/viewer/');

  assert.deepEqual(
    files.map((file) => file.name),
    ['inline-1.js', 'inline-2.js'],
  );
  assert.match(files[0].content, /^console\.time\('scriptToView'\);\s+window\.PUBLIC_URL = '\/viewer\/';\n$/m);
  assert.match(files[1].content, /function browserImportFunction\(moduleId\) \{\s+return import\(moduleId\);\s+\}/);
  assert.match(files[1].content, /window\.PUBLIC_URL = '\/viewer\/';\n$/);
  assert.equal(inlineScriptsLeft(html), 0);

  // Same order in the page: boot script, config, service worker, helper, bundle.
  const order = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, [
    '/viewer/inline-1.js',
    '/viewer/app-config.js',
    '/viewer/init-service-worker.js',
    '/viewer/inline-2.js',
    '/viewer/app.bundle.js',
  ]);
  assert.match(html, /<link rel="manifest" href="\/viewer\/manifest\.json" \/>/);
});

test('leaves a page with no inline script alone', () => {
  const page = '<html><head><script src="/a.js"></script></head></html>';

  const { files, html } = externalizeInlineScripts(page, '/viewer/');

  assert.deepEqual(files, []);
  assert.equal(html, page);
});

test('refuses an inline script that is not a classic one', () => {
  assert.throws(
    () => externalizeInlineScripts('<script type="importmap">{"imports":{}}</script>', '/viewer/'),
    /importmap/,
  );
});

test('needs a public URL with its two slashes', () => {
  assert.throws(() => externalizeInlineScripts('<html></html>', 'viewer'));
  assert.throws(() => externalizeInlineScripts('<html></html>', '/viewer'));
});

test('counts the inline scripts left, whatever the spelling of the tag', () => {
  assert.equal(inlineScriptsLeft('<SCRIPT>alert(1)</SCRIPT>'), 1);
  assert.equal(inlineScriptsLeft('<script src="/a.js"></script>'), 0);
  assert.equal(inlineScriptsLeft('<script>  </script>'), 0);
});

test('the command writes the files and the page, and fails when there is nothing to move', () => {
  const folder = mkdtempSync(join(tmpdir(), 'viewer-dist-'));
  const tool = join(dirname(fileURLToPath(import.meta.url)), 'externalize-inline-scripts.mjs');
  try {
    writeFileSync(join(folder, 'index.html'), OHIF_PAGE);
    execFileSync(process.execPath, [tool, folder, '/viewer/'], { stdio: 'pipe' });

    assert.equal(inlineScriptsLeft(readFileSync(join(folder, 'index.html'), 'utf8')), 0);
    assert.match(readFileSync(join(folder, 'inline-1.js'), 'utf8'), /scriptToView/);
    assert.match(readFileSync(join(folder, 'inline-2.js'), 'utf8'), /browserImportFunction/);

    // Run again: nothing is left to move, which is a failure.
    assert.throws(() => execFileSync(process.execPath, [tool, folder, '/viewer/'], { stdio: 'pipe' }));
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
});
