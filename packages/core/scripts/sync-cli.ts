// Node CLI: sync a local SQLite file from a sync API. Used to verify the
// backend end to end and as the reference snapshot installer.
//
//   node dist/scripts/sync-cli.js --db ./hadith.sqlite --base http://localhost:3000/api/sync [--search "نماز"]
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

import { NodeSqliteAdapter } from '../src/adapters/node.js';
import { countHadith, getSyncState, listBooks } from '../src/db/repo.js';
import { searchHadith } from '../src/search.js';
import { createHttpApi } from '../src/sync/api.js';
import { sync, type SnapshotInstaller } from '../src/sync/engine.js';
import type { SnapshotInfo } from '../src/types.js';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const dbPath = resolve(arg('db', './hadith.sqlite')!);
const base = arg('base', 'http://localhost:3000/api/sync')!;
const site = arg('site');
const query = arg('search');
const noSnapshot = process.argv.includes('--no-snapshot');

await mkdir(dirname(dbPath), { recursive: true });
const adapter = new NodeSqliteAdapter(dbPath);

/** Download → verify sha256 → gunzip to a temp file → swap → reopen. */
const installer: SnapshotInstaller = {
  async install(snapshot: SnapshotInfo, onProgress) {
    const res = await fetch(snapshot.url);
    if (!res.ok || !res.body) throw new Error(`snapshot download failed: ${res.status}`);
    const tmpGz = `${dbPath}.download.gz`;
    const tmpDb = `${dbPath}.download`;
    const hash = createHash('sha256');
    let received = 0;
    const counted = Readable.fromWeb(res.body as never).on('data', (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      if (snapshot.bytes) onProgress(Math.min(1, received / snapshot.bytes));
    });
    await pipeline(counted, createWriteStream(tmpGz));
    const digest = hash.digest('hex');
    if (digest !== snapshot.sha256.toLowerCase()) {
      await rm(tmpGz, { force: true });
      throw new Error(`snapshot checksum mismatch: ${digest} != ${snapshot.sha256}`);
    }
    const { createReadStream } = await import('node:fs');
    await pipeline(createReadStream(tmpGz), createGunzip(), createWriteStream(tmpDb));
    await rm(tmpGz, { force: true });
    adapter.close();
    await rm(`${dbPath}-wal`, { force: true });
    await rm(`${dbPath}-shm`, { force: true });
    await rename(tmpDb, dbPath);
    adapter.reopen();
  },
};

const api = createHttpApi({ syncBaseUrl: base, siteBaseUrl: site, appVersion: 'cli' });
const started = Date.now();
const result = await sync({
  db: adapter,
  api,
  site: site ? api : undefined,
  installer: noSnapshot ? undefined : installer,
  appVersion: '1.0.0',
  onProgress: (p) => {
    const pct = p.fraction !== undefined ? ` ${Math.round(p.fraction * 100)}%` : '';
    process.stdout.write(`\r${p.phase}${pct}${p.applied !== undefined ? ` applied=${p.applied}` : ''}${p.message ? ` ${p.message}` : ''}      `);
  },
});
process.stdout.write('\n');
console.log(JSON.stringify(result));
console.log('hadith rows:', await countHadith(adapter));
console.log('state:', await getSyncState(adapter));
console.log('books:', (await listBooks(adapter)).length);
console.log('db bytes:', (await stat(dbPath)).size, 'elapsed ms:', Date.now() - started);
if (query) {
  const r = await searchHadith(adapter, query, { pageSize: 5 });
  console.log(`search "${query}": total ${r.total}`);
  for (const h of r.hits) console.log(` [tier ${h.tier}] ${h.slug} — ${h.snippet.slice(0, 80)}`);
}
adapter.close();
