// node --test viewer/build-info.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { currentStamp, isViewerBuilt, OHIF_COMMIT, PUBLIC_URL, STAMP_NAME, writeStamp } from './build-info.mjs';

describe('isViewerBuilt', () => {
  let dist;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'viewer-stamp-'));
  });
  afterEach(() => rmSync(dist, { force: true, recursive: true }));

  const stamp = (value) => writeFileSync(join(dist, STAMP_NAME), typeof value === 'string' ? value : JSON.stringify(value));
  const index = () => writeFileSync(join(dist, 'index.html'), '<title>OHIF</title>');

  it('is false when nothing is built', () => {
    assert.equal(isViewerBuilt(join(dist, 'missing')), false);
    assert.equal(isViewerBuilt(dist), false);
  });

  it('is false for a build with no stamp: one that was interrupted, or from before the stamp', () => {
    index();

    assert.equal(isViewerBuilt(dist), false);
  });

  it('is false for a stamp without an index (the build was emptied)', () => {
    stamp(currentStamp());

    assert.equal(isViewerBuilt(dist), false);
  });

  it('is true for the build the repository asks for', () => {
    index();
    writeStamp(dist);

    assert.equal(isViewerBuilt(dist), true);
  });

  it('is false for another OHIF commit, another base path or another version', () => {
    index();
    for (const change of [{ commit: 'f'.repeat(40) }, { publicUrl: '/other/' }, { version: '0.0.1' }]) {
      stamp({ ...currentStamp(), ...change });
      assert.equal(isViewerBuilt(dist), false, JSON.stringify(change));
    }
  });

  it('is false for a stamp that cannot be read', () => {
    index();
    for (const content of ['', '{not json', 'null', '[]']) {
      stamp(content);
      assert.equal(isViewerBuilt(dist), false, content);
    }
  });

  it('stamps what the Dockerfile builds', () => {
    assert.deepEqual(currentStamp(), { commit: OHIF_COMMIT, publicUrl: PUBLIC_URL, version: '3.13.13' });
    assert.equal(PUBLIC_URL, '/viewer/');
  });
});
