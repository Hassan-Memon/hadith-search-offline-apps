import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NodeSqliteAdapter } from '../src/adapters/node.js';
import {
  countHadith,
  deleteHadith,
  getSyncState,
  listBookmarks,
  listHistory,
  recordVisit,
  toggleBookmark,
  upsertHadith,
} from '../src/db/repo.js';
import type { SyncApi } from '../src/sync/api.js';
import { sync } from '../src/sync/engine.js';
import { searchHadith } from '../src/search.js';
import type { ChangesPage, HadithDoc, Manifest } from '../src/types.js';

const T0 = Date.parse('2026-10-28T13:54:55.655Z');

function mkDoc(i: number, updatedMs = T0): HadithDoc {
  return {
    id: `id${i}`,
    slug: `slug-${String(i).padStart(3, '0')}`,
    title: `<p>عنوان ${i}</p>`,
    book: 'کتاب',
    html_content: '[]',
    raw_content: `متن نمبر ${i}`,
    tags: ['کتاب'],
    updated_at: new Date(updatedMs).toISOString(),
  };
}

/** In-memory server implementing the contract over a list of docs + tombstones. */
function fakeServer(docs: HadithDoc[], tombstones: { id: string; slug: string; deleted_at: string }[] = []) {
  const calls: string[] = [];
  const sorted = () =>
    [...docs].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || a.slug.localeCompare(b.slug));
  const latest = (): string => {
    const s = sorted();
    const last = s[s.length - 1];
    const delMs = tombstones.reduce((m, t) => Math.max(m, Date.parse(t.deleted_at)), 0);
    return last ? `${Date.parse(last.updated_at)}|${last.slug}|${delMs}` : '';
  };
  const api: SyncApi = {
    async getManifest(): Promise<Manifest> {
      calls.push('manifest');
      return {
        api_version: 1,
        schema_version: 1,
        min_app_version: '1.0.0',
        generated_at: new Date().toISOString(),
        latest_cursor: latest(),
        counts: { hadith: docs.length },
        snapshot: null,
      };
    },
    async getChanges(since, limit): Promise<ChangesPage> {
      calls.push(`changes:${since}:${limit}`);
      const [uMs, uSlug, dMs] = since ? since.split('|') : ['0', '', '0'];
      const items = sorted()
        .filter((d) => {
          const ms = Date.parse(d.updated_at);
          return ms > Number(uMs) || (ms === Number(uMs) && d.slug > (uSlug ?? ''));
        })
        .slice(0, limit);
      const deleted = tombstones.filter((t) => Date.parse(t.deleted_at) > Number(dMs ?? 0)).slice(0, 1000);
      const lastItem = items[items.length - 1];
      const nextU = lastItem ? `${Date.parse(lastItem.updated_at)}|${lastItem.slug}` : `${uMs}|${uSlug}`;
      const nextD = deleted.length ? Date.parse(deleted[deleted.length - 1]!.deleted_at) : Number(dMs ?? 0);
      return {
        items,
        deleted,
        next_cursor: `${nextU}|${nextD}`,
        has_more: items.length === limit || deleted.length === 1000,
      };
    },
  };
  return { api, calls, docs, tombstones };
}

test('fresh device pages through all changes (same updated_at, slug tie-break)', async () => {
  const docs = Array.from({ length: 23 }, (_, i) => mkDoc(i));
  const server = fakeServer(docs);
  const db = new NodeSqliteAdapter(':memory:');
  const result = await sync({ db, api: server.api, appVersion: '1.0.0', pageSize: 10 });
  assert.equal(result.status, 'ok');
  assert.equal(await countHadith(db), 23);
  const state = await getSyncState(db);
  assert.equal(state.cursor, `${T0}|slug-022|0`);
  assert.equal(server.calls.filter((c) => c.startsWith('changes')).length, 3);
  // Second run: nothing to do, no /changes call.
  const again = await sync({ db, api: server.api, appVersion: '1.0.0' });
  assert.equal(again.status, 'up-to-date');
  assert.equal(server.calls.filter((c) => c.startsWith('changes')).length, 3);
  db.close();
});

test('edit and delete arrive as a delta', async () => {
  const docs = Array.from({ length: 5 }, (_, i) => mkDoc(i));
  const server = fakeServer(docs);
  const db = new NodeSqliteAdapter(':memory:');
  await sync({ db, api: server.api, appVersion: '1.0.0' });

  // An admin edits id2 (new updated_at) and deletes id4.
  const later = T0 + 60_000;
  server.docs[2] = { ...mkDoc(2, later), raw_content: 'ترمیم شدہ متن' };
  server.docs.splice(4, 1);
  server.tombstones.push({ id: 'id4', slug: 'slug-004', deleted_at: new Date(later + 1).toISOString() });

  const result = await sync({ db, api: server.api, appVersion: '1.0.0' });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.applied, 1);
    assert.equal(result.deleted, 1);
  }
  assert.equal(await countHadith(db), 4);
  // raw_content is indexed, not stored: the edit is findable by its new words.
  const hits = await searchHadith(db, 'ترمیم شدہ');
  assert.deepEqual(hits.hits.map((h) => h.id), ['id2']);
  assert.equal((await getSyncState(db)).cursor, `${later}|slug-002|${later + 1}`);
  db.close();
});

