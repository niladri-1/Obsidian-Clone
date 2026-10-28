import type { EditorView } from '@codemirror/view';

const views = new Map<string, EditorView>();

export function registerEditorView(path: string, view: EditorView): void {
  views.set(path, view);
}

export function unregisterEditorView(path: string, view: EditorView): void {
  if (views.get(path) === view) views.delete(path);
}

export function getEditorView(path: string | null): EditorView | null {
  if (!path) return null;
  return views.get(path) ?? null;
}
