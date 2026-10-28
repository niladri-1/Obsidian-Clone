export type FrontmatterValue = string | number | boolean | string[];

export interface ParsedFrontmatter {
  exists: boolean;
  data: Record<string, FrontmatterValue>;
  body: string;
  /** Original frontmatter block including delimiters and trailing newline, or "". */
  raw: string;
  eol: '\n' | '\r\n';
}

const KEY_RE = /^([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/;

export function detectEol(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function parseScalar(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((entry) => unquote(entry.trim()))
      .filter((entry) => entry.length > 0);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return unquote(value);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const eol = detectEol(text);
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { exists: false, data: {}, body: text, raw: '', eol };
  }
  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---' || lines[index]?.trim() === '...') {
      end = index;
      break;
    }
  }
  if (end === -1) {
    return { exists: false, data: {}, body: text, raw: '', eol };
  }

  const data: Record<string, FrontmatterValue> = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = KEY_RE.exec(line);
    if (!match) continue;
    const key = match[1]!;
    const inline = match[2] ?? '';
    if (!inline.trim()) {
      const items: string[] = [];
      let cursor = index + 1;
      while (cursor < end) {
        const candidate = lines[cursor] ?? '';
        const item = /^\s*-\s+(.*)$/.exec(candidate);
        if (!item) break;
        items.push(unquote(item[1]!.trim()));
        cursor += 1;
      }
      data[key] = items.length ? items : '';
      index = cursor - 1;
      continue;
    }
    data[key] = parseScalar(inline);
  }

  const raw = lines.slice(0, end + 1).join(eol) + eol;
  const body = lines.slice(end + 1).join(eol);
  return { exists: true, data, body, raw, eol };
}

function quoteIfNeeded(value: string): string {
  if (value === '') return '""';
  if (/^[A-Za-z0-9_][A-Za-z0-9_./@+-]*$/.test(value)) return value;
  if (/^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}

function formatValue(value: FrontmatterValue): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return ['[]'];
    return ['', ...value.map((entry) => `  - ${quoteIfNeeded(String(entry))}`)];
  }
  if (typeof value === 'boolean' || typeof value === 'number') return [String(value)];
  return [quoteIfNeeded(value)];
}

/**
 * Updates a single top-level frontmatter key while preserving every other line/comment.
 * Passing null removes the key (and its block-array continuation lines).
 */
export function setFrontmatterValue(
  text: string,
  key: string,
  value: FrontmatterValue | null,
): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error('invalid frontmatter key');
  const parsed = parseFrontmatter(text);
  const eol = parsed.eol;

  if (!parsed.exists) {
    if (value === null) return text;
    const lines = formatValue(value);
    const head = lines[0] ?? '';
    const rest = lines.slice(1);
    const block = `---${eol}${key}: ${head}${eol}${rest.map((line) => `${line}${eol}`).join('')}---${eol}`;
    return block + text.replace(/^\uFEFF/, '');
  }

  const lines = text.split(/\r?\n/);
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---' || lines[index]?.trim() === '...') {
      closing = index;
      break;
    }
  }
  if (closing === -1) return text;

  let keyLine = -1;
  for (let index = 1; index < closing; index += 1) {
    const match = KEY_RE.exec(lines[index] ?? '');
    if (match && match[1] === key) {
      keyLine = index;
      break;
    }
  }

  if (value === null) {
    if (keyLine === -1) return text;
    let end = keyLine + 1;
    while (end < closing && /^\s+-\s+/.test(lines[end] ?? '')) end += 1;
    lines.splice(keyLine, end - keyLine);
    return lines.join(eol);
  }

  const formatted = formatValue(value);
  const head = `${key}: ${formatted[0] ?? ''}`;
  const block = [head, ...formatted.slice(1)];

  if (keyLine !== -1) {
    let end = keyLine + 1;
    while (end < closing && /^\s+-\s+/.test(lines[end] ?? '')) end += 1;
    lines.splice(keyLine, end - keyLine, ...block);
  } else {
    lines.splice(closing, 0, ...block);
  }
  return lines.join(eol);
}

export function frontmatterTags(data: Record<string, FrontmatterValue>): string[] {
  const value = data.tags ?? data.tag;
  if (Array.isArray(value)) return value.map((entry) => String(entry).replace(/^#/, '').toLowerCase());
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((entry) => entry.replace(/^#/, '').toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export function frontmatterAliases(data: Record<string, FrontmatterValue>): string[] {
  const value = data.aliases ?? data.alias;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}
