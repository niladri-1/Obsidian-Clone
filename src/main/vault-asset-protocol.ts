import fs from 'node:fs/promises';
import path from 'node:path';
import { protocol } from 'electron';
import { decodeVaultPathname, extname } from '../shared/paths';
import { resolveInVault } from './vault/paths';

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export function registerVaultScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'vaultfile',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ]);
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function handleVaultProtocol(getRoot: () => string | null): void {
  protocol.handle('vaultfile', async (request) => {
    try {
      const root = getRoot();
      if (!root) return notFound();

      const url = new URL(request.url);
      if (url.hostname !== 'vault') return notFound();

      const relative = decodeVaultPathname(url.pathname);
      if (!relative) return notFound();

      const absolute = await resolveInVault(root, relative, { forUser: true });
      const stat = await fs.stat(absolute);
      if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) return notFound();

      const mime = MIME_TYPES[extname(absolute).toLowerCase()];
      if (!mime) return notFound();

      const data = await fs.readFile(absolute);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(data.byteLength),
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        },
      });
    } catch {
      return notFound();
    }
  });
}

export function mimeForPath(file: string): string | null {
  return MIME_TYPES[extname(path.normalize(file)).toLowerCase()] ?? null;
}
