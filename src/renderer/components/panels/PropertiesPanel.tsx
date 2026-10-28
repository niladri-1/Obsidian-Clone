import { useEffect, useMemo, useState } from 'react';
import { Plus, Tags, Trash2, X } from 'lucide-react';
import {
  frontmatterTags,
  parseFrontmatter,
  setFrontmatterValue,
  type FrontmatterValue,
} from '@shared/frontmatter';
import { activePathOf, useStore } from '../../store/useStore';

function asInputValue(value: FrontmatterValue): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function coerce(raw: string, original: FrontmatterValue): FrontmatterValue {
  if (Array.isArray(original)) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const trimmed = raw.trim();
  if (typeof original === 'boolean') return trimmed.toLowerCase() === 'true';
  if (typeof original === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && trimmed !== '' ? parsed : trimmed;
  }
  return raw;
}

/** Frontmatter editor. Every change rewrites only the affected YAML key, then saves. */
export function PropertiesPanel() {
  const path = useStore((state) => activePathOf(state));
  const buffer = useStore((state) => (path ? state.buffers[path] : undefined));
  const setContent = useStore((state) => state.setContent);
  const saveNote = useStore((state) => state.saveNote);
  const pushToast = useStore((state) => state.pushToast);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    setDrafts({});
    setNewKey('');
    setNewValue('');
    setTagInput('');
  }, [path]);

  const content = buffer?.content ?? '';
  const parsed = useMemo(() => parseFrontmatter(content), [content]);
  const tags = useMemo(() => frontmatterTags(parsed.data), [parsed.data]);
  const entries = Object.entries(parsed.data);

  if (!path || !buffer) {
    return <div className="sidebar-empty">Open a note to edit its properties.</div>;
  }
  if (buffer.loading) {
    return <div className="sidebar-empty">Loading note…</div>;
  }

  const disabled = buffer.conflict || buffer.missing;

  const commit = (key: string, raw: string, original: FrontmatterValue): void => {
    if (disabled) return;
    const value = coerce(raw, original);
    try {
      const next = setFrontmatterValue(content, key, value);
      setDrafts((current) => {
        const copy = { ...current };
        delete copy[key];
        return copy;
      });
      if (next === content) return;
      setContent(path, next);
      void saveNote(path);
    } catch (error) {
      pushToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not update the property.',
      });
    }
  };

  const remove = (key: string): void => {
    if (disabled) return;
    try {
      const next = setFrontmatterValue(content, key, null);
      setDrafts((current) => {
        const copy = { ...current };
        delete copy[key];
        return copy;
      });
      setContent(path, next);
      void saveNote(path);
    } catch (error) {
      pushToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not remove the property.',
      });
    }
  };

  const addProperty = (): void => {
    const key = newKey.trim();
    if (!key) return;
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      pushToast({ kind: 'error', message: 'Property names use letters, numbers, _ . or -.' });
      return;
    }
    try {
      const value = newValue.trim();
      const next = setFrontmatterValue(
        content,
        key,
        value === '' ? '' : /^\d+$/.test(value) ? Number(value) : value,
      );
      setContent(path, next);
      void saveNote(path);
      setNewKey('');
      setNewValue('');
    } catch (error) {
      pushToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not add the property.',
      });
    }
  };

  const addTag = (): void => {
    const value = tagInput.trim().replace(/^#/, '');
    if (!value || disabled) return;
    if (tags.includes(value.toLowerCase())) {
      setTagInput('');
      return;
    }
    try {
      const next = setFrontmatterValue(content, 'tags', [...tags, value]);
      setContent(path, next);
      void saveNote(path);
      setTagInput('');
    } catch (error) {
      pushToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not add the tag.',
      });
    }
  };

  const removeTag = (tag: string): void => {
    if (disabled) return;
    const remaining = tags.filter((entry) => entry !== tag);
    try {
      const next = setFrontmatterValue(content, 'tags', remaining.length ? remaining : null);
      setContent(path, next);
      void saveNote(path);
    } catch (error) {
      pushToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not remove the tag.',
      });
    }
  };

  return (
    <div className="properties-panel">
      <div className="panel-section">
        <div className="panel-heading">
          <Tags size={12} />
          Properties
          <span className="count">{entries.length}</span>
        </div>

        {entries.length === 0 ? (
          <div className="sidebar-empty">
            No frontmatter yet. Add a property below; it is written as YAML at the top of the
            note.
          </div>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className="property-row">
              <span className="property-key" title={key}>
                {key}
              </span>
              <input
                className="property-value"
                value={drafts[key] ?? asInputValue(value)}
                aria-label={`Value for ${key}`}
                spellCheck={false}
                disabled={disabled}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [key]: event.target.value }))
                }
                onBlur={(event) => commit(key, event.target.value, value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setDrafts((current) => {
                      const copy = { ...current };
                      delete copy[key];
                      return copy;
                    });
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className="icon-button property-remove"
                aria-label={`Remove ${key}`}
                title={`Remove ${key}`}
                disabled={disabled}
                onClick={() => remove(key)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}

        <div className="property-add">
          <input
            className="text-input"
            value={newKey}
            placeholder="key"
            aria-label="New property name"
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setNewKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addProperty();
              }
            }}
          />
          <input
            className="text-input"
            value={newValue}
            placeholder="value"
            aria-label="New property value"
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setNewValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addProperty();
              }
            }}
          />
          <button
            type="button"
            className="button sm"
            disabled={disabled || !newKey.trim()}
            onClick={addProperty}
          >
            <Plus size={13} />
            Add
          </button>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-heading">
          <Tags size={12} />
          Tags
          <span className="count">{tags.length}</span>
        </div>
        {tags.length > 0 && (
          <div className="tag-list">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                #{tag}
                <button
                  type="button"
                  className="toast-close"
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove #${tag}`}
                  disabled={disabled}
                  onClick={() => removeTag(tag)}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="property-add">
          <input
            className="text-input"
            value={tagInput}
            placeholder="Add frontmatter tag…"
            aria-label="Add frontmatter tag"
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTag();
              }
            }}
          />
          <button
            type="button"
            className="button sm"
            disabled={disabled || !tagInput.trim()}
            onClick={addTag}
          >
            <Plus size={13} />
            Tag
          </button>
        </div>
        {!parsed.exists && (
          <div className="search-summary">Adding a property creates the YAML block.</div>
        )}
      </div>
    </div>
  );
}
