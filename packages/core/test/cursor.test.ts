import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCursor, isCaughtUp, parseCursor } from '../src/sync/cursor.js';
import { compareVersions } from '../src/sync/version.js';

test('cursor round trip', () => {
  const c = parseCursor('1761659695655|مقدمہ|0');
  assert.deepEqual(c, { updatedMs: 1761659695655, slug: 'مقدمہ', deletedMs: 0 });
  assert.equal(formatCursor(c), '1761659695655|مقدمہ|0');
  assert.deepEqual(parseCursor(''), { updatedMs: 0, slug: '', deletedMs: 0 });
  assert.equal(formatCursor(parseCursor(null)), '');
});

test('invalid cursors throw', () => {
  for (const bad of ['abc', '1|a|b', '-1|x|0', '1|2|3|4']) {
    assert.throws(() => parseCursor(bad), /invalid cursor/);
  }
});

test('isCaughtUp compares strings', () => {
  assert.equal(isCaughtUp(null, ''), true);
  assert.equal(isCaughtUp('1|a|0', '1|a|0'), true);
  assert.equal(isCaughtUp('1|a|0', '2|a|0'), false);
});

test('compareVersions', () => {
  assert.ok(compareVersions('1.0.0', '1.0.0') === 0);
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.ok(compareVersions('2', '1.9') > 0);
});
