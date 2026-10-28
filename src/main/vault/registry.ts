import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { VaultInfo } from '../../shared/types';
import { atomicWriteAbsolute } from './fsops';
import { canonicalizeRoot } from './paths';

interface StoredVault {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
}

interface RegistryFile {
  version: 1;
  vaults: StoredVault[];
  lastVaultId: string | null;
}

const EMPTY_REGISTRY: RegistryFile = { version: 1, vaults: [], lastVaultId: null };

function samePath(a: string, b: string): boolean {
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export class VaultRegistry {
  private readonly file: string;
  private data: RegistryFile = { ...EMPTY_REGISTRY };
  private loaded = false;

  constructor(private readonly userDataDirectory: string) {
    this.file = path.join(userDataDirectory, 'vaults.json');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as Partial<RegistryFile>;
      if (parsed && Array.isArray(parsed.vaults)) {
        this.data = {
          version: 1,
          vaults: parsed.vaults.filter(
            (entry): entry is StoredVault =>
              !!entry &&
              typeof entry.id === 'string' &&
              typeof entry.path === 'string' &&
              typeof entry.name === 'string',
          ),
          lastVaultId: typeof parsed.lastVaultId === 'string' ? parsed.lastVaultId : null,
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await fs.rename(this.file, `${this.file}.corrupt-${Date.now()}`).catch(() => undefined);
      }
      this.data = { ...EMPTY_REGISTRY };
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(this.userDataDirectory, { recursive: true });
    await atomicWriteAbsolute(this.file, `${JSON.stringify(this.data, null, 2)}\n`, {
      eol: '\n',
    });
  }

  async list(): Promise<{ vaults: VaultInfo[]; lastVaultId: string | null }> {
    await this.ensureLoaded();
    const vaults: VaultInfo[] = [];
    for (const stored of this.data.vaults) {
      let missing = false;
      try {
        const stat = await fs.stat(stored.path);
        missing = !stat.isDirectory();
      } catch {
        missing = true;
      }
      vaults.push({
        id: stored.id,
        path: stored.path,
        name: stored.name,
        lastOpenedAt: stored.lastOpenedAt,
        ...(missing ? { missing: true } : {}),
      });
    }
    vaults.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return { vaults, lastVaultId: this.data.lastVaultId };
  }

  async open(inputPath: string, create: boolean): Promise<VaultInfo> {
    await this.ensureLoaded();
    const resolved = await canonicalizeRoot(inputPath);

    if (create) {
      try {
        const existing = await fs.stat(resolved);
        if (!existing.isDirectory()) {
          throw new Error('A file already exists at that path');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await fs.mkdir(resolved, { recursive: true });
        } else {
          throw error;
        }
      }
    }

    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error('Vault path is not a directory');
    await fs.access(resolved, fs.constants.R_OK);

    const name = path.basename(resolved) || 'Vault';
    let stored = this.data.vaults.find((vault) => samePath(vault.path, resolved));
    if (!stored) {
      stored = {
        id: randomUUID(),
        path: resolved,
        name,
        lastOpenedAt: Date.now(),
      };
      this.data.vaults.push(stored);
    } else {
      stored.lastOpenedAt = Date.now();
      stored.name = name;
    }
    this.data.lastVaultId = stored.id;
    await this.persist();

    return {
      id: stored.id,
      path: stored.path,
      name: stored.name,
      lastOpenedAt: stored.lastOpenedAt,
    };
  }

  async touch(id: string): Promise<void> {
    await this.ensureLoaded();
    const stored = this.data.vaults.find((vault) => vault.id === id);
    if (!stored) return;
    stored.lastOpenedAt = Date.now();
    this.data.lastVaultId = id;
    await this.persist();
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const before = this.data.vaults.length;
    this.data.vaults = this.data.vaults.filter((vault) => vault.id !== id);
    if (this.data.lastVaultId === id) {
      this.data.lastVaultId = this.data.vaults[0]?.id ?? null;
    }
    if (this.data.vaults.length === before) return false;
    await this.persist();
    return true;
  }

  async get(id: string): Promise<VaultInfo | null> {
    await this.ensureLoaded();
    const stored = this.data.vaults.find((vault) => vault.id === id);
    if (!stored) return null;
    return {
      id: stored.id,
      path: stored.path,
      name: stored.name,
      lastOpenedAt: stored.lastOpenedAt,
    };
  }

  async setLastVaultId(id: string | null): Promise<void> {
    await this.ensureLoaded();
    this.data.lastVaultId = id;
    await this.persist();
  }
}
