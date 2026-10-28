import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { basename } from '../../shared/paths';
import type { IpcErrorCode, ReadFileResult, WriteFileResult } from '../../shared/types';
import { LIMITS } from '../../shared/ipc';

export class FileOpError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FileOpError';
    this.code = code;
  }
}

const recentWrites = new Map<string, number>();
const SELF_WRITE_WINDOW_MS = 2000;

function key(absolute: string): string {
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

export function markSelfWrite(absolute: string): void {
  recentWrites.set(key(path.resolve(absolute)), Date.now() + SELF_WRITE_WINDOW_MS);
  if (recentWrites.size > 4096) {
    const now = Date.now();
    for (const [entry, expiry] of recentWrites) {
      if (expiry < now) recentWrites.delete(entry);
    }
  }
}

export function isRecentSelfWrite(absolute: string): boolean {
  const entry = key(path.resolve(absolute));
  const expiry = recentWrites.get(entry);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    recentWrites.delete(entry);
    return false;
  }
  return true;
}

export function clearSelfWrites(): void {
  recentWrites.clear();
}

async function statOrNull(target: string) {
  try {
    return await fs.stat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function detectEncodingHints(target: string): Promise<{ eol: '\n' | '\r\n'; bom: boolean }> {
  try {
    const handle = await fs.open(target, 'r');
    try {
      const buffer = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const sample = buffer.subarray(0, bytesRead);
      const bom = bytesRead >= 3 && sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf;
      return { eol: sample.includes(Buffer.from('\r\n')) ? '\r\n' : '\n', bom };
    } finally {
      await handle.close();
    }
  } catch {
    return { eol: '\n', bom: false };
  }
}

async function fsyncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return;
  try {
    const handle = await fs.open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is best effort; some filesystems refuse it.
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Durable replace: write a sibling temp file, fsync, rename over the target with bounded retries.
 * The target never contains a partially written payload.
 */
export async function atomicWriteAbsolute(
  target: string,
  content: string,
  options: { eol?: '\n' | '\r\n'; bom?: boolean; mode?: number } = {},
): Promise<void> {
  const payloadBytes = Buffer.byteLength(content, 'utf8');
  if (payloadBytes > LIMITS.maxNoteBytes) {
    throw new FileOpError('TOO_LARGE', 'File exceeds the 5 MB limit');
  }

  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });

  const eol = options.eol ?? '\n';
  const withEol = eol === '\r\n' ? content.replace(/\r?\n/g, '\r\n') : content.replace(/\r\n/g, '\n');
  const data = options.bom ? `\uFEFF${withEol}` : withEol;

  const temp = path.join(directory, `.~${basename(target)}.${randomUUID()}.tmp`);
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(temp, 'wx', options.mode ?? 0o600);
    await handle.writeFile(data, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;

    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await fs.rename(temp, target);
        markSelfWrite(target);
        await fsyncDirectory(directory);
        return;
      } catch (error) {
        lastError = error;
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES' && code !== 'ENOTEMPTY') {
          break;
        }
        await sleep(25 * 2 ** attempt);
      }
    }
    throw lastError;
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // ignore close failures during cleanup
    }
    await fs.unlink(temp).catch(() => undefined);
    if (error instanceof FileOpError) throw error;
    throw new FileOpError(
      'IO_ERROR',
      `Could not write ${basename(target)}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

export async function readTextFile(absolute: string, relative: string): Promise<ReadFileResult> {
  const stat = await statOrNull(absolute);
  if (!stat) throw new FileOpError('NOT_FOUND', `File not found: ${relative}`);
  if (!stat.isFile()) throw new FileOpError('UNSUPPORTED', `Not a file: ${relative}`);
  if (stat.size > LIMITS.maxNoteBytes) {
    throw new FileOpError('TOO_LARGE', 'File exceeds the 5 MB limit');
  }
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absolute);
  } catch (error) {
    throw new FileOpError('IO_ERROR', `Could not read ${relative}`, { cause: error });
  }

  const bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '').replace(/\u0000/g, '');
  const eol: '\n' | '\r\n' = raw.includes('\r\n') ? '\r\n' : '\n';
  return {
    path: relative,
    content: eol === '\r\n' ? raw.replace(/\r\n/g, '\n') : raw,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    eol: eol === '\r\n' ? 'crlf' : 'lf',
    hadBom: bom,
  };
}

export async function writeTextFile(
  absolute: string,
  relative: string,
  content: string,
  expectedMtimeMs?: number,
): Promise<WriteFileResult> {
  const existing = await statOrNull(absolute);
  if (expectedMtimeMs !== undefined) {
    if (!existing) throw new FileOpError('CONFLICT', 'File was removed on disk');
    if (Math.abs(existing.mtimeMs - expectedMtimeMs) > 2) {
      throw new FileOpError('CONFLICT', 'File changed on disk since it was opened');
    }
  }
  const hints = existing ? await detectEncodingHints(absolute) : { eol: '\n' as const, bom: false };
  if (existing && !existing.isFile()) {
    throw new FileOpError('UNSUPPORTED', `Not a file: ${relative}`);
  }
  await atomicWriteAbsolute(absolute, content, { eol: hints.eol, bom: hints.bom });
  const stat = await fs.stat(absolute);
  return { path: relative, mtimeMs: stat.mtimeMs, size: stat.size };
}

export async function pathExists(absolute: string): Promise<boolean> {
  return (await statOrNull(absolute)) !== null;
}

export async function createEntryAbsolute(
  absolute: string,
  kind: 'file' | 'folder',
  content = '',
): Promise<void> {
  if (await pathExists(absolute)) {
    throw new FileOpError('EXISTS', `${basename(absolute)} already exists`);
  }
  if (kind === 'folder') {
    await fs.mkdir(absolute, { recursive: true });
    markSelfWrite(absolute);
    return;
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await atomicWriteAbsolute(absolute, content, { eol: '\n' });
}

export async function renameAbsolute(from: string, to: string): Promise<void> {
  if (await pathExists(to)) {
    const sameEntry =
      process.platform === 'win32' && from.toLowerCase() === to.toLowerCase();
    if (!sameEntry) throw new FileOpError('EXISTS', `${basename(to)} already exists`);
    // Case-only rename on a case-insensitive filesystem goes through a temporary name.
    if (from === to) return;
    const temp = path.join(path.dirname(from), `.~rename-${randomUUID()}`);
    await fs.rename(from, temp);
    try {
      await fs.rename(temp, to);
    } catch (error) {
      await fs.rename(temp, from).catch(() => undefined);
      throw error;
    }
    markSelfWrite(from);
    markSelfWrite(to);
    return;
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.rename(from, to);
  } catch (error) {
    throw new FileOpError('IO_ERROR', `Could not rename: ${(error as Error).message}`, { cause: error });
  }
  markSelfWrite(from);
  markSelfWrite(to);
}

const COPY_ENTRY_LIMIT = 20_000;
const COPY_BYTE_LIMIT = 1024 * 1024 * 1024;

interface CopyState {
  entries: number;
  bytes: number;
}

async function copyRecursive(from: string, to: string, state: CopyState): Promise<void> {
  const stat = await fs.lstat(from);
  if (stat.isSymbolicLink()) {
    throw new FileOpError('UNSUPPORTED', 'Symbolic links cannot be copied');
  }
  if (stat.isDirectory()) {
    await fs.mkdir(to, { recursive: true });
    const entries = await fs.readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      state.entries += 1;
      if (state.entries > COPY_ENTRY_LIMIT) {
        throw new FileOpError('TOO_LARGE', 'Folder contains too many entries to copy');
      }
      const source = path.join(from, entry.name);
      const destination = path.join(to, entry.name);
      const entryStat = await fs.lstat(source);
      if (entryStat.isSymbolicLink()) {
        // Skip links rather than following them out of the vault or recreating them.
        continue;
      }
      if (entryStat.isDirectory()) {
        await copyRecursive(source, destination, state);
      } else if (entryStat.isFile()) {
        state.bytes += entryStat.size;
        if (state.bytes > COPY_BYTE_LIMIT) {
          throw new FileOpError('TOO_LARGE', 'Folder is too large to copy');
        }
        await fs.copyFile(source, destination);
      }
    }
    markSelfWrite(to);
    return;
  }
  if (!stat.isFile()) {
    throw new FileOpError('UNSUPPORTED', 'Only notes, files and folders can be copied');
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  markSelfWrite(to);
}

/** Copies a file or folder to a new path inside the vault without following symlinks. */
export async function copyEntryAbsolute(from: string, to: string): Promise<void> {
  if (await pathExists(to)) {
    throw new FileOpError('EXISTS', `${basename(to)} already exists`);
  }
  try {
    await copyRecursive(from, to, { entries: 0, bytes: 0 });
  } catch (error) {
    await fs.rm(to, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof FileOpError) throw error;
    throw new FileOpError('IO_ERROR', `Could not copy: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

export async function deleteToTrash(
  root: string,
  absolute: string,
  option: 'local' | 'permanent',
): Promise<void> {
  if (option === 'permanent') {
    await fs.rm(absolute, { recursive: true, force: true });
    markSelfWrite(absolute);
    return;
  }
  const trashDir = path.join(root, '.obsidia', 'trash');
  await fs.mkdir(trashDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = basename(absolute);
  let destination = path.join(trashDir, `${stamp}-${name}`);
  let counter = 1;
  while (await pathExists(destination)) {
    destination = path.join(trashDir, `${stamp}-${counter}-${name}`);
    counter += 1;
  }
  try {
    await fs.rename(absolute, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV') {
      throw new FileOpError('IO_ERROR', `Could not move to trash: ${(error as Error).message}`, {
        cause: error,
      });
    }
    await fs.cp(absolute, destination, { recursive: true });
    await fs.rm(absolute, { recursive: true, force: true });
  }
  markSelfWrite(absolute);
  markSelfWrite(destination);
}

export async function listDirectory(
  absolute: string,
): Promise<Array<{ name: string; kind: 'file' | 'folder'; size: number; mtimeMs: number }>> {
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const results: Array<{ name: string; kind: 'file' | 'folder'; size: number; mtimeMs: number }> = [];
  for (const entry of entries) {
    let isDirectory = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      // Never traverse symlinked directories; list them as opaque entries.
      isDirectory = false;
    }
    let size = 0;
    let mtimeMs = 0;
    try {
      const stat = await fs.lstat(path.join(absolute, entry.name));
      size = stat.size;
      mtimeMs = stat.mtimeMs;
    } catch {
      // entry disappeared between readdir and stat
    }
    results.push({
      name: entry.name,
      kind: isDirectory ? 'folder' : 'file',
      size,
      mtimeMs,
    });
  }
  return results;
}

export async function uniquePath(
  directoryAbsolute: string,
  directoryRelative: string,
  base: string,
  extension = '',
): Promise<string> {
  for (let index = 0; index < 1000; index += 1) {
    const name = index === 0 ? `${base}${extension}` : `${base} ${index}${extension}`;
    if (!(await pathExists(path.join(directoryAbsolute, name)))) {
      return directoryRelative ? `${directoryRelative}/${name}` : name;
    }
  }
  throw new FileOpError('EXISTS', 'Could not find a free name');
}
