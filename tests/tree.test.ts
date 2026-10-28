import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTree, collectMarkdownFiles, findNode } from '../src/main/vault/tree';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-tree-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function seed(): Promise<void> {
  const files = [
    'Zebra.md',
    'Note 10.md',
    'Note 2.md',
    'notes.txt',
    'image.png',
    '.hidden.md',
    '.obsidia/app.json',
    '.obsidian/app.json',
    '.trash/old.md',
    'node_modules/pkg/readme.md',
    '.git/config',
    'alpha/inner.md',
    'alpha/deep/leaf.md',
    'Beta/other.md',
  ];
  for (const relative of files) {
    const target = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'x', 'utf8');
  }
}

describe('buildTree', () => {
  it('sorts folders first and then files with natural numeric order', async () => {
    await seed();
    const tree = await buildTree(root);
    expect(tree.root.children?.map((child) => child.name)).toEqual([
      'alpha',
      'Beta',
      'image.png',
      'Note 2.md',
      'Note 10.md',
      'Zebra.md',
    ]);
  });

  it('hides application folders, dotfiles and node_modules', async () => {
    await seed();
    const tree = await buildTree(root);
    const flat = tree.files.concat(tree.folders);
    for (const hidden of [
      '.hidden.md',
      '.obsidia',
      '.obsidian',
      '.trash',
      'node_modules',
      '.git',
      'notes.txt',
    ]) {
      expect(flat.some((entry) => entry === hidden || entry.startsWith(`${hidden}/`))).toBe(false);
    }
  });

  it('collects supported file paths and markdown files', async () => {
    await seed();
    const tree = await buildTree(root);
    expect(tree.files).toContain('image.png');
    expect(tree.files).toContain('alpha/deep/leaf.md');
    expect(collectMarkdownFiles(tree)).toContain('Beta/other.md');
    expect(collectMarkdownFiles(tree)).not.toContain('image.png');
    expect(tree.folders).toContain('alpha/deep');
  });

  it('finds nodes by relative path', async () => {
    await seed();
    const tree = await buildTree(root);
    expect(findNode(tree, 'alpha')?.kind).toBe('folder');
    expect(findNode(tree, 'alpha/deep/leaf.md')?.kind).toBe('file');
    expect(findNode(tree, 'missing.md')).toBeNull();
    expect(findNode(tree, '')?.path).toBe('');
  });

  it('does not traverse symlinked directories', async (ctx) => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-outside-'));
    await fs.writeFile(path.join(outside, 'secret.md'), 'secret', 'utf8');
    try {
      try {
        await fs.symlink(outside, path.join(root, 'linkdir'), 'dir');
      } catch {
        console.warn('Skipping symlink tree test: host refused symlink creation');
        ctx.skip();
        return;
      }
      const tree = await buildTree(root);
      expect(tree.files.some((entry) => entry.startsWith('linkdir/'))).toBe(false);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
