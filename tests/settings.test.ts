import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PersistedWorkspaceV1 } from '../src/shared/types';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_APP_SETTINGS,
  DEFAULT_VAULT_SETTINGS,
  GlobalSettingsStore,
  VaultSettingsStore,
} from '../src/main/vault/settings';

let root: string;
let userData: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-settings-'));
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-userdata-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(userData, { recursive: true, force: true });
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}

describe('vault settings', () => {
  it('creates the config folder and returns defaults when no file exists', async () => {
    const store = new VaultSettingsStore(root);
    const loaded = await store.load();
    expect(loaded.settings).toEqual(DEFAULT_VAULT_SETTINGS);
    expect(loaded.appearance).toEqual(DEFAULT_APPEARANCE);
    await expect(fs.stat(path.join(root, '.obsidia'))).resolves.toBeTruthy();
  });

  it('clamps invalid values and preserves unknown keys across writes', async () => {
    const config = path.join(root, '.obsidia');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(
      path.join(config, 'app.json'),
      JSON.stringify({ tabSize: 99, theme: 'bogus', custom: { keep: true } }),
      'utf8',
    );

    const store = new VaultSettingsStore(root);
    const loaded = await store.load();
    expect(loaded.settings.tabSize).toBe(8);
    expect(loaded.settings.defaultViewMode).toBe('source');

    const updated = await store.updateVault({ readableLineLength: false });
    expect(updated.readableLineLength).toBe(false);

    const raw = await readJson(path.join(config, 'app.json'));
    expect(raw.custom).toEqual({ keep: true });
    expect(raw.theme).toBe('bogus');
    expect(raw.tabSize).toBe(8);
    expect(raw.readableLineLength).toBe(false);
  });

  it('backs up corrupt JSON and falls back to defaults', async () => {
    const config = path.join(root, '.obsidia');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(path.join(config, 'app.json'), '{not json', 'utf8');

    const store = new VaultSettingsStore(root);
    const loaded = await store.load();
    expect(loaded.settings).toEqual(DEFAULT_VAULT_SETTINGS);
    const entries = await fs.readdir(config);
    expect(entries.some((entry) => entry.startsWith('app.json.corrupt-'))).toBe(true);
  });

  it('sanitises appearance values', async () => {
    const config = path.join(root, '.obsidia');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(
      path.join(config, 'appearance.json'),
      JSON.stringify({ accentColor: 'red', baseFontSize: 99, theme: 'dark' }),
      'utf8',
    );
    const store = new VaultSettingsStore(root);
    const loaded = await store.load();
    expect(loaded.appearance).toEqual({ theme: 'dark', accentColor: '', baseFontSize: 32 });
    const updated = await store.updateAppearance({ accentColor: '#AABBCC' });
    expect(updated.accentColor).toBe('#aabbcc');
  });
});

describe('global settings', () => {
  it('sanitises zoom and preserves unknown keys', async () => {
    const store = new GlobalSettingsStore(userData);
    expect(await store.load()).toEqual(DEFAULT_APP_SETTINGS);
    const clamped = await store.update({ zoom: 3 });
    expect(clamped.zoom).toBe(1);
    const valid = await store.update({ zoom: 1.5 });
    expect(valid.zoom).toBe(1.5);
    const file = path.join(userData, 'settings.json');
    const raw = await readJson(file);
    expect(raw.zoom).toBe(1.5);
    expect(raw.unknownFutureKey).toBeUndefined();

    const withUnknown = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    withUnknown.unknownFutureKey = 'kept';
    await fs.writeFile(file, JSON.stringify(withUnknown), 'utf8');
    const reloaded = new GlobalSettingsStore(userData);
    await reloaded.load();
    await reloaded.update({ theme: 'dark' });
    const after = await readJson(file);
    expect(after.unknownFutureKey).toBe('kept');
    expect(after.theme).toBe('dark');
  });
});

const workspace: PersistedWorkspaceV1 = {
  version: 1,
  panes: [
    { id: 'pane-1', tabs: ['a.md', 'b.md'], activeTab: 'a.md' },
    { id: 'pane-2', tabs: ['c.md'], activeTab: 'c.md' },
  ],
  activePaneId: 'pane-2',
  splitDirection: 'horizontal',
  leftOpen: false,
  rightOpen: true,
  leftWidth: 260,
  rightWidth: 300,
  activeLeftView: 'search',
  activeRightView: 'backlinks',
  recentFiles: ['a.md', 'b.md'],
  expandedFolders: ['notes'],
  viewModes: { 'a.md': 'reading' },
};

