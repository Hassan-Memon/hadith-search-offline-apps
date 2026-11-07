// Snapshot installer for the browser: download with progress, verify the
// sha256 the manifest promises, gunzip with the built-in DecompressionStream,
// and hand the database file to the SQLite worker.
import type { SnapshotInfo, SnapshotInstaller } from '@tehqeqat/core';

import type { DbSession } from '../db/client';

async function download(url: string, expected: number, onProgress: (f: number) => void): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`snapshot download failed (${res.status})`);
  const total = Number(res.headers.get('Content-Length')) || expected || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total) onProgress(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Installer bound to one sync's database session: if the database moved to
 * another window during the download, the import is refused instead of
 * overwriting what that window did meanwhile.
 */
export function browserInstaller(session: DbSession): SnapshotInstaller {
  return {
    async install(snapshot: SnapshotInfo, onProgress) {
      const gz = await download(snapshot.url, snapshot.bytes, onProgress);
      const digest = await sha256Hex(gz);
      if (digest !== snapshot.sha256.toLowerCase()) throw new Error('snapshot checksum mismatch');
      const file = await gunzip(gz);
      await session.importDb(file);
    },
  };
}
