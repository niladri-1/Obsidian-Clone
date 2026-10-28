import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  FolderCog,
  Info,
  Keyboard,
  Palette,
  Settings2,
  X,
} from 'lucide-react';
import type { SettingsSection } from '../../store/types';
import { useStore } from '../../store/useStore';
import { commands } from '../../lib/commands';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';
import { Toggle } from '../ui/Toggle';

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: 'editor', label: 'Editor', icon: Settings2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'files', label: 'Files & links', icon: FolderCog },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

const ACCENTS = ['#7a5cb8', '#3f72b0', '#3c8087', '#3f8a62', '#b05a8b', '#c07a35'];

function PathField({
  value,
  label,
  help,
  onCommit,
}: {
  value: string;
  label: string;
  help: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    const next = draft.trim() || '/';
    setDraft(next);
    if (next !== value) onCommit(next);
  };
  return (
    <div className="setting-row">
      <div className="setting-info">
        <div className="setting-label">{label}</div>
        <div className="setting-help">{help}</div>
      </div>
      <div className="setting-control">
        <input
          className="text-input"
          value={draft}
          aria-label={label}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

export function SettingsModal() {
  const open = useStore((state) => state.ui.settingsOpen);
  const section = useStore((state) => state.ui.settingsSection);
  const settings = useStore((state) => state.settings);
  const vault = useStore((state) => state.vault);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const updateVault = useStore((state) => state.updateVaultSettings);
  const updateAppearance = useStore((state) => state.updateAppearance);
  const updateApp = useStore((state) => state.updateAppSettings);

  if (!open) return null;

  const { vault: vaultSettings, appearance, app } = settings;

  return (
    <Modal
      bare
      className="settings-dialog"
      onClose={() => setSettingsOpen(false)}
      ariaLabel="Settings"
      closeLabel="Close settings"
      initialFocus=".settings-nav button"
    >
      <header className="settings-header">
        <h2>Settings</h2>
        <span className="faint" style={{ fontSize: 'var(--font-tiny)' }}>
          {vault?.name ?? 'No vault'}
        </span>
        <IconButton label="Close settings" onClick={() => setSettingsOpen(false)}>
          <X size={16} />
        </IconButton>
      </header>

      <div className="settings-main">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                className={clsx(section === entry.id && 'is-active')}
                aria-current={section === entry.id ? 'page' : undefined}
                onClick={() => setSettingsOpen(true, entry.id)}
              >
                <Icon size={15} />
                {entry.label}
              </button>
            );
          })}
        </nav>

        <div className="settings-pane">
          {section === 'editor' && (
            <>
              <h3>Editor</h3>
              <p className="pane-intro">
                How notes are displayed and edited. Changes apply immediately to open notes.
              </p>

              <div className="settings-group">
                <h4>Display</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Readable line length</div>
                    <div className="setting-help">
                      Centre the note in a comfortable measure on wide windows.
                    </div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.readableLineLength}
                      label="Readable line length"
                      onChange={(next) => void updateVault({ readableLineLength: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Show inline title</div>
                    <div className="setting-help">
                      Display the note name above the editor. Renaming it renames the file.
                    </div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.showInlineTitle}
                      label="Show inline title"
                      onChange={(next) => void updateVault({ showInlineTitle: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Line numbers</div>
                    <div className="setting-help">Show a gutter with line numbers in source mode.</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.showLineNumber}
                      label="Line numbers"
                      onChange={(next) => void updateVault({ showLineNumber: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Default view</div>
                    <div className="setting-help">Mode used when a note has no saved mode.</div>
                  </div>
                  <div className="setting-control">
                    <select
                      className="select-input"
                      aria-label="Default view"
                      value={vaultSettings.defaultViewMode}
                      onChange={(event) =>
                        void updateVault({
                          defaultViewMode: event.target.value === 'reading' ? 'reading' : 'source',
                        })
                      }
                    >
                      <option value="source">Editing</option>
                      <option value="reading">Reading</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="settings-group">
                <h4>Editing</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Live preview</div>
                    <div className="setting-help">
                      Conceal Markdown markers on inactive lines and style links and tags.
                    </div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.livePreview}
                      label="Live preview"
                      onChange={(next) => void updateVault({ livePreview: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Auto-pair brackets</div>
                    <div className="setting-help">Close brackets and quotes as you type.</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.autoPairBrackets}
                      label="Auto-pair brackets"
                      onChange={(next) => void updateVault({ autoPairBrackets: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Spellcheck</div>
                    <div className="setting-help">Use the operating system spellchecker in the editor.</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.spellcheck}
                      label="Spellcheck"
                      onChange={(next) => void updateVault({ spellcheck: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Use tabs</div>
                    <div className="setting-help">Indent with tabs instead of spaces.</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.useTab}
                      label="Use tabs"
                      onChange={(next) => void updateVault({ useTab: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Tab size</div>
                    <div className="setting-help">Width of one indentation level.</div>
                  </div>
                  <div className="setting-control">
                    <select
                      className="select-input"
                      aria-label="Tab size"
                      value={vaultSettings.tabSize}
                      onChange={(event) =>
                        void updateVault({ tabSize: Number(event.target.value) || 4 })
                      }
                    >
                      {[2, 4, 6, 8].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'appearance' && (
            <>
              <h3>Appearance</h3>
              <p className="pane-intro">
                Theme, accent and text size are stored per vault in{' '}
                <code>.obsidia/appearance.json</code>.
              </p>

              <div className="settings-group">
                <h4>Theme</h4>
                <div className="theme-options">
                  {(['system', 'light', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      data-mode={mode}
                      className={clsx('theme-card', appearance.theme === mode && 'is-active')}
                      aria-pressed={appearance.theme === mode}
                      onClick={() => {
                        void updateAppearance({ theme: mode });
                        void updateApp({ theme: mode });
                      }}
                    >
                      <span className="theme-preview">
                        <span className="tp-side" />
                        <span className="tp-page" />
                      </span>
                      {mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <h4>Accent</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Accent colour</div>
                    <div className="setting-help">
                      Used for selection, links and primary actions.
                    </div>
                  </div>
                  <div className="swatch-row">
                    {ACCENTS.map((colour) => (
                      <button
                        key={colour}
                        type="button"
                        className={clsx(
                          'swatch',
                          appearance.accentColor.toLowerCase() === colour && 'is-active',
                        )}
                        style={{ background: colour }}
                        aria-label={`Use accent ${colour}`}
                        title={colour}
                        onClick={() => void updateAppearance({ accentColor: colour })}
                      />
                    ))}
                    <input
                      type="color"
                      className="color-input"
                      aria-label="Custom accent colour"
                      value={appearance.accentColor || '#7a5cb8'}
                      onChange={(event) =>
                        void updateAppearance({ accentColor: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="button sm ghost"
                      onClick={() => void updateAppearance({ accentColor: '' })}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Base font size</div>
                    <div className="setting-help">Scales chrome and note text together.</div>
                  </div>
                  <div className="setting-control">
                    <input
                      className="range"
                      type="range"
                      min={12}
                      max={24}
                      step={1}
                      value={appearance.baseFontSize}
                      aria-label="Base font size"
                      onChange={(event) =>
                        void updateAppearance({ baseFontSize: Number(event.target.value) })
                      }
                    />
                    <span className="range-value">{appearance.baseFontSize}px</span>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Interface zoom</div>
                    <div className="setting-help">Global zoom, also available with Ctrl+= / Ctrl+-.</div>
                  </div>
                  <div className="setting-control">
                    <input
                      className="range"
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={app.zoom}
                      aria-label="Interface zoom"
                      onChange={(event) =>
                        void updateApp({ zoom: Number(event.target.value) })
                      }
                    />
                    <span className="range-value">{Math.round(app.zoom * 100)}%</span>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Zoom with Ctrl+Scroll</div>
                    <div className="setting-help">Hold Ctrl (or Cmd) and scroll to zoom in/out.</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={app.ctrlScrollZoom !== false}
                      label="Zoom with Ctrl+Scroll"
                      onChange={(next) => void updateApp({ ctrlScrollZoom: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">UI font</div>
                    <div className="setting-help">
                      Use a font installed on your system (e.g. Inter, Segoe UI, system-ui).
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      className="text-input"
                      placeholder="e.g. Inter, -apple-system, sans-serif"
                      aria-label="UI font family"
                      value={appearance.fontFamily ?? ''}
                      spellCheck={false}
                      onChange={(event) =>
                        void updateAppearance({ fontFamily: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Editor font</div>
                    <div className="setting-help">
                      Font used in the Markdown editor (e.g. Cascadia Code, JetBrains Mono, monospace).
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      className="text-input"
                      placeholder="e.g. Cascadia Code, monospace"
                      aria-label="Editor font family"
                      value={appearance.editorFontFamily ?? ''}
                      spellCheck={false}
                      onChange={(event) =>
                        void updateAppearance({ editorFontFamily: event.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'files' && (
            <>
              <h3>Files &amp; links</h3>
              <p className="pane-intro">
                Defaults for new notes, attachments and how links behave when files are renamed.
              </p>

              <div className="settings-group">
                <h4>New notes</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Default location</div>
                    <div className="setting-help">Where new notes are created by default.</div>
                  </div>
                  <div className="setting-control">
                    <select
                      className="select-input"
                      aria-label="Default location for new notes"
                      value={vaultSettings.newFileLocation}
                      onChange={(event) => {
                        const value = event.target.value;
                        void updateVault({
                          newFileLocation:
                            value === 'current' || value === 'folder' ? value : 'root',
                        });
                      }}
                    >
                      <option value="root">Vault root</option>
                      <option value="current">Same folder as current note</option>
                      <option value="folder">In a specific folder</option>
                    </select>
                  </div>
                </div>
                <PathField
                  value={vaultSettings.newFileFolderPath}
                  label="New note folder"
                  help="Vault-relative folder used by the “specific folder” option."
                  onCommit={(next) => void updateVault({ newFileFolderPath: next })}
                />
                <PathField
                  value={vaultSettings.attachmentFolderPath}
                  label="Attachment folder"
                  help="Where pasted or imported attachments are stored."
                  onCommit={(next) => void updateVault({ attachmentFolderPath: next })}
                />
              </div>

              <div className="settings-group">
                <h4>Links</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Update links on rename</div>
                    <div className="setting-help">
                      Rewrite resolvable wikilinks and Markdown links when a note is renamed.
                    </div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.alwaysUpdateLinks}
                      label="Update links on rename"
                      onChange={(next) => void updateVault({ alwaysUpdateLinks: next })}
                    />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Use Markdown links</div>
                    <div className="setting-help">
                      When rewriting links, emit <code>[text](relative/path.md)</code> instead of
                      wikilinks.
                    </div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.useMarkdownLinks}
                      label="Use Markdown links"
                      onChange={(next) => void updateVault({ useMarkdownLinks: next })}
                    />
                  </div>
                </div>
              </div>

              <div className="settings-group">
                <h4>Deleting</h4>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Delete behaviour</div>
                    <div className="setting-help">
                      Vault trash keeps deleted files under <code>.obsidia/trash/</code> so the
                      vault folder remains the only write target.
                    </div>
                  </div>
                  <div className="setting-control">
                    <select
                      className="select-input"
                      aria-label="Delete behaviour"
                      value={vaultSettings.trashOption}
                      onChange={(event) =>
                        void updateVault({
                          trashOption: event.target.value === 'permanent' ? 'permanent' : 'local',
                        })
                      }
                    >
                      <option value="local">Move to vault trash</option>
                      <option value="permanent">Delete permanently</option>
                    </select>
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-label">Confirm before deleting</div>
                    <div className="setting-help">Ask before moving a file or folder to the trash.</div>
                  </div>
                  <div className="setting-control">
                    <Toggle
                      checked={vaultSettings.promptDelete}
                      label="Confirm before deleting"
                      onChange={(next) => void updateVault({ promptDelete: next })}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'hotkeys' && (
            <>
              <h3>Hotkeys</h3>
              <p className="pane-intro">
                Reference list of keyboard shortcuts. Context menus and the command palette expose
                the same commands.
              </p>
              <table className="hotkey-table">
                <thead>
                  <tr>
                    <th>Command</th>
                    <th>Hotkey</th>
                  </tr>
                </thead>
                <tbody>
                  {commands
                    .filter((command) => command.hotkey)
                    .map((command) => (
                      <tr key={command.id}>
                        <td>{command.label}</td>
                        <td>
                          <span className="kbd">{command.hotkey}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}

          {section === 'about' && (
            <>
              <h3>About</h3>
              <div className="about-block">
                <div className="about-brand">
                  <span className="brand-mark" aria-hidden>
                    <Info size={22} />
                  </span>
                  <div>
                    <h3>Obsidia</h3>
                    <p>Version 1.0.0 · original clean-room implementation</p>
                  </div>
                </div>
                <p>
                  A local-first Markdown notebook. Notes are ordinary <code>.md</code> files in a
                  folder you choose; nothing is uploaded and there is no account or telemetry.
                </p>
                <ul className="about-list">
                  <li>Wiki-style links, backlinks, embeds, tags and YAML properties.</li>
                  <li>Source editor with live preview and a sanitised reading view.</li>
                  <li>Full-vault search, quick switcher, command palette and graph.</li>
                  <li>Per-vault tabs, panes, sidebars and settings.</li>
                </ul>
                <dl className="about-kv">
                  <dt>Data folder</dt>
                  <dd>{vault?.path ?? 'No vault open'}</dd>
                  <dt>Settings</dt>
                  <dd>
                    <code>.obsidia/app.json</code>, <code>appearance.json</code>,{' '}
                    <code>workspace.json</code>
                  </dd>
                  <dt>Electron</dt>
                  <dd>Sandboxed renderer · context isolation · no Node in the page</dd>
                  <dt>Security</dt>
                  <dd>
                    All file operations are validated against the vault root; rejected paths never
                    reach the filesystem.
                  </dd>
                </dl>
                <p className="faint">
                  This application is an independent implementation. It is not affiliated with or
                  endorsed by any third-party note-taking product.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
