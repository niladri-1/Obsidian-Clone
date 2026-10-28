import { useEffect } from 'react';
import clsx from 'clsx';
import { AlertTriangle, FolderOpen, PanelLeft, PanelRight, RefreshCw } from 'lucide-react';
import { useStore } from './store/useStore';
import { useTheme } from './hooks/useTheme';
import { useAppEvents } from './hooks/useAppEvents';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { useCtrlScrollZoom } from './hooks/useCtrlScrollZoom';
import { TitleBar } from './components/shell/TitleBar';
import { Ribbon } from './components/shell/Ribbon';
import { Sidebar } from './components/shell/Sidebar';
import { Resizer } from './components/shell/Resizer';
import { StatusBar } from './components/shell/StatusBar';
import { IconButton } from './components/ui/IconButton';
import { Pane } from './components/workspace/Pane';
import { QuickSwitcher } from './components/overlays/QuickSwitcher';
import { CommandPalette } from './components/overlays/CommandPalette';
import { SettingsModal } from './components/overlays/SettingsModal';
import { GraphView } from './components/overlays/GraphView';
import { VaultPicker } from './components/overlays/VaultPicker';
import { Dialogs } from './components/overlays/Dialogs';
import { Toasts } from './components/overlays/Toasts';

function LoadingScreen() {
  return (
    <div className="vault-picker">
      <header className="picker-header">
        <span>Obsidia</span>
        <span>Starting…</span>
      </header>
      <div className="picker-loading">
        <span className="spinner" aria-hidden="true" />
        <span>Opening your vault…</span>
      </div>
    </div>
  );
}

function BootErrorScreen({ message }: { message: string | null }) {
  const bootstrap = useStore((state) => state.bootstrap);
  const chooseAndOpenVault = useStore((state) => state.chooseAndOpenVault);
  return (
    <div className="vault-picker">
      <header className="picker-header">
        <span>Obsidia</span>
        <span>Startup error</span>
      </header>
      <div className="boot-error" role="alert">
        <h2>
          <AlertTriangle size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          The app could not start
        </h2>
        <p className="dialog-text">
          The vault registry could not be read. You can retry, or open a specific folder as your
          vault.
        </p>
        <pre>{message ?? 'Unknown error'}</pre>
        <div className="picker-actions">
          <button type="button" className="button primary" onClick={() => void bootstrap()}>
            <RefreshCw size={15} />
            Try again
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => void chooseAndOpenVault('open')}
          >
            <FolderOpen size={15} />
            Open a vault
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceShell() {
  const panes = useStore((state) => state.workspace.panes);
  const activePaneId = useStore((state) => state.workspace.activePaneId);
  const horizontal = useStore((state) => state.workspace.splitDirection === 'horizontal');
  const leftOpen = useStore((state) => state.workspace.leftOpen);
  const rightOpen = useStore((state) => state.workspace.rightOpen);
  const leftWidth = useStore((state) => state.workspace.leftWidth);
  const rightWidth = useStore((state) => state.workspace.rightWidth);
  const setLeftOpen = useStore((state) => state.setLeftOpen);
  const setRightOpen = useStore((state) => state.setRightOpen);
  const setLeftWidth = useStore((state) => state.setLeftWidth);
  const setRightWidth = useStore((state) => state.setRightWidth);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Ribbon />
        {leftOpen ? (
          <Sidebar side="left" />
        ) : (
          <div className="sidebar-collapsed">
            <IconButton label="Show left sidebar" onClick={() => setLeftOpen(true)}>
              <PanelLeft size={18} />
            </IconButton>
          </div>
        )}
        {leftOpen && (
          <Resizer side="left" width={leftWidth} onChange={setLeftWidth} label="Resize left sidebar" />
        )}
        <main className="app-main">
          <div className={clsx('workspace', horizontal && 'is-horizontal')}>
            {panes.map((pane) => (
              <Pane
                key={pane.id}
                paneId={pane.id}
                tabs={pane.tabs}
                activeTab={pane.activeTab}
                active={pane.id === activePaneId}
              />
            ))}
          </div>
          <StatusBar />
        </main>
        {rightOpen ? (
          <Sidebar side="right" />
        ) : (
          <div className="sidebar-collapsed sidebar-collapsed-right">
            <IconButton label="Show right sidebar" onClick={() => setRightOpen(true)}>
              <PanelRight size={18} />
            </IconButton>
          </div>
        )}
        {rightOpen && (
          <Resizer
            side="right"
            width={rightWidth}
            onChange={setRightWidth}
            label="Resize right sidebar"
          />
        )}
      </div>

      <QuickSwitcher />
      <CommandPalette />
      <SettingsModal />
      <GraphView />
      <Dialogs />
      <Toasts />
    </div>
  );
}

export function App() {
  useTheme();
  useAppEvents();
  useGlobalHotkeys();
  useCtrlScrollZoom();

  const status = useStore((state) => state.status);
  const bootError = useStore((state) => state.bootError);
  const bootstrap = useStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.title = 'Obsidia';
  }, []);

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <BootErrorScreen message={bootError} />;
  if (status === 'picker') return <VaultPicker />;
  return <WorkspaceShell />;
}
