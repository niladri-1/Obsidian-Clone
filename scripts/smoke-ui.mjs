// Built-app UI smoke test driven over the Chrome DevTools Protocol.
// Run `npm run build` first, then `npm run smoke:ui`. The script copies
// `sample-vault/` to a throwaway directory, launches Electron with an isolated
// profile, drives 21 user flows, and writes screenshots plus report.json there.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-ui-'));
const profile = path.join(base, 'profile');
const appdata = path.join(base, 'appdata');
const vaultPath = path.join(base, 'vault');
const shots = path.join(base, 'shots');
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(appdata, { recursive: true });
await fs.mkdir(shots, { recursive: true });
await fs.cp(path.join(repo, 'sample-vault'), vaultPath, { recursive: true });

const registry = {
  version: 1,
  vaults: [{ id: 'ui-vault', path: vaultPath, name: 'vault', lastOpenedAt: Date.now() }],
  lastVaultId: 'ui-vault',
};
for (const dir of [
  profile,
  path.join(appdata, 'obsidia'),
  path.join(appdata, 'Obsidia'),
]) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'vaults.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

const electron = path.join(repo, 'node_modules', 'electron', 'dist', 'electron.exe');
const port = Number(process.env.SMOKE_PORT ?? 9337);
const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
  cwd: repo,
  env: { ...process.env, APPDATA: appdata },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});
const logs = [];
const consoleErrors = [];
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => logs.push(`OUT ${chunk}`));
child.stderr.on('data', (chunk) => logs.push(`ERR ${chunk}`));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
  if (!response || !response.ok) return [];
  return response.json();
}

