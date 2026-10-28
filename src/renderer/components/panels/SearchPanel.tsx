import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaseSensitive,
  FileClock,
  Regex,
  Search,
  WholeWord,
} from 'lucide-react';
import clsx from 'clsx';
import { noteTitle } from '@shared/paths';
import type { SearchResponse, SearchResult } from '@shared/types';
import { useStore } from '../../store/useStore';
import { onSearchRequest } from '../../lib/bus';

const api = window.vaultApi;
const DEBOUNCE_MS = 220;

function normalizeQuery(query: string): string {
  const trimmed = query.trim();
  // Tags are indexed without their leading hash.
  if (trimmed.startsWith('#') && !/\s/.test(trimmed)) return trimmed.slice(1);
  return trimmed;
}

function Snippet({ result }: { result: SearchResult }) {
  const text = result.snippet;
  const start = Math.max(0, Math.min(text.length, result.matchStart));
  const length = Math.max(0, Math.min(text.length - start, result.matchLength));
  if (length === 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  );
}

export function SearchPanel() {
  const recentFiles = useStore((state) => state.workspace.recentFiles);
  const openNote = useStore((state) => state.openNote);
  const focusNonce = useStore((state) => state.ui.focusSearchNonce);
  const pushToast = useStore((state) => state.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const trimmed = query.trim();
  const results = response?.results ?? [];
  const files = useMemo(() => recentFiles.slice(0, 12), [recentFiles]);

  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus();
  }, [focusNonce]);

  useEffect(() => {
    const unsubscribe = onSearchRequest((next) => {
      setQuery(next);
      setSelectedIndex(0);
      inputRef.current?.focus();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, caseSensitive, wholeWord, regex]);

  useEffect(() => {
    if (!trimmed) {
      setResponse(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void api
        .search({
          query: normalizeQuery(trimmed),
          limit: 120,
          caseSensitive,
          wholeWord,
          regex,
        })
        .then((result) => {
          if (cancelled) return;
          setLoading(false);
          if (!result.ok) {
            setResponse({
              results: [],
              total: 0,
              tookMs: 0,
              error: result.error.message,
            });
            return;
          }
          setResponse(result.data);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setLoading(false);
          setResponse({
            results: [],
            total: 0,
            tookMs: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, caseSensitive, wholeWord, regex]);

  const openResult = (result: SearchResult): void => {
    if (result.matchLength > 0) {
      const text = result.snippet.slice(
        result.matchStart,
        result.matchStart + result.matchLength,
      );
      if (text) {
        void openNote(result.path, { revealText: text });
        return;
      }
    }
    void openNote(result.path, { revealText: trimmed });
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = results[selectedIndex];
      if (result) openResult(result);
    }
  };

  const copyPath = (): void => {
    const result = results[selectedIndex];
    if (!result) return;
    void navigator.clipboard
      .writeText(result.path)
      .then(() => pushToast({ kind: 'success', message: 'Path copied.' }))
      .catch(() => pushToast({ kind: 'error', message: 'Clipboard access was denied.' }));
  };

  return (
    <div className="search-panel">
      <div className="search-box">
        <Search size={14} />
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          placeholder="Search notes, headings, tags…"
          aria-label="Search vault"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
        />
      </div>

      <div className="search-options">
        <button
          type="button"
          className={clsx('option-chip', caseSensitive && 'is-active')}
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={() => setCaseSensitive((value) => !value)}
        >
          <CaseSensitive size={12} />
          Aa
        </button>
        <button
          type="button"
          className={clsx('option-chip', wholeWord && 'is-active')}
          aria-pressed={wholeWord}
          title="Match whole word"
          onClick={() => setWholeWord((value) => !value)}
        >
          <WholeWord size={12} />
          Word
        </button>
        <button
          type="button"
          className={clsx('option-chip', regex && 'is-active')}
          aria-pressed={regex}
          title="Use a regular expression"
          onClick={() => setRegex((value) => !value)}
        >
          <Regex size={12} />
          .*
        </button>
      </div>

      {loading && (
        <div className="search-progress">
          <span className="spinner" />
          Searching…
        </div>
      )}

      {!loading && response?.error && <div className="search-error">{response.error}</div>}

      {!loading && !response?.error && trimmed && response && (
        <div className="search-summary">
          {response.total === 0
            ? 'No matches'
            : `${response.total} ${response.total === 1 ? 'match' : 'matches'} · ${response.tookMs} ms`}
          {response.total > results.length ? ` · showing ${results.length}` : ''}
        </div>
      )}

      {!trimmed && (
        <div className="panel-section">
          <div className="panel-heading">
            <FileClock size={12} />
            Recent files
          </div>
          {files.length === 0 ? (
            <div className="sidebar-empty">
              Notes you open will appear here, and searching scans the whole vault.
            </div>
          ) : (
            <div className="search-results">
              {files.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="search-result"
                  onClick={() => void openNote(path)}
                >
                  <span className="search-result-title">
                    <span className="truncate">{noteTitle(path)}</span>
                    <span className="search-result-path">{path}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {trimmed && !loading && results.length > 0 && (
        <div className="search-results" role="listbox" aria-label="Search results">
          {results.map((result, index) => (
            <button
              key={`${result.path}-${index}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={clsx('search-result', index === selectedIndex && 'is-selected')}
              onClick={() => openResult(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') openResult(result);
              }}
            >
              <span className="search-result-title">
                <span className="truncate">{result.title}</span>
                <span className="search-result-path">{result.path}</span>
              </span>
              <span className="search-result-snippet">
                <Snippet result={result} />
              </span>
            </button>
          ))}
        </div>
      )}

      {trimmed && !loading && !response?.error && results.length === 0 && (
        <div className="sidebar-empty">
          No notes match “{trimmed}”. Try a shorter query or disable an option.
        </div>
      )}

      {trimmed && !regex && (
        <div className="search-summary">
          Tip: press Enter to open the highlighted result, or use the quick switcher for fuzzy
          navigation.{' '}
          <button type="button" className="button sm ghost" onClick={copyPath}>
            Copy path
          </button>
        </div>
      )}
    </div>
  );
}
