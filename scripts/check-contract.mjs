// The sync contract has two copies: packages/core (here) and
// backend/hadithsearch/hadith/sync (website repo). The server builds the
// snapshot from its copy, the app migrates and searches with this one, so
// they must not drift. Run with the website repo checked out next to this one
// (../hadithsearch) or pass its path: node scripts/check-contract.mjs <path>.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const site = resolve(process.argv[2] ?? '../hadithsearch');
const sync = resolve(site, 'backend/hadithsearch/hadith/sync');
if (!existsSync(sync)) {
  console.log(`skip: ${sync} not found (website repo not checked out next to this one)`);
  process.exit(0);
}
const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const cases = (p) => JSON.stringify(JSON.parse(readFileSync(p, 'utf8')).cases);
let failed = false;
if (lf('packages/core/schema.sql') !== lf(resolve(sync, 'schema.sql'))) {
  console.error('schema.sql differs from the backend copy');
  failed = true;
}
if (cases('packages/core/fixtures/normalize.json') !== cases(resolve(sync, 'normalize_fixture.json'))) {
  console.error('normaliser fixture differs from the backend copy');
  failed = true;
}
console.log(failed ? 'contract: MISMATCH' : 'contract: schema.sql and normaliser fixture match the backend');
process.exit(failed ? 1 : 0);
