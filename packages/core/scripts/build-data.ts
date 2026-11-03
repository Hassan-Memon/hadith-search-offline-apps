// CLI for the data builder.
//
//   node dist/scripts/build-data.js --site https://tehqeqatehadees.com \
//        --out ../../apps/web/dist/data [--prev https://app.tehqeqatehadees.com/data/]
import { buildData } from '../src/build/data.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const site = arg('site') ?? 'https://tehqeqatehadees.com';
const out = arg('out');
const prev = arg('prev') || undefined;
if (!out) {
  console.error('usage: build-data --site <url> --out <dir> [--prev <published data url>]');
  process.exit(2);
}

const started = Date.now();
const result = await buildData({ site, outDir: out, prevBase: prev, log: (m) => console.log(m) });
console.log(JSON.stringify({ ...result, seconds: Math.round((Date.now() - started) / 1000) }));
