import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface MockWindow {
  options: {
    webPreferences: Record<string, unknown>;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
  };
  webContents: {
    getURL: () => string;
  };
  openHandler: ((details: { url: string }) => { action: 'deny' }) | null;
  handlers: Record<string, (event: { preventDefault: () => void }, url?: string) => void>;
  show: () => void;
  maximize: () => void;
}

const electronMock = vi.hoisted(() => ({
  windows: [] as unknown[],
  openCalls: [] as string[],
  showCalls: 0,
  maximizeCalls: 0,
}));

vi.mock('electron', () => {
  class BrowserWindow {
    options: unknown;
    webContents: unknown;
    openHandler: unknown = null;
    handlers: Record<string, unknown> = {};
    show = () => {
      electronMock.showCalls += 1;
    };
    maximize = () => {
      electronMock.maximizeCalls += 1;
    };

    constructor(options: unknown) {
      this.options = options;
      this.webContents = {
        setWindowOpenHandler: (handler: unknown) => {
          this.openHandler = handler;
        },
        on: (event: string, handler: unknown) => {
          this.handlers[event] = handler;
        },
        getURL: () => 'file:///app/index.html',
      };
      electronMock.windows.push(this);
    }

    once(event: string, handler: () => void): void {
      if (event === 'ready-to-show') handler();
    }
  }

  return {
    BrowserWindow,
    shell: {
      openExternal: async (url: string) => {
        electronMock.openCalls.push(url);
      },
    },
  };
});

const { ALLOWED_EXTERNAL_PROTOCOLS, PRODUCTION_CSP, SECURE_RENDERER_PREFERENCES, isAllowedExternalUrl, secureWebPreferences } =
  await import('../src/main/security');
const { WindowStateStore, createMainWindow } = await import('../src/main/window');

afterEach(() => {
  electronMock.windows.length = 0;
  electronMock.openCalls.length = 0;
  electronMock.showCalls = 0;
  electronMock.maximizeCalls = 0;
});

describe('renderer security preferences', () => {
  it('keeps context isolation, sandboxing and no Node integration', () => {
    expect(SECURE_RENDERER_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
    });
    expect(secureWebPreferences('/tmp/preload.js')).toEqual({
      ...SECURE_RENDERER_PREFERENCES,
      preload: '/tmp/preload.js',
    });
  });

  it('allowlists only http, https and mailto external URLs', () => {
    expect(ALLOWED_EXTERNAL_PROTOCOLS).toEqual(['http:', 'https:', 'mailto:']);
    for (const url of [
      'https://example.com',
      'http://example.com/path?q=1',
      'mailto:someone@example.com',
    ]) {
      expect(isAllowedExternalUrl(url)).toBe(true);
    }
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//example.com',
      'relative/path',
      'not a url',
      `https://example.com/${'a'.repeat(2048)}`,
    ]) {
      expect(isAllowedExternalUrl(url)).toBe(false);
    }
  });

  it('ships a strict production CSP without unsafe script execution', () => {
    expect(PRODUCTION_CSP).toContain("default-src 'self'");
    expect(PRODUCTION_CSP).toContain("script-src 'self'");
    expect(PRODUCTION_CSP).toContain("object-src 'none'");
    expect(PRODUCTION_CSP).toContain("frame-src 'none'");
    expect(PRODUCTION_CSP).not.toContain('unsafe-eval');
    expect(PRODUCTION_CSP).not.toContain('unsafe-inline;');
  });
});

describe('window factory', () => {
  it('constructs a secure window with the supplied preload and bounds', () => {
    const win = createMainWindow({
      preloadPath: 'C:/app/preload.js',
      bounds: { width: 1100, height: 720, maximized: false },
    }) as unknown as MockWindow;

    expect(electronMock.windows).toHaveLength(1);
    expect(win.options).toMatchObject({ width: 1100, height: 720, minWidth: 640, minHeight: 420 });
    expect(win.options.webPreferences).toMatchObject({
      ...SECURE_RENDERER_PREFERENCES,
      preload: 'C:/app/preload.js',
    });
    expect(electronMock.showCalls).toBe(1);
    expect(electronMock.maximizeCalls).toBe(0);
  });

  it('maximises when requested', () => {
    createMainWindow({
      preloadPath: '/preload.js',
      bounds: { width: 1100, height: 720, maximized: true },
    });
    expect(electronMock.maximizeCalls).toBe(1);
  });

  it('denies new windows and only opens allowlisted external URLs', () => {
    const win = createMainWindow({
      preloadPath: '/preload.js',
      bounds: { width: 900, height: 600, maximized: false },
    }) as unknown as MockWindow;

    expect(win.openHandler).toBeTypeOf('function');
    expect(win.openHandler!({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    expect(win.openHandler!({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(win.openHandler!({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(electronMock.openCalls).toEqual(['https://example.com']);
  });

  it('blocks navigation away from the app and webview attachment', () => {
    const win = createMainWindow({
      preloadPath: '/preload.js',
      bounds: { width: 900, height: 600, maximized: false },
    }) as unknown as MockWindow;

    const same = { preventDefault: vi.fn() };
    win.handlers['will-navigate']!(same, 'file:///app/index.html');
    expect(same.preventDefault).not.toHaveBeenCalled();

    const away = { preventDefault: vi.fn() };
    win.handlers['will-navigate']!(away, 'https://evil.example');
    expect(away.preventDefault).toHaveBeenCalledOnce();

    const webview = { preventDefault: vi.fn() };
    win.handlers['will-attach-webview']!(webview);
    expect(webview.preventDefault).toHaveBeenCalledOnce();
  });
});

describe('window state', () => {
  let userData: string;

  afterEach(async () => {
    if (userData) await fs.rm(userData, { recursive: true, force: true });
  });

  it('persists geometry per vault and clamps bad values', async () => {
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-window-'));
    const store = new WindowStateStore(userData);
    await expect(store.load('vault-a')).resolves.toEqual({
      width: 1280,
      height: 800,
      maximized: false,
    });

    await store.save('vault-a', { x: 10, y: 20, width: 1000, height: 700, maximized: true });
    await store.save('vault-b', { width: 99, height: 99, maximized: false });
    await expect(store.load('vault-a')).resolves.toEqual({
      x: 10,
      y: 20,
      width: 1000,
      height: 700,
      maximized: true,
    });
    await expect(store.load('vault-b')).resolves.toEqual({
      width: 640,
      height: 420,
      maximized: false,
    });
  });

  it('returns defaults when the state file is corrupt', async () => {
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-window-'));
    await fs.writeFile(path.join(userData, 'window-state.json'), '{broken', 'utf8');
    const store = new WindowStateStore(userData);
    await expect(store.load('vault-a')).resolves.toEqual({
      width: 1280,
      height: 800,
      maximized: false,
    });
  });
});
