import fs from 'node:fs/promises';
import path from 'node:path';
import { basename, dirname, normalizeRelPath, toPosix } from '../../shared/paths';
import type { IpcErrorCode } from '../../shared/types';

export class VaultPathError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'VaultPathError';
    this.code = code;
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_FORBIDDEN_CHARS = /[<>:"|?*\u0000-\u001f]/;
const MAX_PATH = 4096;

export interface ResolveOptions {
  allowRoot?: boolean;
  /** Reject the app's own config and trash folders for user-initiated file operations. */
  forUser?: boolean;
}

export async function canonicalizeRoot(root: string): Promise<string> {
  const resolved = path.resolve(root);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (relative === '') return true;
  if (relative.startsWith('..')) return false;
  return !path.isAbsolute(relative);
}

function validateSegment(segment: string, fullPath: string): void {
  if (segment.length === 0) return;
  if (segment === '.' || segment === '..') return;
  if (segment.length > 240) {
    throw new VaultPathError('INVALID_ARGUMENT', `Path segment is too long: ${fullPath}`);
  }
  if (WINDOWS_RESERVED.test(segment)) {
    throw new VaultPathError('INVALID_ARGUMENT', `Reserved file name: ${segment}`);
  }
  if (WINDOWS_FORBIDDEN_CHARS.test(segment)) {
    throw new VaultPathError('INVALID_ARGUMENT', `Forbidden character in path: ${fullPath}`);
  }
  if (/[. ]$/.test(segment)) {
    throw new VaultPathError('INVALID_ARGUMENT', `Names cannot end with a dot or space: ${segment}`);
  }
}

async function realpathNearest(target: string): Promise<string> {
  const missing: string[] = [];
  let probe = target;
  // Bounded by path depth; stop at an existing entry.
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      const real = await fs.realpath(probe);
      return path.join(real, ...missing.slice().reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      missing.push(path.basename(probe));
      probe = parent;
    }
  }
  return target;
}

/**
 * Resolves a renderer-supplied vault-relative path to a native absolute path.
 * Throws VaultPathError when the input is malformed or would leave the vault.
 */
export async function resolveInVault(
  root: string,
  relative: string,
  options: ResolveOptions = {},
): Promise<string> {
  if (typeof relative !== 'string') {
    throw new VaultPathError('INVALID_ARGUMENT', 'Path must be a string');
  }
  if (relative.length > MAX_PATH) {
    throw new VaultPathError('INVALID_ARGUMENT', 'Path is too long');
  }
  if (relative.includes('\u0000')) {
    throw new VaultPathError('INVALID_ARGUMENT', 'Path contains a NUL byte');
  }

  const posix = toPosix(relative);
  if (!posix) {
    if (options.allowRoot) return root;
    throw new VaultPathError('INVALID_ARGUMENT', 'Path is empty');
  }
  if (posix.startsWith('~') || posix.startsWith('//') || path.isAbsolute(posix) || /^[a-zA-Z]:/.test(posix)) {
    throw new VaultPathError('OUTSIDE_VAULT', 'Absolute and home-relative paths are not allowed');
  }

  let normalized: string;
  try {
    normalized = normalizeRelPath(posix);
  } catch {
    throw new VaultPathError('OUTSIDE_VAULT', 'Path escapes the vault');
  }
  if (!normalized) {
    if (options.allowRoot) return root;
    throw new VaultPathError('INVALID_ARGUMENT', 'Path is empty');
  }

  const segments = normalized.split('/');
  for (const segment of segments) validateSegment(segment, normalized);

  if (options.forUser !== false) {
    const first = segments[0]!.toLowerCase();
    if (first === '.obsidia' || first === '.obsidian' || first === '.trash') {
      throw new VaultPathError(
        'INVALID_ARGUMENT',
        first === '.obsidian'
          ? 'This folder belongs to another application'
          : 'This folder is managed by the application',
      );
    }
  }

  const absolute = path.resolve(root, ...segments);
  if (!isInside(root, absolute)) {
    throw new VaultPathError('OUTSIDE_VAULT', 'Path escapes the vault');
  }

  const realRoot = await realpathNearest(root);
  const realTarget = await realpathNearest(absolute);
  if (!isInside(realRoot, realTarget)) {
    throw new VaultPathError('OUTSIDE_VAULT', 'Path resolves outside the vault (symlink)');
  }

  return absolute;
}

/** Validates a single file/folder name supplied for create/rename. */
export function assertValidName(name: string): void {
  if (typeof name !== 'string' || !name.trim()) {
    throw new VaultPathError('INVALID_ARGUMENT', 'Name is required');
  }
  if (name.length > 240) {
    throw new VaultPathError('INVALID_ARGUMENT', 'Name is too long');
  }
  if (name === '.' || name === '..' || /[/\\]/.test(name)) {
    throw new VaultPathError('INVALID_ARGUMENT', 'Name cannot contain path separators');
  }
  validateSegment(name, name);
}

/** Ensures a relative path is a direct child of its parent (rename/new entry). */
export function assertDirectChild(parent: string, child: string): void {
  if (dirname(child) !== parent.replace(/\/+$/, '')) {
    throw new VaultPathError('INVALID_ARGUMENT', 'Path must stay in the same folder');
  }
  assertValidName(basename(child));
}
