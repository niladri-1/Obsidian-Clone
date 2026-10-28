import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileChangeBatch, VaultInfo } from '../src/shared/types';
import { VaultService } from '../src/main/vault/service';
import { canonicalizeRoot } from '../src/main/vault/paths';

let root: string;
let service: VaultService | null = null;
const errors: Error[] = [];

function info(vaultRoot: string): VaultInfo {
  return {
    id: 'test-vault',
    path: vaultRoot,
    name: 'Test Vault',
    lastOpenedAt: Date.now(),
  };
}

async function seed(files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

async function open(files: Record<string, string> = {}): Promise<VaultService> {
  await seed(files);
  service = await VaultService.create(info(root), {
    onFileBatch: (_batch: FileChangeBatch) => undefined,
    onVaultChanged: () => undefined,
    onError: (error) => errors.push(error),
  });
  return service;
}

beforeEach(async () => {
  root = await canonicalizeRoot(await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-service-')));
  errors.length = 0;
});

afterEach(async () => {
  await service?.dispose();
  service = null;
  await fs.rm(root, { recursive: true, force: true });
});

describe('vault service files', () => {
  it('suggests unique names and creates notes and folders', async () => {
    const vault = await open({ 'notes/a.md': '# A\n' });
    await expect(vault.suggestUntitledPath('notes')).resolves.toBe('notes/Untitled.md');

    const created = await vault.createEntry('notes/Untitled', 'file');
    expect(created).toEqual({ path: 'notes/Untitled.md', kind: 'file' });
    await expect(vault.readFile('notes/Untitled.md')).resolves.toMatchObject({
      content: '# Untitled\n',
    });
    expect(vault.getTree().files).toContain('notes/Untitled.md');

    await expect(vault.suggestUntitledPath('notes')).resolves.toBe('notes/Untitled 1.md');
    const folder = await vault.createEntry('projects', 'folder');
    expect(folder).toEqual({ path: 'projects', kind: 'folder' });
    expect(vault.getTree().folders).toContain('projects');

    await expect(vault.createEntry('projects', 'folder')).rejects.toMatchObject({
      code: 'EXISTS',
    });
    await expect(vault.createEntry('../escape.md', 'file')).rejects.toMatchObject({
      code: 'OUTSIDE_VAULT',
    });
  });

  it('writes markdown, refreshes links and rejects non-markdown targets', async () => {
    const vault = await open({
      'notes/a.md': '# A\n',
      'notes/b.md': '# B\n',
      'assets/image.png': 'not really an image',
    });

    const result = await vault.writeFile('notes/a.md', '# A\n\nSee [[b]].\n');
    expect(result.links?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'notes/a.md', to: 'notes/b.md' }),
      ]),
    );
    await expect(vault.readFile('notes/a.md')).resolves.toMatchObject({
      content: '# A\n\nSee [[b]].\n',
    });
    await expect(vault.readFile('assets/image.png')).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    await expect(vault.writeFile('assets/image.png', 'x')).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    await expect(vault.writeFile('../outside.md', 'x')).rejects.toMatchObject({
      code: 'OUTSIDE_VAULT',
    });
  });

  it('renames files and folders and keeps the tree in sync', async () => {
    const vault = await open({
      'notes/a.md': '# A\n',
      'notes/b.md': '# B\n',
      'folder/inner.md': '# Inner\n',
    });

    const renamed = await vault.renameEntry('notes/a.md', 'notes/renamed.md', false);
    expect(renamed).toMatchObject({ path: 'notes/a.md', newPath: 'notes/renamed.md' });
    expect(vault.getTree().files).toContain('notes/renamed.md');
    expect(vault.getTree().files).not.toContain('notes/a.md');
    await expect(vault.readFile('notes/renamed.md')).resolves.toMatchObject({
      content: '# A\n',
    });
    await expect(vault.readFile('notes/a.md')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const folder = await vault.renameEntry('folder', 'folder-two', false);
    expect(folder.newPath).toBe('folder-two');
    expect(vault.getTree().files).toContain('folder-two/inner.md');
    expect(vault.getTree().files).not.toContain('folder/inner.md');

    await expect(vault.renameEntry('notes/b.md', 'notes/renamed.md', false)).rejects.toMatchObject({
      code: 'EXISTS',
    });
    await expect(vault.renameEntry('notes/b.md', 'other/b.md', false)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('deletes to vault-local trash or permanently according to settings', async () => {
    const vault = await open({ 'notes/a.md': '# A\n', 'notes/b.md': '# B\n' });

    await vault.deleteEntry('notes/a.md');
    expect(vault.getTree().files).not.toContain('notes/a.md');
    const trash = await fs.readdir(path.join(root, '.obsidia', 'trash'));
    expect(trash.some((entry) => entry.endsWith('a.md'))).toBe(true);

    await vault.updateVaultSettings({ trashOption: 'permanent' });
    await vault.deleteEntry('notes/b.md');
    expect(vault.getTree().files).not.toContain('notes/b.md');
    const trashAfter = await fs.readdir(path.join(root, '.obsidia', 'trash'));
    expect(trashAfter.some((entry) => entry.endsWith('b.md'))).toBe(false);
  });

  it('duplicates notes and folders into free sibling names', async () => {
    const vault = await open({
      'notes/a.md': '# A\n\nSee [[b]].\n',
      'notes/b.md': '# B\n',
      'folder/inner.md': '# Inner\n',
      'folder/asset.png': 'png',
    });

    const copy = await vault.duplicateEntry('notes/a.md');
    expect(copy).toEqual({ sourcePath: 'notes/a.md', path: 'notes/a 1.md' });
    expect(vault.getTree().files).toContain('notes/a 1.md');
    await expect(vault.readFile('notes/a 1.md')).resolves.toMatchObject({
      content: '# A\n\nSee [[b]].\n',
    });

    const second = await vault.duplicateEntry('notes/a.md');
    expect(second.path).toBe('notes/a 2.md');

    const folder = await vault.duplicateEntry('folder');
    expect(folder.path).toBe('folder 1');
    expect(vault.getTree().files).toEqual(
      expect.arrayContaining(['folder 1/inner.md', 'folder 1/asset.png']),
    );
    await expect(fs.readFile(path.join(root, 'folder 1', 'asset.png'), 'utf8')).resolves.toBe(
      'png',
    );
    await expect(vault.duplicateEntry('../outside.md')).rejects.toMatchObject({
      code: 'OUTSIDE_VAULT',
    });
  });

  it('searches the current contents', async () => {
    const vault = await open({ 'notes/a.md': '# A\n\nunique-kumquat\n' });
    const response = await vault.searchVault({ query: 'unique-kumquat' });
    expect(response.results[0]?.path).toBe('notes/a.md');
  });
});

describe('rename link integration', () => {
  const referring = [
    '[[a]] [[a#H|Alias]] [[b]]',
    '[A](a.md) [B](b.md) [ext](https://example.com)',
  ].join('\n');

  it('rewrites links that point at the renamed path and refreshes backlinks', async () => {
    const vault = await open({
      'notes/a.md': '# A\n',
      'notes/b.md': '# B\n',
      'notes/c.md': referring,
    });

    const result = await vault.renameEntry('notes/a.md', 'notes/renamed.md', true);
    expect(result.linksUpdated).toBe(3);

    const c = await vault.readFile('notes/c.md');
    expect(c.content).toContain('[[renamed]]');
    expect(c.content).toContain('[[renamed#H|Alias]]');
    expect(c.content).toContain('[[b]]');
    expect(c.content).toContain('[B](b.md)');
    expect(c.content).toContain('[ext](https://example.com)');
    expect(c.content).toContain('[A](renamed.md)');

    const graph = vault.getLinks();
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'notes/c.md', to: 'notes/renamed.md' }),
      ]),
    );
    expect(graph.edges.some((edge) => edge.to === 'notes/a.md')).toBe(false);

    const entries = await fs.readdir(path.join(root, 'notes'));
    expect(entries.filter((entry) => entry.startsWith('.~'))).toEqual([]);
  });

  it('leaves referring notes unchanged when updateLinks is false', async () => {
    const vault = await open({
      'notes/a.md': '# A\n',
      'notes/c.md': '[[a]] [A](a.md)',
    });

    await vault.renameEntry('notes/a.md', 'notes/renamed.md', false);
    await expect(vault.readFile('notes/c.md')).resolves.toMatchObject({
      content: '[[a]] [A](a.md)',
    });
  });
});