test('update-required when the app is older than min_app_version', async () => {
  const server = fakeServer([mkDoc(1)]);
  const api: SyncApi = {
    ...server.api,
    getManifest: async () => ({ ...(await server.api.getManifest()), min_app_version: '2.0.0' }),
  };
  const db = new NodeSqliteAdapter(':memory:');
  const result = await sync({ db, api, appVersion: '1.5.0' });
  assert.equal(result.status, 'update-required');
  assert.equal(await countHadith(db), 0);
  db.close();
});

test('snapshot installer is used on a fresh device, deltas still applied after it', async () => {
  const docs = Array.from({ length: 6 }, (_, i) => mkDoc(i));
  const server = fakeServer(docs);
  const db = new NodeSqliteAdapter(':memory:');
  const snapshotCursor = `${T0}|slug-003|0`;
  const api: SyncApi = {
    ...server.api,
    getManifest: async () => ({
      ...(await server.api.getManifest()),
      snapshot: {
        url: 'http://x/snapshot',
        bytes: 1,
        sha256: 'deadbeef',
        built_at: new Date().toISOString(),
        cursor: snapshotCursor,
        schema_version: 1,
      },
    }),
  };
  let installed = 0;
  const installer = {
    // Pretend the snapshot held the first four documents.
    async install() {
      installed++;
      for (const d of docs.slice(0, 4)) await upsertHadith(db, d);
      await db.run('UPDATE sync_state SET cursor = ? WHERE id = 1', [snapshotCursor]);
    },
  };
  const result = await sync({ db, api, appVersion: '1.0.0', installer });
  assert.equal(installed, 1);
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.usedSnapshot, true);
    assert.equal(result.applied, 2); // the two after the snapshot cursor
  }
  assert.equal(await countHadith(db), 6);
  db.close();
});

test('bookmarks and history survive a snapshot install that replaces the file', async () => {
  const docs = Array.from({ length: 4 }, (_, i) => mkDoc(i));
  const server = fakeServer(docs);
  const db = new NodeSqliteAdapter(':memory:');
  await sync({ db, api: server.api, appVersion: '1.0.0' });
  await toggleBookmark(db, 'id1');
  await toggleBookmark(db, 'id3');
  await recordVisit(db, 'id2');

  const cursor = `${T0}|slug-003|0`;
  const api: SyncApi = {
    ...server.api,
    getManifest: async () => ({
      ...(await server.api.getManifest()),
      snapshot: { url: 'http://x/s', bytes: 1, sha256: 'ab', built_at: '', cursor, schema_version: 1 },
    }),
  };
  const installer = {
    // A new file: no device tables, and id3 was removed on the website.
    async install() {
      await db.exec('DELETE FROM bookmarks; DELETE FROM history;');
      await deleteHadith(db, 'id3');
      await db.run('UPDATE sync_state SET cursor = ? WHERE id = 1', [cursor]);
    },
  };
  const result = await sync({ db, api, appVersion: '1.0.0', installer, forceSnapshot: true });
  assert.equal(result.status, 'ok');
  assert.deepEqual((await listBookmarks(db)).map((h) => h.id), ['id1']);
  assert.deepEqual((await listHistory(db)).map((h) => h.id), ['id2']);
  db.close();
});

test('a failing installer falls back to deltas', async () => {
  const server = fakeServer([mkDoc(1), mkDoc(2)]);
  const api: SyncApi = {
    ...server.api,
    getManifest: async () => ({
      ...(await server.api.getManifest()),
      snapshot: { url: 'u', bytes: 1, sha256: 'x', built_at: '', cursor: '', schema_version: 1 },
    }),
  };
  const db = new NodeSqliteAdapter(':memory:');
  const result = await sync({
    db,
    api,
    appVersion: '1.0.0',
    installer: {
      install: async () => {
        throw new Error('network');
      },
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(await countHadith(db), 2);
  db.close();
});

test('network error is reported, not thrown', async () => {
  const db = new NodeSqliteAdapter(':memory:');
  const result = await sync({
    db,
    api: {
      getManifest: async () => {
        throw new Error('offline');
      },
      getChanges: async () => {
        throw new Error('offline');
      },
    },
    appVersion: '1.0.0',
  });
  assert.equal(result.status, 'error');
  assert.match((await getSyncState(db)).last_result ?? '', /offline/);
  db.close();
});
