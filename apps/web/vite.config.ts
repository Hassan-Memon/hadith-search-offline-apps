import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// "/" for app.tehqeqatehadees.com; the deploy workflow passes "/<repo>/" while
// the site is served from <user>.github.io/<repo>/.
const base = process.env.BASE_PATH || '/';

/**
 * The dev server marks a .gz file as gzip-encoded, so the browser unpacks the
 * snapshot before the app checks its sha256 and the first download fails.
 * GitHub Pages sends it as it is; so does this, for data/*.gz in development.
 */
function rawSnapshots(): Plugin {
  const dir = fileURLToPath(new URL('./public/data/', import.meta.url));
  return {
    name: 'raw-snapshots',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = /\/data\/([\w.-]+\.gz)(?:\?|$)/.exec(req.url ?? '')?.[1];
        if (!name || !existsSync(dir + name)) return next();
        res.setHeader('Content-Type', 'application/gzip');
        createReadStream(dir + name).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@assets': fileURLToPath(new URL('../../packages/assets', import.meta.url)) },
  },
  // sqlite-wasm loads its .wasm next to its own module; pre-bundling breaks that.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: { port: 5173 },
  build: { target: 'es2022' },
  plugins: [
    rawSnapshots(),
    react(),
    VitePWA({
      // 'prompt': a new version waits instead of reloading the page under the
      // reader; src/update.ts decides when to switch.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: base,
        name: 'تحقیقاتِ حدیث',
        short_name: 'تحقیقاتِ حدیث',
        description: 'غیر معتبر روایات اور علومِ حدیث کا تحقیقی سرچ انجن — انٹرنیٹ کے بغیر بھی۔',
        lang: 'ur',
        dir: 'rtl',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        theme_color: '#25272b',
        background_color: '#fafaf9',
        categories: ['books', 'education', 'reference'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell, small fonts, the sqlite wasm and the تعارف scans are
        // cached on install. Jameel Noori (5 MB) is cached the first time the
        // reader picks it. Hadith data never goes through here: it lives in
        // SQLite and is updated by the sync engine.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,ico,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Data files are fetched by the sync engine, never precached or rewritten.
        globIgnores: ['**/Jameel_*', 'data/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/data\//],
        // Hands over from 1.0, whose pages never tell a waiting version to
        // take over (see public/sw-handoff.js).
        importScripts: ['sw-handoff.js'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
});
