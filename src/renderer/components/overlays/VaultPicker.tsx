import { useMemo } from 'react';
import {
  ArrowLeft,
  BookOpen,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  X,
} from 'lucide-react';
import type { VaultInfo } from '@shared/types';
import { useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';

function formatWhen(timestamp: number): string {
  if (!timestamp) return 'Never opened';
  const then = new Date(timestamp);
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return then.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function VaultCard({
  vault,
  onOpen,
  onRemove,
}: {
  vault: VaultInfo;
  onOpen: (vault: VaultInfo) => void;
  onRemove: (vault: VaultInfo) => void;
}) {
  const missing = vault.missing === true;
  return (
    <div className={`vault-card${missing ? ' is-missing' : ''}`}>
      <button
        type="button"
        className="vault-open"
        onClick={() => onOpen(vault)}
        disabled={missing}
        title={missing ? 'This folder no longer exists' : `Open ${vault.path}`}
      >
        <HardDrive size={16} className="faint" />
        <span className="vault-card-main">
          <span className="vault-name truncate">{vault.name}</span>
          <span className="vault-path" title={vault.path}>
            {vault.path}
          </span>
        </span>
        <span className="vault-meta">
          {missing ? <span className="badge-missing">Missing</span> : formatWhen(vault.lastOpenedAt)}
        </span>
      </button>
      <IconButton
        size="sm"
        label={`Remove ${vault.name} from recent vaults`}
        onClick={() => onRemove(vault)}
      >
        <X size={14} />
      </IconButton>
    </div>
  );
}

/**
 * First-run and vault-switch screen. All vault access goes through main-process IPC; this
 * component never receives an unrestricted filesystem handle.
 */
export function VaultPicker() {
  const vaults = useStore((state) => state.vaults);
  const vault = useStore((state) => state.vault);
  const bootError = useStore((state) => state.bootError);
  const chooseAndOpenVault = useStore((state) => state.chooseAndOpenVault);
  const openVaultByPath = useStore((state) => state.openVaultByPath);
  const removeVault = useStore((state) => state.removeVault);
  const returnToVault = useStore((state) => state.returnToVault);

  const sorted = useMemo(
    () => [...vaults].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [vaults],
  );

  return (
    <div className="vault-picker">
      <header className="picker-header">
        <span>Obsidia</span>
        <span>{window.vaultApi.platform === 'win32' ? 'Windows' : window.vaultApi.platform}</span>
      </header>

      <div className="picker-main">
        <div className="picker-card">
          {vault && (
            <button
              type="button"
              className="button ghost sm"
              style={{ marginBottom: 14 }}
              onClick={returnToVault}
            >
              <ArrowLeft size={14} />
              Back to {vault.name}
            </button>
          )}

          <div className="picker-brand">
            <span className="brand-mark">
              <BookOpen size={26} />
            </span>
            <div>
              <h1>Obsidia</h1>
              <p>Plain Markdown notes in a folder you own.</p>
            </div>
          </div>

          {bootError && (
            <div className="picker-error" role="alert">
              {bootError}
            </div>
          )}

          <div className="picker-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => void chooseAndOpenVault('open')}
            >
              <FolderOpen size={15} />
              Open folder as vault
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => void chooseAndOpenVault('create')}
            >
              <FolderPlus size={15} />
              Create new vault
            </button>
          </div>

          <h2 className="picker-section-title">
            {sorted.length > 0 ? 'Recent vaults' : 'No vaults yet'}
          </h2>
          {sorted.length > 0 ? (
            <div className="vault-cards">
              {sorted.map((entry) => (
                <VaultCard
                  key={entry.id}
                  vault={entry}
                  onOpen={(target) => void openVaultByPath(target.path)}
                  onRemove={(target) => void removeVault(target.id)}
                />
              ))}
            </div>
          ) : (
            <div className="picker-note">
              <Info size={14} />
              <span>
                Choose an existing folder or create a new one. Notes stay where you put them;
                nothing is uploaded or synced.
              </span>
            </div>
          )}

          <div className="picker-note">
            <Info size={14} />
            <span>
              The app only writes inside the vault you choose. Settings and workspace state live
              in the vault&apos;s <code>.obsidia</code> folder.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
