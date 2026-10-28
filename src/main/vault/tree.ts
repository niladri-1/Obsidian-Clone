import path from 'node:path';
import { isSupportedFilePath, toPosix } from '../../shared/paths';
import type { VaultNode, VaultTree } from '../../shared/types';
import { FileOpError, listDirectory } from './fsops';

// `.obsidian` is the legacy third-party config folder: keep it hidden but never touch it.
const IGNORED_DIRECTORIES = new Set(['.obsidia', '.obsidian', '.trash', 'node_modules', '.git']);
const MAX_ENTRIES = 50_000;
const MAX_DEPTH = 40;

export function isIgnoredName(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name.toLowerCase()) || name.startsWith('.');
}

function compareNodes(a: VaultNode, b: VaultNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

export async function buildTree(rootAbsolute: string): Promise<VaultTree> {
  const files: string[] = [];
  const folders: string[] = [];
  let entryCount = 0;

  const walk = async (absolute: string, relative: string, depth: number): Promise<VaultNode[]> => {
    if (depth > MAX_DEPTH) return [];
    const entries = await listDirectory(absolute);
    const nodes: VaultNode[] = [];

    for (const entry of entries) {
      if (isIgnoredName(entry.name)) continue;
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) {
        throw new FileOpError('TOO_LARGE', 'Vault contains too many entries to display');
      }
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.kind === 'folder') {
        folders.push(childRelative);
        const children = await walk(path.join(absolute, entry.name), childRelative, depth + 1);
        nodes.push({
          path: childRelative,
          name: entry.name,
          kind: 'folder',
          children,
          mtimeMs: entry.mtimeMs,
        });
        continue;
      }

      if (!isSupportedFilePath(entry.name)) continue;
      files.push(childRelative);
      nodes.push({
        path: childRelative,
        name: entry.name,
        kind: 'file',
        mtimeMs: entry.mtimeMs,
        size: entry.size,
      });
    }

    return nodes.sort(compareNodes);
  };

  const children = await walk(rootAbsolute, '', 0);
  const root: VaultNode = {
    path: '',
    name: path.basename(rootAbsolute) || 'Vault',
    kind: 'folder',
    children,
  };

  return { root, files: files.map(toPosix), folders: folders.map(toPosix) };
}

export function findNode(tree: VaultTree, relative: string): VaultNode | null {
  if (!relative) return tree.root;
  const segments = relative.split('/');
  let node: VaultNode | undefined = tree.root;
  for (const segment of segments) {
    node = node?.children?.find((child) => child.name === segment);
    if (!node) return null;
  }
  return node;
}

export function collectMarkdownFiles(tree: VaultTree): string[] {
  return tree.files.filter((file) => /\.(md|markdown)$/i.test(file));
}
