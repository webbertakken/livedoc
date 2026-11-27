// Giving the writing the keyboard (docs/specs/034-text-documents/editing-surface.md; review.md "Editing modes"): an
// editable view takes it with its caret, as ProseMirror's focus does; a read-only one (Viewing, a Viewer), which
// ProseMirror's focus passes over, takes it on its element, so the surface's keys and the arrows still reach it.
import type { EditorView } from 'prosemirror-view';

export function focusWriting(view: EditorView | null): void {
  if (!view || view.isDestroyed) return;
  if (view.editable) view.focus();
  else view.dom.focus({ preventScroll: true });
}
