const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const ATTACHMENT_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  'pdf',
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'mp4',
  'webm',
  'mov',
]);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);
const EXTERNAL_PROTOCOLS = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function toPosix(input: string): string {
  return input.replace(/\\/g, '/');
}

/**
 * Normalises a vault-relative path. Throws when the path attempts to escape the root.
 * Empty segments and "." are dropped; ".." pops a segment and fails at the root.
 */
export function normalizeRelPath(input: string): string {
  const raw = toPosix(input).replace(/^\/+/, '');
  const out: string[] = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) throw new Error('path escapes vault');
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

export function dirname(path: string): string {
  const normalized = toPosix(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = toPosix(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

export function stripExtension(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  if (index <= 0) return path;
  return path.slice(0, path.length - (name.length - index));
}

/** Basename without a markdown extension, used for display and link shortening. */
export function noteTitle(path: string): string {
  const name = basename(path);
  return /\.md$/i.test(name) ? name.slice(0, -3) : name;
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(path));
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path));
}

export function isAttachmentPath(path: string): boolean {
  return ATTACHMENT_EXTENSIONS.has(extname(path));
}

export function isSupportedFilePath(path: string): boolean {
  return isMarkdownPath(path) || isAttachmentPath(path);
}

export function isSupportedNotePath(path: string): boolean {
  return isMarkdownPath(path);
}

export function isExternalLink(target: string): boolean {
  return EXTERNAL_PROTOCOLS.test(target.trim());
}

/**
 * Resolves a link target relative to the containing note. Returns null when the target would
 * escape the vault root. Targets beginning with "/" are vault-absolute.
 */
export function resolveRelativePath(sourcePath: string, target: string): string | null {
  const clean = toPosix(target).replace(/^<|>$/g, '').split('#')[0]?.split('?')[0] ?? '';
  if (!clean) return normalizeRelPathSafe(sourcePath);
  if (clean.startsWith('/')) return normalizeRelPathSafe(clean);
  const base = dirname(sourcePath);
  return normalizeRelPathSafe(base ? `${base}/${clean}` : clean);
}

function normalizeRelPathSafe(input: string): string | null {
  try {
    return normalizeRelPath(input);
  } catch {
    return null;
  }
}

/** Shortest unique form of a target path: basename when unique, otherwise vault path. */
export function shortestLinkTarget(toPath: string, allPaths: string[]): string {
  const target = stripExtension(toPath);
  const name = basename(target).toLowerCase();
  const sameName = allPaths.filter((entry) => {
    const withoutExt = stripExtension(entry);
    return basename(withoutExt).toLowerCase() === name;
  });
  return sameName.length <= 1 ? basename(target) : target;
}

/** Relative POSIX link from one note to another (used for markdown-link rewrites). */
export function relativeLinkPath(fromPath: string, toPath: string): string {
  const fromDir = dirname(fromPath).split('/').filter(Boolean);
  const toParts = toPath.split('/').filter(Boolean);
  let common = 0;
  while (
    common < fromDir.length &&
    common < toParts.length - 1 &&
    fromDir[common].toLowerCase() === toParts[common]?.toLowerCase()
  ) {
    common += 1;
  }
  const ups = new Array(fromDir.length - common).fill('..');
  return [...ups, ...toParts.slice(common)].join('/');
}

export function encodeVaultPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export function toVaultFileUrl(path: string): string {
  return `vaultfile://vault/${encodeVaultPath(toPosix(path))}`;
}

export function decodeVaultPathname(pathname: string): string {
  return pathname
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

export function splitFrontmatterTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim().replace(/^#/, ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((entry) => entry.trim().replace(/^#/, ''))
      .filter(Boolean);
  }
  return [];
}
