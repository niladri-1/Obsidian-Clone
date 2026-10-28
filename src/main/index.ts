import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { IPC } from '../shared/ipc';
import type { MenuCommandEvent } from '../shared/ipc';
import type { VaultInfo } from '../shared/types';
import { registerIpc } from './ipc';
import { installApplicationMenu } from './menu';
import { isAllowedExternalUrl, PRODUCTION_CSP } from './security';
import { handleVaultProtocol, registerVaultScheme } from './vault-asset-protocol';
import { GlobalSettingsStore } from './vault/settings';
import { VaultRegistry } from './vault/registry';
import { boundsOf, createMainWindow, WindowStateStore } from './window';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let activeVaultRoot: string | null = null;
let activeStateKey = 'default';
let windowStates: WindowStateStore | null = null;
let windowStateTimer: NodeJS.Timeout | null = null;
let allowWindowClose = false;
let closeHandshakeStarted = false;
let quitting = false;

registerVaultScheme();

function sendMenuCommand(event: MenuCommandEvent): void {
  const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!target || target.isDestroyed()) return;
  target.webContents.send(IPC.eventMenuCommand, event);
}

function applySessionHardening(): void {
  const defaultSession = session.defaultSession;
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  defaultSession.setPermissionCheckHandler(() => false);

  // The built renderer also ships a meta CSP; this header covers responses served
  // inside the app origin. Development is exempt because Vite's React refresh
  // preamble uses an inline module.
  if (app.isPackaged) {
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [PRODUCTION_CSP],
          'X-Content-Type-Options': ['nosniff'],
        },
      });
    });
  }
}

function persistWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !windowStates) return;
  const key = activeStateKey;
  const bounds = boundsOf(mainWindow);
  void windowStates.save(key, bounds).catch(() => undefined);
}

function scheduleWindowStateSave(): void {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null;
    persistWindowState();
  }, 500);
}

function finishClose(): void {
  if (allowWindowClose) return;
  allowWindowClose = true;
  persistWindowState();
  app.quit();
}

function installCloseHandshake(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (allowWindowClose || quitting) return;
    event.preventDefault();
    if (closeHandshakeStarted) return;
    closeHandshakeStarted = true;
    persistWindowState();
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.eventMenuCommand, { command: 'app:before-close' } satisfies MenuCommandEvent);
    }
    // The renderer flushes dirty buffers and acknowledges via `app:quit-ready`.
    setTimeout(finishClose, 1600);
  });

  window.on('resize', scheduleWindowStateSave);
  window.on('move', scheduleWindowStateSave);
  window.on('maximize', scheduleWindowStateSave);
  window.on('unmaximize', scheduleWindowStateSave);
}

async function bootstrap(): Promise<void> {
  const userData = app.getPath('userData');
  const globalSettings = new GlobalSettingsStore(userData);
  let appSettings = await globalSettings.load();
  const registry = new VaultRegistry(userData);
  windowStates = new WindowStateStore(userData);

  try {
    const listed = await registry.list();
    activeStateKey = listed.lastVaultId ?? 'default';
  } catch {
    activeStateKey = 'default';
  }

  const savedBounds = await windowStates.load(activeStateKey);

  if (process.platform === 'win32') app.setAppUserModelId('com.obsidia.app');

  applySessionHardening();
  handleVaultProtocol(() => activeVaultRoot);

  mainWindow = createMainWindow({
    preloadPath: path.join(__dirname, '../preload/index.js'),
    bounds: savedBounds,
  });
  installCloseHandshake(mainWindow);
  installApplicationMenu(sendMenuCommand);

  const disposer = registerIpc({
    registry,
    globalSettings,
    userDataDirectory: userData,
    getAppSettings: () => appSettings,
    setAppSettings: (next) => {
      appSettings = next;
    },
    onVaultOpened: (info: VaultInfo) => {
      activeVaultRoot = info.path;
      persistWindowState();
      activeStateKey = info.id;
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    void disposer.dispose();
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.on(IPC.appQuitReady, () => {
  if (closeHandshakeStarted) finishClose();
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap();
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
});

void app.whenReady().then(bootstrap).catch((error: unknown) => {
  dialog.showErrorBox(
    'Obsidia could not start',
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  app.quit();
});
