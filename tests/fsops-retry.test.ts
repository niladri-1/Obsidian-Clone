import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  failures: 0,
  code: 'EBUSY',
  renameCalls: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const rename = async (from: string, to: string): Promise<void> => {
    state.renameCalls += 1;
    if (state.failures > 0) {
      state.failures -= 1;
      const error = new Error('injected rename failure') as NodeJS.ErrnoException;
      error.code = state.code;
      throw error;
    }
    await actual.rename(from, to);
  };
  return { ...actual, default: { ...actual, rename }, rename };
});

const { atomicWriteAbsolute } = await import('../src/main/vault/fsops');

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-retry-'));
  state.failures = 0;
  state.code = 'EBUSY';
  state.renameCalls = 0;
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function tempNames(): Promise<string[]> {
  return (await fs.readdir(root)).filter((entry) => entry.startsWith('.~'));
}

describe('atomic write retry handling', () => {
  it('retries transient rename failures and eventually replaces the file', async () => {
    const target = path.join(root, 'note.md');
    await fs.writeFile(target, 'old\n', 'utf8');

    state.failures = 2;
    await atomicWriteAbsolute(target, 'new\n');

    await expect(fs.readFile(target, 'utf8')).resolves.toBe('new\n');
    expect(state.renameCalls).toBe(3);
    await expect(tempNames()).resolves.toEqual([]);
  });

  it('cleans the temp file and leaves the original intact after permanent failure', async () => {
    const target = path.join(root, 'note.md');
    await fs.writeFile(target, 'old\n', 'utf8');

    state.failures = 20;
    await expect(atomicWriteAbsolute(target, 'new\n')).rejects.toMatchObject({
      code: 'IO_ERROR',
    });

    await expect(fs.readFile(target, 'utf8')).resolves.toBe('old\n');
    await expect(tempNames()).resolves.toEqual([]);
    expect(state.renameCalls).toBe(5);
  });

  it('does not retry non-transient rename errors', async () => {
    const target = path.join(root, 'note.md');
    await fs.writeFile(target, 'old\n', 'utf8');

    state.failures = 1;
    state.code = 'ENOENT';
    await expect(atomicWriteAbsolute(target, 'new\n')).rejects.toMatchObject({
      code: 'IO_ERROR',
    });

    await expect(fs.readFile(target, 'utf8')).resolves.toBe('old\n');
    expect(state.renameCalls).toBe(1);
    await expect(tempNames()).resolves.toEqual([]);
  });
});
