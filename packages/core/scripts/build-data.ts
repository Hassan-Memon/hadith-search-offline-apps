// CLI for the data builder.
//
//   node dist/scripts/build-data.js --site https://tehqeqatehadees.com \
//        --out ../../apps/web/dist/data [--prev https://app.tehqeqatehadees.com/data/] [--allow-deletes]
//
// In GitHub Actions it also writes publish=true|false to $GITHUB_OUTPUT so the
// workflow can skip the deploy when nothing changed.
import { appendFile } from 'node:fs/promises';

import { buildData } from '../src/build/data.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const site = arg('site') ?? 'https://tehqeqatehadees.com';
const out = arg('out');
const prev = arg('prev') || undefined;
const allowMassDelete = process.argv.includes('--allow-deletes');
if (!out) {
  console.error('usage: build-data --site <url> --out <dir> [--prev <published data url>] [--allow-deletes]');
  process.exit(2);
}

const started = Date.now();
const result = await buildData({ site, outDir: out, prevBase: prev, allowMassDelete, log: (m) => console.log(m) });
console.log(JSON.stringify({ ...result, seconds: Math.round((Date.now() - started) / 1000) }));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `publish=${result.publish}\ncursor=${result.cursor}\n`);
}
