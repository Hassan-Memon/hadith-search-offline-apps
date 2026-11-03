import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@assets': fileURLToPath(new URL('../../packages/assets', import.meta.url)) },
  },
  // sqlite-wasm loads its .wasm next to its own module; pre-bundling breaks that.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: {
    port: 5173,
    // Local development: the website (next start on :3000) serves /api/sync/*.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { target: 'es2022' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'تحقیقاتِ حدیث',
        short_name: 'تحقیقاتِ حدیث',
        description: 'غیر معتبر روایات اور علومِ حدیث کا تحقیقی سرچ انجن — انٹرنیٹ کے بغیر بھی۔',
        lang: 'ur',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1f2a30',
        background_color: '#f3f6f7',
        categories: ['books', 'education', 'reference'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell, small fonts, the sqlite wasm and the تعارف scans are
        // cached on install. Jameel Noori (5 MB) is cached the first time the
        // reader picks it. Hadith data never goes through here: it lives in
        // SQLite and is updated by the sync engine.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,wasm}'],
        globIgnores: ['**/Jameel_*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
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
