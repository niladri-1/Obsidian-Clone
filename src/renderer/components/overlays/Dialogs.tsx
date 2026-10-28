import { useEffect, useRef, useState } from 'react';
import { noteTitle, basename } from '@shared/paths';
import { useStore } from '../../store/useStore';
import { Modal } from '../ui/Modal';

/** Name prompt used for creating notes/folders and renaming entries. */
function TextPromptDialog() {
  const prompt = useStore((state) => state.ui.textPrompt);
  const submit = useStore((state) => state.submitTextPrompt);
  const close = useStore((state) => state.closeTextPrompt);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prompt) return;
    setValue(prompt.value);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [prompt]);

  if (!prompt) return null;
  const trimmed = value.trim();

  const commit = (): void => {
    if (!trimmed) return;
    void submit(trimmed);
  };

  return (
    <Modal
      title={prompt.title}
      onClose={close}
      initialFocus=".text-input"
      footer={
        <>
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!trimmed}
            onClick={commit}
          >
            {prompt.confirmLabel}
          </button>
        </>
      }
    >
      <label className="dialog-field" htmlFor="text-prompt-input">
        {prompt.label}
      </label>
      <input
        ref={inputRef}
        id="text-prompt-input"
        className="text-input"
        value={value}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      {prompt.kind !== 'rename' && (
        <p className="dialog-text" style={{ marginTop: 8 }}>
          The file is created inside the selected vault folder.
        </p>
      )}
    </Modal>
  );
}

/** Unsaved-changes prompt shown when closing a dirty tab. */
function ClosePromptDialog() {
  const prompt = useStore((state) => state.ui.closePrompt);
  const buffer = useStore((state) =>
    prompt ? state.buffers[prompt.path] : undefined,
  );
  const saveNote = useStore((state) => state.saveNote);
  const discardNote = useStore((state) => state.discardNote);
  const closeTab = useStore((state) => state.closeTab);
  const setClosePrompt = useStore((state) => state.setClosePrompt);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
  }, [prompt]);

  if (!prompt) return null;

  const cancel = (): void => setClosePrompt(null);

  const save = async (): Promise<void> => {
    setBusy(true);
    const saved = await saveNote(prompt.path);
    setBusy(false);
    if (!saved) return; // A conflict or I/O error keeps the prompt open.
    setClosePrompt(null);
    await closeTab(prompt.paneId, prompt.path, true);
  };

  const discard = async (): Promise<void> => {
    discardNote(prompt.path);
    setClosePrompt(null);
    await closeTab(prompt.paneId, prompt.path, true);
  };

  return (
    <Modal
      title="Unsaved changes"
      onClose={cancel}
      footer={
        <>
          <button type="button" className="button ghost" onClick={cancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button" onClick={() => void discard()} disabled={busy}>
            Discard
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <p className="dialog-text">
        <strong>{noteTitle(prompt.path)}</strong> has changes that have not been written to disk.
        <br />
        Save them before closing, discard them, or cancel and keep editing.
      </p>
      {buffer?.conflict && (
        <p className="dialog-text dialog-danger" style={{ marginTop: 10 }}>
          This note also changed on disk. Saving will be refused until you reload the note or
          choose “Keep mine” in the editor.
        </p>
      )}
    </Modal>
  );
}

/** Delete confirmation; wording follows the vault trash setting. */
function DeletePromptDialog() {
  const target = useStore((state) => state.ui.deleteTarget);
  const trashOption = useStore((state) => state.settings.vault.trashOption);
  const setDeleteTarget = useStore((state) => state.setDeleteTarget);
  const confirmDelete = useStore((state) => state.confirmDelete);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
  }, [target]);

  if (!target) return null;

  const cancel = (): void => setDeleteTarget(null);
  const permanent = trashOption === 'permanent';
  const isFolder = target.kind === 'folder';
  const name = basename(target.path) || target.path;

  return (
    <Modal
      title={permanent ? 'Delete permanently?' : 'Move to trash?'}
      onClose={cancel}
      footer={
        <>
          <button type="button" className="button ghost" onClick={cancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void confirmDelete(target);
            }}
          >
            {busy ? 'Deleting…' : permanent ? 'Delete permanently' : 'Move to trash'}
          </button>
        </>
      }
    >
      <p className="dialog-text">
        {isFolder ? 'Folder ' : 'Note '}
        <strong>{name}</strong>
        {isFolder ? ' and everything inside it will be ' : ' will be '}
        {permanent ? (
          <>
            <span className="dialog-danger">permanently deleted</span>. This cannot be undone.
          </>
        ) : (
          <>
            moved to this vault&apos;s local <code>.obsidia/trash</code> folder.
          </>
        )}
      </p>
      {isFolder && !permanent && (
        <p className="dialog-text" style={{ marginTop: 8 }}>
          The folder leaves the vault immediately and can be restored from the trash folder
          outside the app.
        </p>
      )}
    </Modal>
  );
}

export function Dialogs() {
  return (
    <>
      <TextPromptDialog />
      <ClosePromptDialog />
      <DeletePromptDialog />
    </>
  );
}
