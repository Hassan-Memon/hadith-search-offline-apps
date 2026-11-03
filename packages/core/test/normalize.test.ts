import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalize, normalizeWithMap, queryTokens } from '../src/normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(here, '../../fixtures/normalize.json'), 'utf8')) as {
  cases: [string, string][];
};

test('normalize passes every fixture case', () => {
  for (const [input, expected] of fixture.cases) {
    assert.equal(normalize(input), expected, `normalize(${JSON.stringify(input)})`);
  }
});

test('normalizeWithMap produces the same text and a valid index map', () => {
  for (const [input] of fixture.cases) {
    const { text, map } = normalizeWithMap(input);
    assert.equal(text, normalize(input), `map text for ${JSON.stringify(input)}`);
    assert.equal(map.length, text.length);
    for (const index of map) {
      assert.ok(index >= 0 && index < Math.max(1, input.length));
    }
  }
});

test('normalizeWithMap maps back into the original (harakat kept in the original)', () => {
  const original = 'یہ نَمَاز کا بیان ہے';
  const { text, map } = normalizeWithMap(original);
  const at = text.indexOf('نماز');
  assert.ok(at >= 0);
  const start = map[at]!;
  const end = map[at + 'نماز'.length - 1]! + 1;
  assert.equal(original.slice(start, end), 'نَمَاز');
});

test('queryTokens strips punctuation and empty tokens', () => {
  assert.deepEqual(queryTokens('  نمازِ، جنازہ!  '), ['نماز', 'جنازہ']);
  assert.deepEqual(queryTokens('...'), []);
});
