import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDirectChild,
  assertValidName,
  canonicalizeRoot,
  resolveInVault,
  VaultPathError,
} from '../src/main/vault/paths';

let root: string;

beforeEach(async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-paths-'));
  root = await canonicalizeRoot(created);
  await fs.mkdir(path.join(root, 'notes'), { recursive: true });
  await fs.writeFile(path.join(root, 'notes', 'a.md'), '# A\n', 'utf8');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('resolveInVault containment', () => {
  it('resolves a normal vault-relative path', async () => {
    await expect(resolveInVault(root, 'notes/a.md')).resolves.toBe(
      path.join(root, 'notes', 'a.md'),
    );
  });

  it('normalises interior dot segments but stays inside', async () => {
    await expect(resolveInVault(root, 'notes/sub/../a.md')).resolves.toBe(
      path.join(root, 'notes', 'a.md'),
    );
  });

  it('rejects parent traversal', async () => {
    await expectCode(resolveInVault(root, '../escape.md'), 'OUTSIDE_VAULT');
    await expectCode(resolveInVault(root, 'notes/../../escape.md'), 'OUTSIDE_VAULT');
  });

  it('rejects absolute, drive-letter, UNC and home-relative paths', async () => {
    await expectCode(resolveInVault(root, 'C:\\Windows\\win.ini'), 'OUTSIDE_VAULT');
    await expectCode(resolveInVault(root, '/etc/passwd'), 'OUTSIDE_VAULT');
    await expectCode(resolveInVault(root, '\\\\server\\share\\x.md'), 'OUTSIDE_VAULT');
    await expectCode(resolveInVault(root, '~/secret.md'), 'OUTSIDE_VAULT');
  });

  it('rejects NUL bytes and empty paths', async () => {
    await expectCode(resolveInVault(root, 'notes/\0.md'), 'INVALID_ARGUMENT');
    await expectCode(resolveInVault(root, ''), 'INVALID_ARGUMENT');
  });

  it('allows the root only for explicit root operations', async () => {
    await expectCode(resolveInVault(root, ''), 'INVALID_ARGUMENT');
    await expect(resolveInVault(root, '', { allowRoot: true })).resolves.toBe(root);
  });

  it('rejects Windows reserved names and trailing dots or spaces', async () => {
    for (const name of ['CON', 'aux.md', 'lpt1', 'com9.txt']) {
      await expectCode(resolveInVault(root, name), 'INVALID_ARGUMENT');
    }
    await expectCode(resolveInVault(root, 'notes/bad.'), 'INVALID_ARGUMENT');
    await expectCode(resolveInVault(root, 'notes/bad '), 'INVALID_ARGUMENT');
  });

  it('protects the application config and trash folders from user operations', async () => {
    await expectCode(resolveInVault(root, '.obsidia/app.json'), 'INVALID_ARGUMENT');
    await expectCode(resolveInVault(root, '.obsidian/app.json'), 'INVALID_ARGUMENT');
    await expectCode(resolveInVault(root, '.trash/old.md'), 'INVALID_ARGUMENT');
    await expect(
      resolveInVault(root, '.obsidia/app.json', { forUser: false }),
    ).resolves.toBe(path.join(root, '.obsidia', 'app.json'));
    await expect(resolveInVault(root, '.obsidiax/note.md')).resolves.toBe(
      path.join(root, '.obsidiax', 'note.md'),
    );
  });

  it('rejects a symlinked file that points outside the vault', async (ctx) => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-outside-'));
    const outsideFile = path.join(outside, 'secret.md');
    await fs.writeFile(outsideFile, 'secret', 'utf8');
    try {
      try {
        await fs.symlink(outsideFile, path.join(root, 'link.md'), 'file');
      } catch {
        console.warn('Skipping symlink test: host refused symlink creation');
        ctx.skip();
        return;
      }
      await expectCode(resolveInVault(root, 'link.md'), 'OUTSIDE_VAULT');
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked directory that points outside the vault', async (ctx) => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-outside-'));
    await fs.writeFile(path.join(outside, 'secret.md'), 'secret', 'utf8');
    try {
      try {
        await fs.symlink(outside, path.join(root, 'linkdir'), 'dir');
      } catch {
        console.warn('Skipping symlink test: host refused symlink creation');
        ctx.skip();
        return;
      }
      await expectCode(resolveInVault(root, 'linkdir/secret.md'), 'OUTSIDE_VAULT');
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

describe('name validation', () => {
  it('accepts ordinary names', () => {
    expect(() => assertValidName('Note.md')).not.toThrow();
    expect(() => assertValidName('my folder')).not.toThrow();
  });

  it('rejects separators, dot entries, reserved names and trailing punctuation', () => {
    for (const name of ['a/b', 'a\\b', '.', '..', 'NUL', 'bad.', 'bad ']) {
      expect(() => assertValidName(name)).toThrow(VaultPathError);
    }
  });

  it('requires rename targets to be direct children of the same folder', () => {
    expect(() => assertDirectChild('notes', 'notes/renamed.md')).not.toThrow();
    expect(() => assertDirectChild('notes', 'other/renamed.md')).toThrow(VaultPathError);
    expect(() => assertDirectChild('', 'renamed.md')).not.toThrow();
    expect(() => assertDirectChild('', 'nested/renamed.md')).toThrow(VaultPathError);
  });
});
