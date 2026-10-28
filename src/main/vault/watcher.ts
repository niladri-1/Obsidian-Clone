import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { toPosix } from '../../shared/paths';
import type { FileChangeBatch } from '../../shared/types';
import { isRecentSelfWrite } from './fsops';

// `.obsidian` is the legacy third-party config folder; ignore it so its writes never surface.
const IGNORED_NAMES = new Set(['.obsidia', '.obsidian', '.trash', 'node_modules', '.git']);

function shouldIgnore(relative: string): boolean {
  if (!relative) return false;
  const segments = relative.split(/[\\/]/);
  return segments.some(
    (segment) => IGNORED_NAMES.has(segment.toLowerCase()) || segment.startsWith('.'),
  );
}

export class VaultWatcher {
  private watcher: FSWatcher | null = null;
  private pending: FileChangeBatch = { added: [], changed: [], removed: [] };
  private timer: NodeJS.Timeout | null = null;
  private readonly batchWindowMs = 120;

  constructor(
    private readonly root: string,
    private readonly onBatch: (batch: FileChangeBatch) => void,
    private readonly onError?: (error: Error) => void,
  ) {}

  async start(): Promise<void> {
    if (this.watcher) return;
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      persistent: true,
      depth: 40,
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
      ignored: (candidate) => {
        const relative = path.relative(this.root, candidate);
        if (relative === '') return false;
        return shouldIgnore(relative);
      },
    });

    this.watcher.on('add', (file) => this.record('added', file));
    this.watcher.on('change', (file) => this.record('changed', file));
    this.watcher.on('unlink', (file) => this.record('removed', file));
    this.watcher.on('addDir', (dir) => this.record('added', dir));
    this.watcher.on('unlinkDir', (dir) => this.record('removed', dir));
    this.watcher.on('error', (error) => {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.flush();
    });

    await new Promise<void>((resolve) => {
      if (!this.watcher) return resolve();
      this.watcher.once('ready', () => resolve());
      setTimeout(resolve, 1500);
    });
  }

  private record(bucket: keyof FileChangeBatch, absolute: string): void {
    const resolved = path.resolve(absolute);
    const relative = toPosix(path.relative(this.root, resolved));
    if (!relative || relative.startsWith('..')) return;
    if (shouldIgnore(relative)) return;
    if (isRecentSelfWrite(resolved)) return;

    const batch = this.pending;
    const opposite =
      bucket === 'added' ? batch.removed : bucket === 'removed' ? batch.added : null;
    if (opposite) {
      const index = opposite.indexOf(relative);
      if (index !== -1) {
        opposite.splice(index, 1);
        return;
      }
    }
    if (!batch[bucket].includes(relative)) batch[bucket].push(relative);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.batchWindowMs);
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.pending;
    this.pending = { added: [], changed: [], removed: [] };
    if (!batch.added.length && !batch.changed.length && !batch.removed.length) return;
    this.onBatch(batch);
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
    await this.watcher?.close();
    this.watcher = null;
  }
}
