import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';

import { NodeSqliteAdapter } from '../src/adapters/node.js';
import { buildData } from '../src/build/data.js';
import { countHadith, getHadithBySlug } from '../src/db/repo.js';
import { searchHadith } from '../src/search.js';
import { sync, type SnapshotInstaller } from '../src/sync/engine.js';
import { createStaticApi, type StaticManifest } from '../src/sync/static.js';
import { slimHtml } from '../src/slim.js';
import { getSetting } from '../src/db/repo.js';

const SITE = 'https://site.test';
const PUB = 'https://pub.test/data/';
const T0 = '2026-10-28T13:54:55.655431+00:00';

interface FakeDoc {
  id: string;
  slug: string;
  title: string;
  book: string;
  html_content: string;
  raw_content: string;
  updated_at: string;
}

function makeDocs(n: number): FakeDoc[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id${i}`,
    slug: `slug-${i}`,
    title: `<p class="MsoNormal" dir="RTL"><span>عنوان ${i}</span></p>`,
    book: 'کتاب',
    html_content: JSON.stringify([{ heading: '<p dir="RTL">تفصیل</p>', content: `<p class="MsoNormal">متن ${i}</p>` }]),
    raw_content: `متن نمبر ${i}`,
    updated_at: T0,
  }));
}

/** Fake website + fake published directory, served through one fetch. */
function fakeFetch(site: { docs: FakeDoc[]; calls: string[] }, pub: { dir: string | null }): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    site.calls.push(url);
    if (url.startsWith(SITE)) {
      const path = decodeURIComponent(url.slice(SITE.length));
      const list = /^\/api\/all-hadees\/(\d+)$/.exec(path);
      if (list) {
        const page = Number(list[1]);
        const data = site.docs.slice((page - 1) * 10, page * 10).map(({ id, slug, title, book, updated_at }) => ({
          id,
          slug,
          title,
          book,
          updated_at,
        }));
        return Response.json({ total_records: site.docs.length, data });
      }
      const detail = /^\/api\/hadees-detail\/(.+)$/.exec(path);
      if (detail) {
        const doc = site.docs.find((d) => d.id === detail[1]);
        return doc
          ? Response.json({ ...doc, updated_at: doc.updated_at.replace('+00:00', 'Z'), tags: [doc.book], related: [{ id: 'x' }] })
          : new Response('nf', { status: 404 });
      }
      if (path === '/api/announcements') return Response.json({ announcements: [{ id: 'a1', type: 'text-banner', title: 'اعلان' }] });
      if (path === '/api/files') return Response.json([{ id: 'f1', file: { name: 'Vol-1.pdf', url: 'https://s3/x.pdf' } }]);
      return new Response('nf', { status: 404 });
    }
    if (url.startsWith(PUB)) {
      if (!pub.dir) return new Response('nf', { status: 404 });
      const name = url.slice(PUB.length).split('?')[0]!;
      try {
        return new Response(await readFile(join(pub.dir, name)));
      } catch {
        return new Response('nf', { status: 404 });
      }
    }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
}

test('slimHtml drops Word noise and keeps text, fonts and alignment', () => {
  const word =
    '<p class="MsoNormal" align="center" dir="RTL" style="x"><span class="font-class-Bashar" lang="AR">بسم</span>' +
    '<span dir="LTR"></span><o:p></o:p></p><p class="Arbic"><!--[if !x]--><span>[1]</span><!--[endif]-->' +
    '<a href="file:///D:/a.docx" name="_ftn1"><span class="MsoFootnoteReference">[2]</span></a></p>';
  assert.equal(
    slimHtml(word),
    '<p align="center"><span class="font-class-Bashar">بسم</span></p><p class="Arbic">[1][2]</p>',
  );
});

test('build: full, unchanged, then edit/delete/add; a device follows with snapshot + deltas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tq-build-test-'));
  try {
    const site = { docs: makeDocs(23), calls: [] as string[] };
    const pub = { dir: null as string | null };
    const f = fakeFetch(site, pub);
    const out1 = join(root, 'out1');
    const out2 = join(root, 'out2');
    const out3 = join(root, 'out3');

    // 1. Full build.
    const r1 = await buildData({ site: SITE, prevBase: PUB, outDir: out1, fetch: f });
    assert.equal(r1.fullBuild, true);
    assert.match(r1.cursor, /^\d+:1$/);
    const epoch = r1.cursor.split(':')[0]!;
    assert.equal(r1.total, 23);
    const m1 = JSON.parse(await readFile(join(out1, 'manifest.json'), 'utf8')) as StaticManifest;
    assert.deepEqual(m1.builds, []);
    assert.equal(JSON.parse(await readFile(join(out1, 'announcements.json'), 'utf8'))[0].id, 'a1');
    // The snapshot holds slimmed HTML and no raw_content, and is searchable.
    const snapDb = join(root, 'snap.sqlite');
    await writeFile(snapDb, gunzipSync(await readFile(join(out1, m1.snapshot!.url))));
    const snap = new NodeSqliteAdapter(snapDb);
    const row = await getHadithBySlug(snap, 'slug-3');
    assert.equal(row?.title_html, '<p>عنوان 3</p>');
    assert.equal(row?.raw_content, '');
    assert.equal((await searchHadith(snap, 'متن نمبر 3')).hits[0]?.slug, 'slug-3');
    snap.close();

    // 2. Nothing changed: only list pages are fetched, snapshot reused.
    pub.dir = out1;
    site.calls.length = 0;
    const r2 = await buildData({ site: SITE, prevBase: PUB, outDir: out2, fetch: f });
    assert.equal(r2.cursor, r1.cursor);
    assert.equal(r2.publish, false);
    assert.equal(r2.reusedSnapshot, true);
    assert.equal(r2.snapshot, r1.snapshot);
    assert.equal(site.calls.filter((u) => u.includes('/hadees-detail/')).length, 0);

    // A device bootstraps from build 2's output.
    const device = new NodeSqliteAdapter(join(root, 'device.sqlite'));
    const installer: SnapshotInstaller = {
      async install(snapshot) {
        const bytes = new Uint8Array(await (await f(snapshot.url)).arrayBuffer());
        device.close();
        await writeFile(join(root, 'device.sqlite'), gunzipSync(bytes));
        await rm(join(root, 'device.sqlite-wal'), { force: true });
        await rm(join(root, 'device.sqlite-shm'), { force: true });
        device.reopen();
      },
    };
    pub.dir = out2;
    const api = createStaticApi({ baseUrl: PUB, fetch: f });
    const s1 = await sync({ db: device, api, site: api, installer, appVersion: '1.0.0' });
    assert.equal(s1.status, 'ok');
    assert.equal(await countHadith(device), 23);

    // 3. Edit id3, delete id5, add id99.
    site.docs[3] = { ...site.docs[3]!, raw_content: 'ترمیم شدہ متن', updated_at: '2026-11-04T10:00:00.000000+00:00' };
    site.docs.splice(5, 1);
    site.docs.push({ ...makeDocs(1)[0]!, id: 'id99', slug: 'slug-99', raw_content: 'نئی روایت' });
    const r3 = await buildData({ site: SITE, prevBase: PUB, outDir: out3, fetch: f });
    assert.equal(r3.cursor, `${epoch}:2`);
    assert.equal(r3.changed, 2);
    assert.equal(r3.deleted, 1);
    assert.equal(r3.reusedSnapshot, false);
    const files3 = await readdir(out3);
    assert.ok(files3.includes(`changes-${epoch}-2.json`));

    // The device catches up with one change file, no snapshot.
    pub.dir = out3;
    const s2 = await sync({ db: device, api, site: api, installer, appVersion: '1.0.0' });
    assert.equal(s2.status, 'ok');
    if (s2.status === 'ok') {
      assert.equal(s2.usedSnapshot, false);
      assert.equal(s2.applied, 2);
      assert.equal(s2.deleted, 1);
    }
    assert.equal(await countHadith(device), 23);
    assert.equal((await searchHadith(device, 'ترمیم شدہ')).hits[0]?.slug, 'slug-3');
    assert.equal(await getHadithBySlug(device, 'slug-5'), undefined);
    assert.ok(await getHadithBySlug(device, 'slug-99'));
    device.close();

    // 4. Safety: a list that suddenly shrinks is not published.
    pub.dir = out3;
    site.docs.splice(0, 20);
    await assert.rejects(
      buildData({ site: SITE, prevBase: PUB, outDir: join(root, 'out4'), fetch: f }),
      /refusing to publish/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('static api: needsSnapshot when the device is older than the kept change files', async () => {
  const api = createStaticApi({
    baseUrl: PUB,
    fetch: (async () =>
      Response.json({
        epoch: 'E',
        latest_cursor: 'E:9',
        builds: [
          { cursor: 'E:7', file: 'changes-E-7.json', items: 1, deleted: 0 },
          { cursor: 'E:8', file: 'changes-E-8.json', items: 1, deleted: 0 },
          { cursor: 'E:9', file: 'changes-E-9.json', items: 1, deleted: 0 },
        ],
        snapshot: null,
        counts: { hadith: 1 },
      })) as typeof fetch,
  });
  const manifest = await api.getManifest();
  assert.equal(api.needsSnapshot!(null, manifest), true);
  assert.equal(api.needsSnapshot!('E:9', manifest), false);
  assert.equal(api.needsSnapshot!('E:6', manifest), false); // needs 7, 8, 9: all kept
  assert.equal(api.needsSnapshot!('E:5', manifest), true); // 6 is gone
  assert.equal(api.needsSnapshot!('OLD:12', manifest), true); // another epoch
  assert.equal(api.needsSnapshot!('9', manifest), true); // old cursor format
});


/** Run one build into a fresh directory and make it the "published" one. */
async function publishBuild(
  root: string,
  name: string,
  f: typeof fetch,
  pub: { dir: string | null },
  extra: Partial<Parameters<typeof buildData>[0]> = {},
) {
  const outDir = join(root, name);
  const result = await buildData({ site: SITE, prevBase: PUB, outDir, fetch: f, ...extra });
  pub.dir = outDir;
  return result;
}

test('a timestamp-only change is not sent to devices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tq-build-ts-'));
  try {
    const site = { docs: makeDocs(12), calls: [] as string[] };
    const pub = { dir: null as string | null };
    const f = fakeFetch(site, pub);
    const r1 = await publishBuild(root, 'b1', f, pub);
    site.docs[4] = { ...site.docs[4]!, updated_at: '2026-11-05T09:00:00.000000+00:00' };
    const r2 = await publishBuild(root, 'b2', f, pub);
    assert.equal(r2.changed, 0);
    assert.equal(r2.timestampOnly, 1);
    assert.equal(r2.cursor, r1.cursor); // devices have nothing to do
    // The new timestamp is remembered: the next run fetches nothing.
    site.calls.length = 0;
    const r3 = await publishBuild(root, 'b3', f, pub);
    assert.equal(r3.timestampOnly, 0);
    assert.equal(site.calls.filter((u) => u.includes('/hadees-detail/')).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses to publish invalid documents or many deletions at once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tq-build-guard-'));
  try {
    const site = { docs: makeDocs(40), calls: [] as string[] };
    const pub = { dir: null as string | null };
    const f = fakeFetch(site, pub);
    await publishBuild(root, 'b1', f, pub);

    // A document without a title (e.g. the website changed its response).
    site.docs[2] = { ...site.docs[2]!, title: '', updated_at: '2026-11-05T09:00:00.000000+00:00' };
    await assert.rejects(buildData({ site: SITE, prevBase: PUB, outDir: join(root, 'x1'), fetch: f }), /failed validation/);
    site.docs[2] = { ...site.docs[2]!, title: '<p>ٹھیک</p>' };

    // Ten disappear in one run: more than the limit of 5.
    site.docs.splice(10, 10);
    await assert.rejects(buildData({ site: SITE, prevBase: PUB, outDir: join(root, 'x2'), fetch: f }), /deletions in one run/);
    const ok = await publishBuild(root, 'b2', f, pub, { allowMassDelete: true });
    assert.equal(ok.deleted, 10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an unreadable published build stops the run instead of starting over', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tq-build-5xx-'));
  try {
    const site = { docs: makeDocs(5), calls: [] as string[] };
    const inner = fakeFetch(site, { dir: null });
    const failing = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith(PUB)) return new Response('oops', { status: 503 });
      return inner(input);
    }) as typeof fetch;
    await assert.rejects(
      buildData({ site: SITE, prevBase: PUB, outDir: join(root, 'x'), fetch: failing }),
      /cannot read the published build/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('after a rebuild from scratch, a device with a higher old cursor reinstalls the snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tq-build-epoch-'));
  try {
    const site = { docs: makeDocs(15), calls: [] as string[] };
    const pub = { dir: null as string | null };
    const f = fakeFetch(site, pub);
    await publishBuild(root, 'b1', f, pub);
    // Three edits so the first epoch reaches build 4.
    for (let i = 0; i < 3; i++) {
      site.docs[i] = { ...site.docs[i]!, raw_content: `ترمیم ${i}`, updated_at: `2026-11-0${i + 5}T09:00:00.000000+00:00` };
      await publishBuild(root, `e${i}`, f, pub);
    }
    const devicePath = join(root, 'device.sqlite');
    const device = new NodeSqliteAdapter(devicePath);
    const installs: string[] = [];
    const installer: SnapshotInstaller = {
      async install(snapshot) {
        installs.push(snapshot.cursor);
        const bytes = new Uint8Array(await (await f(snapshot.url)).arrayBuffer());
        device.close();
        await writeFile(devicePath, gunzipSync(bytes));
        await rm(`${devicePath}-wal`, { force: true });
        await rm(`${devicePath}-shm`, { force: true });
        device.reopen();
      },
    };
    const api = createStaticApi({ baseUrl: PUB, fetch: f });
    await sync({ db: device, api, site: api, installer, appVersion: '1.0.0' });
    assert.match(installs[0]!, /:4$/);

    // The published data disappears; the next run rebuilds from scratch (new
    // epoch, counter back to 1), then one more edit makes it build 2.
    pub.dir = null;
    await new Promise((r) => setTimeout(r, 5));
    await publishBuild(root, 'n1', f, pub);
    site.docs[9] = { ...site.docs[9]!, raw_content: 'نیا دور', updated_at: '2026-11-09T09:00:00.000000+00:00' };
    const n2 = await publishBuild(root, 'n2', f, pub);
    assert.match(n2.cursor, /:2$/);

    // The device's cursor ends in 4, "higher" than 2, but from the old epoch.
    const result = await sync({ db: device, api, site: api, installer, appVersion: '1.0.0' });
    assert.equal(result.status, 'ok');
    assert.equal(installs.length, 2);
    assert.equal((await searchHadith(device, 'نیا دور')).hits[0]?.slug, 'slug-9');
    assert.ok(await getSetting(device, 'data_generated_at'));
    device.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('static data: a failed snapshot is an error, not a partial sync', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tq-build-fail-'));
  try {
    const site = { docs: makeDocs(5), calls: [] as string[] };
    const pub = { dir: null as string | null };
    const f = fakeFetch(site, pub);
    await publishBuild(root, 'b1', f, pub);
    const device = new NodeSqliteAdapter(':memory:');
    const api = createStaticApi({ baseUrl: PUB, fetch: f });
    const result = await sync({
      db: device,
      api,
      installer: {
        install: async () => {
          throw new Error('network');
        },
      },
      appVersion: '1.0.0',
    });
    assert.equal(result.status, 'error');
    assert.equal(await countHadith(device), 0);
    device.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
