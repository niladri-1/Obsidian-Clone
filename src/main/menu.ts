import { app, dialog, Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommandEvent } from '../shared/ipc';
import { IPC } from '../shared/ipc';

export type MenuCommandSender = (event: MenuCommandEvent) => void;

function item(
  label: string,
  command: string,
  send: MenuCommandSender,
  accelerator?: string,
): MenuItemConstructorOptions {
  return {
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send({ command }),
  };
}

export function installApplicationMenu(sendCommand: MenuCommandSender): Menu {
  const isMac = process.platform === 'darwin';

  const fileMenu: MenuItemConstructorOptions = {
    label: '&File',
    submenu: [
      item('New note', 'file:new-note', sendCommand, 'CmdOrCtrl+N'),
      item('New folder', 'file:new-folder', sendCommand, 'CmdOrCtrl+Shift+N'),
      { type: 'separator' },
      item('Save', 'file:save', sendCommand, 'CmdOrCtrl+S'),
      item('Close tab', 'file:close-tab', sendCommand, 'CmdOrCtrl+W'),
      { type: 'separator' },
      item('Open vault…', 'vault:open', sendCommand, 'CmdOrCtrl+Shift+O'),
      item('Create vault…', 'vault:create', sendCommand),
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      item('Find in note…', 'edit:find', sendCommand, 'CmdOrCtrl+F'),
      item('Search vault…', 'search:focus', sendCommand, 'CmdOrCtrl+Shift+F'),
      { type: 'separator' },
      item('Format: bold', 'format:bold', sendCommand),
      item('Format: italic', 'format:italic', sendCommand),
      item('Insert wikilink…', 'format:wikilink', sendCommand),
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: '&View',
    submenu: [
      item('Toggle left sidebar', 'view:toggle-left', sendCommand, 'CmdOrCtrl+Alt+B'),
      item('Toggle right sidebar', 'view:toggle-right', sendCommand, 'CmdOrCtrl+Shift+B'),
      item('Toggle reading view', 'view:toggle-reading', sendCommand, 'CmdOrCtrl+E'),
      item('Split pane', 'view:split', sendCommand, 'CmdOrCtrl+\\'),
      item('Graph view', 'view:graph', sendCommand, 'CmdOrCtrl+G'),
      { type: 'separator' },
      item('Zoom in', 'view:zoom-in', sendCommand, 'CmdOrCtrl+Plus'),
      item('Zoom out', 'view:zoom-out', sendCommand, 'CmdOrCtrl+-'),
      item('Reset zoom', 'view:zoom-reset', sendCommand, 'CmdOrCtrl+0'),
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as MenuItemConstructorOptions]),
    ],
  };

  const goMenu: MenuItemConstructorOptions = {
    label: '&Go',
    submenu: [
      item('Quick switcher…', 'nav:quick-open', sendCommand, 'CmdOrCtrl+O'),
      item('Command palette…', 'nav:command-palette', sendCommand, 'CmdOrCtrl+P'),
      item('Search…', 'search:focus', sendCommand, 'CmdOrCtrl+Shift+F'),
      item('Open today’s daily note', 'nav:daily-note', sendCommand),
      { type: 'separator' },
      item('Back', 'nav:back', sendCommand, 'Alt+Left'),
      item('Forward', 'nav:forward', sendCommand, 'Alt+Right'),
      { type: 'separator' },
      item('Settings…', 'app:settings', sendCommand, 'CmdOrCtrl+,'),
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: '&Help',
    submenu: [
      item('Keyboard shortcuts', 'app:shortcuts', sendCommand),
      item('Show vault folder', 'vault:reveal', sendCommand),
      { type: 'separator' },
      {
        label: 'About Obsidia',
        click: () => {
          void dialog.showMessageBox({
            type: 'info',
            title: 'About Obsidia',
            message: `Obsidia ${app.getVersion()}`,
            detail: [
              'A local-first Markdown notebook.',
              '',
              'Clean-room implementation built from behavioural analysis of a third-party',
              'application. It shares no code, assets, icons, themes or trademarks with it.',
            ].join('\n'),
            buttons: ['OK'],
          });
        },
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              item('Settings…', 'app:settings', sendCommand, 'CmdOrCtrl+,'),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    fileMenu,
    editMenu,
    viewMenu,
    goMenu,
    helpMenu,
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

/** Central helper used by `main/index.ts` to deliver menu commands to the focused window. */
export function menuCommandPayload(command: string): MenuCommandEvent {
  return { command };
}

export const MENU_EVENT_CHANNEL = IPC.eventMenuCommand;