describe('workspace persistence', () => {
  it('round-trips panes and sidebars', async () => {
    const store = new VaultSettingsStore(root);
    await store.writeWorkspace(workspace);
    await expect(store.readWorkspace()).resolves.toEqual(workspace);
  });

  it('preserves foreign and unknown workspace keys and does not overwrite the main tree', async () => {
    const config = path.join(root, '.obsidia');
    await fs.mkdir(config, { recursive: true });
    const mainTree = { version: 1, panes: [{ id: 'main-pane', tabs: ['foreign.md'] }] };
    await fs.writeFile(
      path.join(config, 'workspace.json'),
      JSON.stringify({ main: { version: 1, panes: mainTree.panes }, unknown: 42, clone: null }),
      'utf8',
    );

    const store = new VaultSettingsStore(root);
    await store.readWorkspace();
    await store.writeWorkspace(workspace);

    const raw = await readJson(path.join(config, 'workspace.json'));
    expect(raw.main).toEqual(mainTree);
    expect(raw.unknown).toBe(42);
    expect(raw.clone).toMatchObject({ version: 1, activePaneId: 'pane-2' });
    expect(raw.lastOpenFiles).toEqual(['a.md', 'b.md']);
  });

  it('clamps panes, widths, tabs, recent files and view modes', async () => {
    const store = new VaultSettingsStore(root);
    const messy = {
      ...workspace,
      panes: Array.from({ length: 6 }, (_, index) => ({
        id: `pane-${index}`,
        tabs: Array.from({ length: 150 }, (_, tab) => `note-${index}-${tab}.md`),
        activeTab: 'missing.md',
      })),
      activePaneId: 'does-not-exist',
      splitDirection: 'diagonal',
      leftWidth: 9999,
      rightWidth: -5,
      activeLeftView: 'graph',
      activeRightView: 'unknown',
      recentFiles: Array.from({ length: 100 }, () => 'same.md'),
      viewModes: { 'a.md': 'reading', 'b.md': 'invalid', ['x'.repeat(5000)]: 'source' },
    } as unknown as PersistedWorkspaceV1;

    await store.writeWorkspace(messy);
    const raw = await readJson(path.join(root, '.obsidia', 'workspace.json'));
    const clone = raw.clone as Record<string, unknown>;
    expect((clone.panes as unknown[]).length).toBe(4);
    expect(((clone.panes as Array<{ tabs: string[] }>)[0]!).tabs.length).toBe(100);
    expect(clone.activePaneId).toBe('pane-0');
    expect(clone.splitDirection).toBe('vertical');
    expect(clone.leftWidth).toBe(520);
    expect(clone.rightWidth).toBe(160);
    expect(clone.activeLeftView).toBe('files');
    expect(clone.activeRightView).toBe('outline');
    expect(clone.recentFiles).toEqual(['same.md']);
    expect(clone.viewModes).toEqual({ 'a.md': 'reading' });
    expect(raw.lastOpenFiles).toEqual(['same.md']);
  });

  it('returns null for a missing or foreign workspace and backs up corrupt JSON', async () => {
    const store = new VaultSettingsStore(root);
    await expect(store.readWorkspace()).resolves.toBeNull();

    const config = path.join(root, '.obsidia');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(path.join(config, 'workspace.json'), '{"version":2}', 'utf8');
    await expect(store.readWorkspace()).resolves.toBeNull();

    await fs.writeFile(path.join(config, 'workspace.json'), '{oops', 'utf8');
    await expect(store.readWorkspace()).resolves.toBeNull();
    const entries = await fs.readdir(config);
    expect(entries.some((entry) => entry.startsWith('workspace.json.corrupt-'))).toBe(true);
  });

  it('leaves no temporary files behind', async () => {
    const store = new VaultSettingsStore(root);
    await store.writeWorkspace(workspace);
    const entries = await fs.readdir(path.join(root, '.obsidia'));
    expect(entries.filter((entry) => entry.startsWith('.~'))).toEqual([]);
  });
});
