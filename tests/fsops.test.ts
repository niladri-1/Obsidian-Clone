import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../src/shared/ipc';
import {
  atomicWriteAbsolute,
  clearSelfWrites,
  createEntryAbsolute,
  deleteToTrash,
  isRecentSelfWrite,
  listDirectory,
  markSelfWrite,
  pathExists,
  readTextFile,
  renameAbsolute,
  uniquePath,
  writeTextFile,
} from '../src/main/vault/fsops';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-fsops-'));
  clearSelfWrites();
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(root, { recursive: true, force: true });
});

function file(name: string): string {
  return path.join(root, name);
}

async function tempNames(): Promise<string[]> {
  return (await fs.readdir(root)).filter((entry) => entry.startsWith('.~'));
}

describe('atomicWriteAbsolute', () => {
  it('writes exact content and leaves no temp file behind', async () => {
    await atomicWriteAbsolute(file('note.md'), 'hello\nworld\n');
    await expect(fs.readFile(file('note.md'), 'utf8')).resolves.toBe('hello\nworld\n');
    await expect(tempNames()).resolves.toEqual([]);
  });

  it('creates missing parent directories', async () => {
    await atomicWriteAbsolute(file('a/b/c.md'), 'nested');
    await expect(fs.readFile(file('a/b/c.md'), 'utf8')).resolves.toBe('nested');
  });

  it('normalises line endings to the requested style', async () => {
    await atomicWriteAbsolute(file('crlf.md'), 'a\nb\n', { eol: '\r\n' });
    const bytes = await fs.readFile(file('crlf.md'));
    expect(bytes.toString('utf8')).toBe('a\r\nb\r\n');
    await atomicWriteAbsolute(file('lf.md'), 'a\r\nb\r\n', { eol: '\n' });
    await expect(fs.readFile(file('lf.md'), 'utf8')).resolves.toBe('a\nb\n');
  });

  it('writes and preserves a UTF-8 BOM', async () => {
    await atomicWriteAbsolute(file('bom.md'), 'text\n', { bom: true });
    const bytes = await fs.readFile(file('bom.md'));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const read = await readTextFile(file('bom.md'), 'bom.md');
    expect(read.hadBom).toBe(true);
    expect(read.content).toBe('text\n');
  });

  it('rejects payloads above the note size limit', async () => {
    const oversized = 'a'.repeat(LIMITS.maxNoteBytes + 1);
    await expect(atomicWriteAbsolute(file('big.md'), oversized)).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    await expect(pathExists(file('big.md'))).resolves.toBe(false);
  });

  it.skipIf(process.platform === 'win32')('creates files with mode 0600 on POSIX', async () => {
    await atomicWriteAbsolute(file('private.md'), 'secret');
    const stat = await fs.stat(file('private.md'));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('read/write text files', () => {
  it('normalises CRLF on read and preserves it on write', async () => {
    await fs.writeFile(file('crlf.md'), 'one\r\ntwo\r\n', 'utf8');
    const read = await readTextFile(file('crlf.md'), 'crlf.md');
    expect(read.eol).toBe('crlf');
    expect(read.content).toBe('one\ntwo\n');

    await writeTextFile(file('crlf.md'), 'crlf.md', 'one\ntwo\nthree\n');
    const raw = await fs.readFile(file('crlf.md'), 'utf8');
    expect(raw).toBe('one\r\ntwo\r\nthree\r\n');
  });

  it('preserves a BOM and CRLF together', async () => {
    await fs.writeFile(file('bom-crlf.md'), '\uFEFFone\r\ntwo\r\n', 'utf8');
    const read = await readTextFile(file('bom-crlf.md'), 'bom-crlf.md');
    expect(read).toMatchObject({ eol: 'crlf', hadBom: true, content: 'one\ntwo\n' });

    await writeTextFile(file('bom-crlf.md'), 'bom-crlf.md', 'one\ntwo\nthree\n');
    const bytes = await fs.readFile(file('bom-crlf.md'));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString('utf8')).toBe('one\r\ntwo\r\nthree\r\n');
  });

  it('uses LF for new files', async () => {
    await writeTextFile(file('new.md'), 'new.md', 'a\nb\n');
    await expect(fs.readFile(file('new.md'), 'utf8')).resolves.toBe('a\nb\n');
  });

  it('detects external modification through the expected mtime', async () => {
    await writeTextFile(file('note.md'), 'note.md', 'first\n');
    const read = await readTextFile(file('note.md'), 'note.md');
    await fs.writeFile(file('note.md'), 'external\n', 'utf8');
    await expect(
      writeTextFile(file('note.md'), 'note.md', 'mine\n', read.mtimeMs),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(fs.readFile(file('note.md'), 'utf8')).resolves.toBe('external\n');
  });

  it('rejects reading a missing file or a directory', async () => {
    await expect(readTextFile(file('missing.md'), 'missing.md')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await fs.mkdir(file('folder'));
    await expect(readTextFile(file('folder'), 'folder')).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
  });
});

describe('self-write suppression', () => {
  it('tracks a recent write and expires it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    markSelfWrite(file('note.md'));
    expect(isRecentSelfWrite(file('note.md'))).toBe(true);
    vi.setSystemTime(1_700_000_002_500);
    expect(isRecentSelfWrite(file('note.md'))).toBe(false);
    clearSelfWrites();
  });
});

describe('entry operations', () => {
  it('creates files and folders and rejects duplicates', async () => {
    await createEntryAbsolute(file('folder'), 'folder');
    await createEntryAbsolute(file('folder/note.md'), 'file', '# Note\n');
    await expect(fs.readFile(file('folder/note.md'), 'utf8')).resolves.toBe('# Note\n');
    await expect(createEntryAbsolute(file('folder'), 'folder')).rejects.toMatchObject({
      code: 'EXISTS',
    });
  });

  it('renames entries and rejects collisions', async () => {
    await createEntryAbsolute(file('a.md'), 'file', 'a');
    await createEntryAbsolute(file('b.md'), 'file', 'b');
    await renameAbsolute(file('a.md'), file('c.md'));
    await expect(pathExists(file('a.md'))).resolves.toBe(false);
    await expect(fs.readFile(file('c.md'), 'utf8')).resolves.toBe('a');
    await expect(renameAbsolute(file('c.md'), file('b.md'))).rejects.toMatchObject({
      code: 'EXISTS',
    });
  });

  it('finds the first free Untitled name', async () => {
    await createEntryAbsolute(file('Untitled.md'), 'file', '');
    await expect(uniquePath(root, '', 'Untitled', '.md')).resolves.toBe('Untitled 1.md');
    await createEntryAbsolute(file('Untitled 1.md'), 'file', '');
    await expect(uniquePath(root, '', 'Untitled', '.md')).resolves.toBe('Untitled 2.md');
  });

  it('moves deleted files into the vault-local trash', async () => {
    await createEntryAbsolute(file('note.md'), 'file', 'body');
    await deleteToTrash(root, file('note.md'), 'local');
    await expect(pathExists(file('note.md'))).resolves.toBe(false);
    const trash = await fs.readdir(path.join(root, '.obsidia', 'trash'));
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatch(/note\.md$/);
    await expect(
      fs.readFile(path.join(root, '.obsidia', 'trash', trash[0]!), 'utf8'),
    ).resolves.toBe('body');
  });

  it('permanently deletes entries', async () => {
    await createEntryAbsolute(file('gone.md'), 'file', 'x');
    await deleteToTrash(root, file('gone.md'), 'permanent');
    await expect(pathExists(file('gone.md'))).resolves.toBe(false);
  });

  it('does not traverse symlinked directories when listing', async (ctx) => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-outside-'));
    await fs.writeFile(path.join(outside, 'secret.md'), 'secret', 'utf8');
    try {
      try {
        await fs.symlink(outside, file('linkdir'), 'dir');
      } catch {
        console.warn('Skipping symlink listing test: host refused symlink creation');
        ctx.skip();
        return;
      }
      const entries = await listDirectory(root);
      const link = entries.find((entry) => entry.name === 'linkdir');
      expect(link?.kind).toBe('file');
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
