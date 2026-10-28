/**
 * Tiny renderer-local event bus used for cross-panel intent (for example clicking a tag in
 * reading view focuses the vault search panel with that query).
 *
 * Intents can be dispatched before a subscriber mounts (the reading view opens the search
 * sidebar and immediately dispatches a tag query). The most recent intent is therefore kept
 * until a subscriber appears, then replayed exactly once.
 */
export interface SearchIntent {
  query: string;
}

const listeners = new Set<(query: string) => void>();
let pending: string | null = null;

export function requestSearch(query: string): void {
  if (listeners.size === 0) {
    pending = query;
    return;
  }
  for (const listener of listeners) listener(query);
}

export function onSearchRequest(listener: (query: string) => void): () => void {
  listeners.add(listener);
  if (pending !== null) {
    const replay = pending;
    pending = null;
    listener(replay);
  }
  return () => {
    listeners.delete(listener);
  };
}
