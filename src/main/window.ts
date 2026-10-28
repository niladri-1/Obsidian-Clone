import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { isAllowedExternalUrl, secureWebPreferences } from './security';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_BOUNDS: WindowBounds = {
  width: 1280,
  height: 800,
  maximized: false,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeBounds(raw: unknown): WindowBounds {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_BOUNDS };
  const candidate = raw as Record<string, unknown>;
  const bounds: WindowBounds = {
    width: isFiniteNumber(candidate.width)
      ? Math.min(6000, Math.max(640, Math.round(candidate.width)))
      : DEFAULT_BOUNDS.width,
    height: isFiniteNumber(candidate.height)
      ? Math.min(4000, Math.max(420, Math.round(candidate.height)))
      : DEFAULT_BOUNDS.height,
    maximized: candidate.maximized === true,
  };
  if (isFiniteNumber(candidate.x)) bounds.x = Math.round(candidate.x);
  if (isFiniteNumber(candidate.y)) bounds.y = Math.round(candidate.y);
  return bounds;
}

/**
 * Window geometry persisted per vault (keyed by the registry vault id). The file is a
 * plain JSON map so a corrupt entry can be discarded without losing other vaults.
 */
export class WindowStateStore {
  private readonly file: string;
  private cache: Record<string, WindowBounds> | null = null;

  constructor(userDataDirectory: string) {
    this.file = path.join(userDataDirectory, 'window-state.json');
  }

  private async loadAll(): Promise<Record<string, WindowBounds>> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse((await fs.readFile(this.file, 'utf8')).replace(/^\uFEFF/, '')) as unknown;
      const store: Record<string, WindowBounds> = {};
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          if (key.length <= 4096) store[key] = sanitizeBounds(value);
        }
      }
      this.cache = store;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  async load(key: string): Promise<WindowBounds> {
    const all = await this.loadAll();
    return { ...(all[key] ?? DEFAULT_BOUNDS) };
  }

  async save(key: string, bounds: WindowBounds): Promise<void> {
    const all = await this.loadAll();
    all[key] = sanitizeBounds(bounds);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    await fs.rename(temp, this.file).catch(async () => {
      await fs.writeFile(this.file, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
      await fs.unlink(temp).catch(() => undefined);
    });
  }
}

export function boundsOf(window: BrowserWindow): WindowBounds {
  const normal = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  return {
    x: normal.x,
    y: normal.y,
    width: normal.width,
    height: normal.height,
    maximized: window.isMaximized(),
  };
}

export function createMainWindow(options: {
  preloadPath: string;
  bounds: WindowBounds;
}): BrowserWindow {
  const window = new BrowserWindow({
    x: options.bounds.x,
    y: options.bounds.y,
    width: options.bounds.width,
    height: options.bounds.height,
    minWidth: 640,
    minHeight: 420,
    show: false,
    backgroundColor: '#16161c',
    title: 'Obsidia',
    autoHideMenuBar: false,
    webPreferences: secureWebPreferences(options.preloadPath),
  });

  if (options.bounds.maximized) window.maximize();

  window.once('ready-to-show', () => {
    window.show();
  });

  // Defence in depth: never create renderer windows, never navigate away from the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  return window;
}