let list = [];
for (let i = 0; i < 100; i += 1) {
  list = await targets();
  if (list.some((target) => target.type === 'page')) break;
  await sleep(250);
}
const page = list.find((target) => target.type === 'page');
if (!page) {
  console.log('NO PAGE TARGET');
  console.log(logs.join(''));
  child.kill();
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(
      `exception: ${message.params.exceptionDetails?.text ?? 'unknown'} ${
        message.params.exceptionDetails?.exception?.description ?? ''
      }`,
    );
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(`log: ${message.params.entry.text}`);
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});
function send(method, params = {}) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  ws.send(JSON.stringify({ id, method, params }));
  return promise;
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description ?? ''}`,
    );
  }
  return result.result?.value;
}

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
    return detail;
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function waitFor(expression, label, timeout = 10_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await evaluate(expression);
    if (last) return last;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const file = path.join(shots, `${name}.png`);
  await fs.writeFile(file, Buffer.from(result.data, 'base64'));
  return file;
}
async function click(selector) {
  const result = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'not found' };
    el.click();
    return { ok: true, text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 80) };
  })()`);
  if (!result?.ok) throw new Error(`click ${selector}: ${result?.reason}`);
  return result.text;
}
async function clickByText(selector, text) {
  const result = await evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els.find((candidate) => (candidate.innerText || '').trim().includes(${JSON.stringify(text)}));
    if (!el) return { ok: false, reason: 'not found', seen: els.map((e) => (e.innerText || '').trim().slice(0, 40)) };
    el.click();
    return { ok: true, text: (el.innerText || '').trim().slice(0, 80) };
  })()`);
  if (!result?.ok) throw new Error(`clickByText ${selector} ${text}: ${JSON.stringify(result)}`);
  return result.text;
}
async function rightClick(selector, text) {
  const result = await evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = ${text === undefined ? 'els[0]' : `els.find((candidate) => ((candidate.innerText || '') + ' ' + (candidate.getAttribute('title') || '')).includes(${JSON.stringify(text)}))`};
    if (!el) return { ok: false, reason: 'not found', seen: els.map((e) => ((e.innerText || '') + ' ' + (e.getAttribute('title') || '')).trim().slice(0, 40)) };
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.min(Math.max(rect.width / 2, 4), 24);
    const y = rect.top + Math.min(Math.max(rect.height / 2, 4), 16);
    el.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 2,
      buttons: 2,
      clientX: x,
      clientY: y,
    }));
    return { ok: true, x, y };
  })()`);
  if (!result?.ok) throw new Error(`rightClick ${selector} ${text}: ${JSON.stringify(result)}`);
  return result;
}
async function menuLabels() {
  return evaluate(
    `[...document.querySelectorAll('.context-menu .context-item .truncate')].map((el) => el.innerText.trim())`,
  );
}
async function focusedMenuItem() {
  return evaluate(`document.activeElement?.querySelector?.('.truncate')?.innerText?.trim() ?? null`);
}
async function setInput(selector, value) {
  const result = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'not found' };
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    return { ok: true, value: el.value };
  })()`);
  if (!result?.ok) throw new Error(`setInput ${selector}: ${result?.reason}`);
  return result.value;
}
async function key(keyName, { ctrl = false, shift = false, alt = false } = {}) {
  const codes = {
    Enter: { code: 'Enter', vk: 13 },
    Escape: { code: 'Escape', vk: 27 },
    End: { code: 'End', vk: 35 },
    Home: { code: 'Home', vk: 36 },
    ArrowDown: { code: 'ArrowDown', vk: 40 },
    ArrowUp: { code: 'ArrowUp', vk: 38 },
    F2: { code: 'F2', vk: 113 },
  };
  const letter = /^[a-z]$/i.test(keyName);
  const meta = letter
    ? { code: `Key${keyName.toUpperCase()}`, vk: keyName.toUpperCase().charCodeAt(0) }
    : codes[keyName] ?? { code: keyName, vk: 0 };
  const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0) | (alt ? 1 : 0);
  const params = {
    key: keyName,
    code: meta.code,
    windowsVirtualKeyCode: meta.vk,
    nativeVirtualKeyCode: meta.vk,
    modifiers,
  };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function focusEditor() {
  const ok = await evaluate(`(() => {
    const el = document.querySelector('.cm-content');
    if (!el) return false;
    el.focus();
    return document.activeElement === el;
  })()`);
  if (!ok) throw new Error('CodeMirror editor not focusable');
}
async function appendToEditor(text) {
  await focusEditor();
  await key('End', { ctrl: true });
  await send('Input.insertText', { text });
}
async function readVault(rel) {
  return fs.readFile(path.join(vaultPath, rel), 'utf8');
}
async function exists(rel) {
  try {
    await fs.access(path.join(vaultPath, rel));
    return true;
  } catch {
    return false;
  }
}
async function findTrash() {
  const root = path.join(vaultPath, '.obsidia', 'trash');
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(full);
    }
  }
  await walk(root);
  return found;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await sleep(2500);

const report = { base, vaultPath, shots, checks, consoleErrors, notes: [] };

try {
  await check('boot: shell and vault loaded', async () => {
    await waitFor(`!!document.querySelector('.app')`, 'workspace shell');
    const boot = await evaluate(`(() => ({
      title: document.title,
      rows: [...document.querySelectorAll('[role="treeitem"]')].map((el) => el.getAttribute('title')),
      theme: document.documentElement.dataset.theme,
      keys: Object.keys(window.vaultApi || {}).length,
      sidebars: document.querySelectorAll('.sidebar').length,
      panes: document.querySelectorAll('.pane').length,
    }))()`);
    assert(boot.rows.length === 6, `expected 6 tree rows, got ${boot.rows.length}`);
    assert(boot.rows.includes('Welcome.md'), 'Welcome.md missing from tree');
    assert(boot.panes === 1, `expected 1 pane, got ${boot.panes}`);
    assert(boot.keys >= 25, `preload API too small: ${boot.keys}`);
    await shot('01-boot');
    return boot;
  });

  await check('open Welcome note in source editor', async () => {
    await clickByText('[role="treeitem"]', 'Welcome');
    await waitFor(`!!document.querySelector('.cm-editor')`, 'CodeMirror editor');
    const state = await evaluate(`(() => ({
      tab: [...document.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('title')),
      active: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title'),
      save: document.querySelector('.editor-toolbar .save-state')?.innerText.trim(),
      titleValue: document.querySelector('.note-title-input')?.value,
      content: (document.querySelector('.cm-content')?.innerText || '').slice(0, 120),
      words: document.querySelector('.status-bar')?.innerText.replace(/\\s+/g, ' ').slice(0, 100),
    }))()`);
    assert(state.active === 'Welcome.md', `active tab is ${state.active}`);
    assert(state.save === 'Saved', `save state is ${state.save}`);
    assert(state.content.includes('Welcome to Obsidia'), 'editor text missing heading');
    await shot('02-editor');
    return state;
  });

  await check('outline panel lists headings', async () => {
    await waitFor(`document.querySelectorAll('.outline-item').length >= 4`, 'outline items');
    const outline = await evaluate(
      `[...document.querySelectorAll('.outline-item')].map((el) => el.innerText.trim())`,
    );
    assert(outline.some((line) => line.includes('A short tour')), 'tour heading missing');
    return outline;
  });

  await check('file explorer context menu duplicates and trashes a note', async () => {
    await rightClick('[role="treeitem"]', 'Welcome.md');
    await waitFor(`!!document.querySelector('.context-menu')`, 'file context menu');
    const labels = await menuLabels();
    assert(labels.includes('Make a copy'), `make-copy missing: ${labels}`);
    assert(labels.includes('Open in new tab'), `open-in-new-tab missing: ${labels}`);
    assert(labels.includes('Open to the right'), `open-to-the-right missing: ${labels}`);
    assert(labels.includes('Show in system explorer'), `reveal missing: ${labels}`);
    await shot('03-file-menu');
    await clickByText('.context-menu .context-item', 'Make a copy');
    await waitFor(
      `[...document.querySelectorAll('[role="treeitem"]')].some((el) => el.getAttribute('title') === 'Welcome 1.md')`,
      'duplicated tree row',
    );
    assert(await exists('Welcome 1.md'), 'duplicated file was not written');
    const copy = await readVault('Welcome 1.md');
    assert(copy.includes('Welcome to Obsidia'), 'duplicated file content did not match');

    await rightClick('[role="treeitem"]', 'Welcome 1.md');
    await waitFor(`!!document.querySelector('.context-menu')`, 'duplicate context menu');
    await clickByText('.context-menu .context-item', 'Move to trash');
    await waitFor(
      `[...document.querySelectorAll('[role="dialog"]')].some((el) => el.innerText.includes('Move to trash?'))`,
      'trash dialog for duplicate',
    );
    await clickByText('.modal-footer button', 'Move to trash');
    await waitFor(
      `![...document.querySelectorAll('[role="treeitem"]')].some((el) => el.getAttribute('title') === 'Welcome 1.md')`,
      'duplicate removed from tree',
    );
    assert(!(await exists('Welcome 1.md')), 'duplicate still exists after trash');
    return { labels };
  });

  await check('reading view renders callout, image, footnote and tasks', async () => {
    await key('e', { ctrl: true });
    await waitFor(`!!document.querySelector('.reading-inner .markdown-body')`, 'reading view');
    await waitFor(
      `(() => { const img = document.querySelector('.markdown-body img.md-image'); return !!img && img.complete && img.naturalWidth > 0; })()`,
      'vault image decode',
      8000,
    );
    const reading = await evaluate(`(() => {
      const img = document.querySelector('.markdown-body img.md-image');
      return {
        title: document.querySelector('.reading-title')?.innerText,
        callout: document.querySelectorAll('.markdown-body blockquote.callout').length,
        calloutType: document.querySelector('.markdown-body blockquote.callout')?.getAttribute('data-callout'),
        images: document.querySelectorAll('.markdown-body img.md-image').length,
        imageSrc: img?.getAttribute('src') ?? null,
        imageLoaded: !!img && img.complete && img.naturalWidth > 0,
        footnotes: document.querySelectorAll('.markdown-body .footnote-ref, .markdown-body .footnotes').length,
        tasks: document.querySelectorAll('.markdown-body input.task-list-item-checkbox').length,
        code: document.querySelectorAll('.markdown-body pre code').length,
        tables: document.querySelectorAll('.markdown-body table').length,
      };
    })()`);
    assert(reading.title === 'Welcome', `reading title ${reading.title}`);
    assert(reading.callout >= 1, 'callout missing');
    assert(reading.calloutType === 'tip', `callout type ${reading.calloutType}`);
    assert(reading.images >= 1, 'image missing');
    assert(reading.imageSrc?.startsWith('vaultfile://'), `image src ${reading.imageSrc}`);
    assert(reading.imageLoaded, 'image did not load through vaultfile protocol');
    assert(reading.footnotes >= 1, 'footnote missing');
    assert(reading.tasks >= 4, `expected >=4 tasks, got ${reading.tasks}`);
    assert(reading.code >= 1, 'fenced code missing');
    await shot('03-reading');
    return reading;
  });

  await check('reading-view link context menu offers note and path actions', async () => {
    await rightClick('.markdown-body a[data-vault-path]', 'Ideas board');
    await waitFor(`!!document.querySelector('.context-menu')`, 'link context menu');
    const labels = await menuLabels();
    assert(labels.includes('Open in new tab'), `link open-in-new-tab missing: ${labels}`);
    assert(labels.includes('Open to the right'), `link open-to-the-right missing: ${labels}`);
    assert(labels.includes('Copy path'), `link copy-path missing: ${labels}`);
    assert(labels.includes('Show in system explorer'), `link reveal missing: ${labels}`);
    await shot('04-link-menu');
    await key('Escape');
    await waitFor(`!document.querySelector('.context-menu')`, 'link context menu closed');
    return { labels };
  });

  await check('reading-view task toggle saves the source file', async () => {
    await evaluate(`document.querySelector('.markdown-body input.task-list-item-checkbox').click()`);
    await sleep(700);
    const text = await readVault('Welcome.md');
    assert(text.includes('- [x] Rename a note'), 'task checkbox did not update source');
    const save = await waitFor(
      `document.querySelector('.editor-toolbar .save-state')?.innerText.trim() === 'Saved'`,
      'saved state after task toggle',
    );
    assert(save, 'save state never returned to Saved');
    return { saved: true };
  });

  await check('standard markdown link opens the linked note', async () => {
    const clicked = await evaluate(`(() => {
      const link = [...document.querySelectorAll('.markdown-body a[data-vault-path]')]
        .find((el) => (el.innerText || '').includes('Ideas board'));
      if (!link) return false;
      link.click();
      return true;
    })()`);
    assert(clicked, 'standard markdown link was not rendered with data-vault-path');
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Projects/Ideas.md'`,
      'Ideas tab from markdown link',
    );
    await clickByText('[role="treeitem"]', 'Welcome');
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Welcome.md'`,
      'Welcome tab restored',
    );
    return { opened: 'Projects/Ideas.md' };
  });

  await check('links panel shows backlinks, unresolved links and tags', async () => {
    await clickByText('.sidebar-right .segmented button', 'Links');
    await waitFor(`document.querySelectorAll('.backlink-item').length >= 2`, 'backlinks');
    const links = await evaluate(`(() => ({
      backlinks: [...document.querySelectorAll('.backlink-item')].map((el) => el.getAttribute('title')),
      unresolved: [...document.querySelectorAll('.unresolved-name')].map((el) => el.innerText.trim()),
      tags: [...document.querySelectorAll('.sidebar-right .tag-chip')].map((el) => el.innerText.trim()),
    }))()`);
    assert(links.backlinks.includes('Glossary.md'), `Glossary backlink missing: ${links.backlinks}`);
    assert(links.unresolved.includes('Scratchpad'), `Scratchpad unresolved missing: ${links.unresolved}`);
    assert(links.tags.some((tag) => tag.includes('welcome')), `welcome tag missing: ${links.tags}`);
    await shot('04-links');
    return links;
  });

  await check('vault search finds atlas and opens the match', async () => {
    await evaluate(`(() => {
      const seg = document.querySelector('.sidebar-left .segmented');
      if (!seg) throw new Error('segmented missing');
      const buttons = [...seg.querySelectorAll('button')];
      const search = buttons.find((b) => b.getAttribute('title') === 'Search the vault (Ctrl+Shift+F)') || buttons[1];
      if (!search) throw new Error('search button missing');
      search.click();
    })()`);
    await setInput('.search-input', 'atlas');
    await waitFor(`document.querySelectorAll('.search-result[role="option"]').length >= 1`, 'search results');
    const found = await evaluate(`(() => ({
      summary: document.querySelector('.search-summary')?.innerText.trim(),
      results: [...document.querySelectorAll('.search-result[role="option"]')].map((el) => ({
        title: el.querySelector('.search-result-title')?.innerText.trim(),
        marks: el.querySelectorAll('mark').length,
      })),
    }))()`);
    assert(found.summary && found.summary.includes('match'), `summary ${found.summary}`);
    assert(found.results.some((result) => result.marks > 0), 'snippet highlight missing');
    await evaluate(`document.querySelector('.search-result[role="option"]').click()`);
    await waitFor(
      `[...document.querySelectorAll('[role="tab"]')].some((el) => el.getAttribute('title') === 'Welcome.md')`,
      'Welcome tab after search',
    );
    const active = await evaluate(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title')`,
    );
    assert(active === 'Welcome.md', `search opened ${active}`);
    await shot('05-search');
    return { ...found, active };
  });

  await check('quick switcher command opens Ideas in a tab', async () => {
    await key('p', { ctrl: true });
    await waitFor(`!!document.querySelector('.palette-input')`, 'command palette');
    await setInput('.palette-input', 'quick switcher');
    await waitFor(
      `[...document.querySelectorAll('.palette-item')].some((el) => el.innerText.includes('Quick switcher'))`,
      'quick switcher candidate',
    );
    await key('Enter');
    await waitFor(
      `document.querySelector('.palette-input')?.getAttribute('aria-label') === 'Quick switcher query'`,
      'quick switcher input',
    );
    await setInput('.palette-input', 'Ideas');
    await waitFor(
      `[...document.querySelectorAll('.palette-item')].some((el) => el.innerText.includes('Ideas'))`,
      'Ideas candidate',
    );
    await key('Enter');
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Projects/Ideas.md'`,
      'Ideas active tab',
    );
    const tabs = await evaluate(
      `[...document.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('title'))`,
    );
    await shot('06-ideas');
    return tabs;
  });

  await check('tab context menu splits a note to the right', async () => {
    await rightClick('[role="tab"]', 'Projects/Ideas.md');
    await waitFor(`!!document.querySelector('.context-menu')`, 'tab context menu');
    const labels = await menuLabels();
    assert(labels.includes('Close other tabs'), `close-others missing: ${labels}`);
    assert(labels.includes('Close tabs to the right'), `close-after missing: ${labels}`);
    assert(labels.includes('Split right'), `split-right missing: ${labels}`);
    assert(labels.includes('Split down'), `split-down missing: ${labels}`);
    assert(labels.includes('Copy path'), `tab copy-path missing: ${labels}`);
    await shot('07-tab-menu');
    await clickByText('.context-menu .context-item', 'Split right');
    await waitFor(`document.querySelectorAll('.pane').length === 2`, 'split from tab menu');
    const panes = await evaluate(`[...document.querySelectorAll('.pane')].map((pane) => ({
      active: pane.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') ?? null,
      tabs: [...pane.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('title')),
    }))`);
    assert(
      panes[1]?.active === 'Projects/Ideas.md',
      `split pane active tab: ${JSON.stringify(panes)}`,
    );
    await evaluate(`document.querySelector('[aria-label="Close pane"]').click()`);
    await waitFor(`document.querySelectorAll('.pane').length === 1`, 'split pane closed');
    return { labels, panes };
  });

  await check('graph overlay plots notes and local mode toggles', async () => {
    await key('g', { ctrl: true });
    await waitFor(`!!document.querySelector('.graph-dialog .graph-canvas')`, 'graph canvas');
    const global = await evaluate(`(() => ({
      meta: document.querySelector('.graph-meta')?.innerText.trim(),
      canvas: (() => { const c = document.querySelector('.graph-canvas'); return { w: c.width, h: c.height }; })(),
    }))()`);
    assert(/\d+ notes/.test(global.meta ?? ''), `graph meta ${global.meta}`);
    assert(global.canvas.w > 0 && global.canvas.h > 0, 'graph canvas has no size');
    await evaluate(`document.querySelector('[aria-label="Local graph"]').click()`);
    await waitFor(`document.querySelector('.graph-meta')?.innerText.includes('local')`, 'local graph mode');
    const local = await evaluate(`document.querySelector('.graph-meta')?.innerText.trim()`);
    await shot('07-graph');
    await click('[aria-label="Close graph"]');
    await waitFor(`!document.querySelector('.graph-dialog')`, 'graph closed');
    return { global, local };
  });

  await check('settings dark theme applies and persists', async () => {
    await key(',', { ctrl: true });
    await waitFor(`!!document.querySelector('.settings-dialog')`, 'settings');
    await clickByText('.settings-nav button', 'Appearance');
    await waitFor(`!!document.querySelector('.theme-card[data-mode="dark"]')`, 'theme cards');
    await click('.theme-card[data-mode="dark"]');
    await waitFor(`document.documentElement.dataset.theme === 'dark'`, 'dark theme');
    await sleep(500);
    const appearance = JSON.parse(await readVault('.obsidia/appearance.json'));
    assert(appearance.theme === 'dark', `appearance theme ${appearance.theme}`);
    await shot('08-settings-dark');
    await key('Escape');
    await waitFor(`!document.querySelector('.settings-dialog')`, 'settings closed');
    return appearance;
  });

  await check('split pane toggles on and off', async () => {
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') || '').startsWith('Split pane'));
      if (!button) throw new Error('split button missing');
      button.click();
    })()`);
    await waitFor(`document.querySelectorAll('.pane').length === 2`, 'two panes');
    const two = await evaluate(`document.querySelectorAll('.pane').length`);
    await evaluate(`document.querySelector('[aria-label="Close pane"]').click()`);
    await waitFor(`document.querySelectorAll('.pane').length === 1`, 'one pane');
    return { two, final: await evaluate(`document.querySelectorAll('.pane').length`) };
  });

  await check('create, rename and autosave a new note', async () => {
    await key('n', { ctrl: true });
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Untitled.md'`,
      'Untitled tab',
    );
    await setInput('.note-title-input', 'Smoke Note');
    await key('Enter');
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Smoke Note.md'`,
      'renamed tab',
    );
    await waitFor(`!!document.querySelector('.cm-content')`, 'editor after rename');
    await appendToEditor('Smoke verification line.');
    await waitFor(
      `document.querySelector('.editor-toolbar .save-state')?.innerText.trim() === 'Saved'`,
      'autosave',
      8000,
    );
    const text = await readVault('Smoke Note.md');
    assert(text.includes('Smoke verification line.'), `saved content: ${JSON.stringify(text)}`);
    await evaluate(`(() => {
      const seg = document.querySelector('.sidebar-left .segmented');
      if (!seg) throw new Error('segmented missing');
      const buttons = [...seg.querySelectorAll('button')];
      const files = buttons.find((b) => b.getAttribute('title') === 'File explorer') || buttons[0];
      if (!files) throw new Error('files button missing');
      files.click();
    })()`);
    await waitFor(`document.querySelectorAll('[role="treeitem"]').length >= 6`, 'file tree restored');
    const rows = await evaluate(
      `[...document.querySelectorAll('[role="treeitem"]')].map((el) => el.getAttribute('title'))`,
    );
    assert(rows.includes('Smoke Note.md'), 'renamed note missing from tree');
    await shot('09-created-note');
    return { text, rows };
  });

  await check('editor context menu navigates by keyboard', async () => {
    await rightClick('.cm-content');
    await waitFor(`!!document.querySelector('.context-menu')`, 'editor context menu');
    const labels = await menuLabels();
    assert(labels.includes('Paste'), `paste missing: ${labels}`);
    assert(labels.includes('Select all'), `select-all missing: ${labels}`);
    assert(labels.includes('Bold'), `bold missing: ${labels}`);
    assert(labels.includes('Save note'), `save missing: ${labels}`);
    const first = await focusedMenuItem();
    assert(first === 'Cut', `first focused item ${first}`);
    await key('ArrowDown');
    const second = await focusedMenuItem();
    assert(second === 'Copy', `ArrowDown focused ${second}`);
    await key('End');
    const last = await focusedMenuItem();
    assert(last === 'Save note', `End focused ${last}`);
    await shot('09-editor-menu');
    await key('Escape');
    await waitFor(`!document.querySelector('.context-menu')`, 'editor context menu closed');
    return { labels, first, second, last };
  });

  await check('unsaved close prompt can save and close', async () => {
    await key('n', { ctrl: true });
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Untitled.md'`,
      'second Untitled tab',
    );
    await waitFor(`!!document.querySelector('.cm-content')`, 'editor for second note');
    await appendToEditor('Saved from the close prompt.');
    await key('w', { ctrl: true });
    await waitFor(
      `[...document.querySelectorAll('[role="dialog"]')].some((el) => el.innerText.includes('Unsaved changes'))`,
      'close prompt',
    );
    await clickByText('.modal-footer button', 'Save');
    await waitFor(
      `![...document.querySelectorAll('[role="tab"]')].some((el) => el.getAttribute('title') === 'Untitled.md')`,
      'tab closed after save',
    );
    const text = await readVault('Untitled.md');
    assert(text.includes('Saved from the close prompt.'), 'close prompt save did not write');
    await shot('10-dialog-saved');
    return { saved: true };
  });

  await check('delete moves the note to vault trash', async () => {
    await clickByText('[role="treeitem"]', 'Smoke Note');
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Smoke Note.md'`,
      'Smoke Note active',
    );
    await key('p', { ctrl: true });
    await waitFor(`!!document.querySelector('.palette-input')`, 'palette for delete');
    await setInput('.palette-input', 'Delete current note');
    await waitFor(
      `[...document.querySelectorAll('.palette-item')].some((el) => el.innerText.includes('Delete current note'))`,
      'delete command',
    );
    await key('Enter');
    await waitFor(
      `[...document.querySelectorAll('[role="dialog"]')].some((el) => el.innerText.includes('Move to trash?'))`,
      'delete dialog',
    );
    await clickByText('.modal-footer button', 'Move to trash');
    await waitFor(
      `![...document.querySelectorAll('[role="treeitem"]')].some((el) => el.getAttribute('title') === 'Smoke Note.md')`,
      'Smoke Note removed from tree',
    );
    assert(!(await exists('Smoke Note.md')), 'note still exists after trash');
    const trash = await findTrash();
    assert(trash.some((file) => file.endsWith('Smoke Note.md')), `trash contents: ${trash.join(', ')}`);
    await shot('11-deleted');
    return { trash };
  });

  await check('workspace and appearance persist across reload', async () => {
    await clickByText('[role="treeitem"]', 'Welcome');
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Welcome.md'`,
      'Welcome active before reload',
    );
    await sleep(1100);
    const workspace = JSON.parse(await readVault('.obsidia/workspace.json'));
    const clone = workspace.clone;
    assert(clone?.version === 1, 'clone workspace missing');
    assert(clone.panes[0].tabs.includes('Welcome.md'), `tabs ${clone.panes[0].tabs}`);
    assert(clone.panes[0].activeTab === 'Welcome.md', `active ${clone.panes[0].activeTab}`);
    assert(clone.recentFiles.includes('Welcome.md'), `recent ${clone.recentFiles}`);
    const appearance = JSON.parse(await readVault('.obsidia/appearance.json'));
    assert(appearance.theme === 'dark', 'theme not persisted before reload');
    await send('Page.reload', { ignoreCache: true });
    await waitFor(`!!document.querySelector('.app')`, 'shell after reload', 15_000);
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title') === 'Welcome.md'`,
      'restored active tab',
      15_000,
    );
    const restored = await evaluate(`(() => ({
      active: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('title'),
      tabs: [...document.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('title')),
      theme: document.documentElement.dataset.theme,
      reading: !!document.querySelector('.reading-inner'),
      rows: document.querySelectorAll('[role="treeitem"]').length,
    }))()`);
    assert(restored.theme === 'dark', `restored theme ${restored.theme}`);
    assert(restored.tabs.length >= 2, `restored tabs ${restored.tabs}`);
    assert(restored.rows >= 5, `restored tree ${restored.rows}`);
    await shot('12-restored');
    return { clone, restored };
  });

  await check('no renderer errors during the run', async () => {
    assert(consoleErrors.length === 0, consoleErrors.join(' | '));
    return { errors: 0 };
  });
} catch (error) {
  report.fatal = error instanceof Error ? error.stack ?? error.message : String(error);
  console.log('FATAL', report.fatal);
  try {
    await shot('99-fatal');
  } catch {
    // ignore
  }
} finally {
  report.logs = logs.join('');
  await fs.writeFile(path.join(base, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('BASE', base);
  console.log('CHECKS', checks.filter((entry) => entry.ok).length, '/', checks.length);
  child.kill();
  await sleep(600);
  process.exit(report.fatal || checks.some((entry) => !entry.ok) ? 1 : 0);
}
