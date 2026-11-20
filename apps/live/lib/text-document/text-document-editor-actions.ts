// What the text document's menus and shortcuts run in its editor (docs/specs/034-text-documents/editing-surface.md
// "The menu bar"): Edit > Undo, Redo (one person's own, live-editing-and-storage.md "Undo") and Select all. Each acts
// on the editor there is now and gives it focus back, as Google's menus return to the writing.
import { selectAll } from 'prosemirror-commands';
import type { EditorView } from 'prosemirror-view';
import { redo, undo } from 'y-prosemirror';
import type { OfficeActions } from '@/lib/office/office-catalogue';

export function textDocumentEditorActions(
  view: EditorView | null,
  { canEdit }: { canEdit: boolean },
): OfficeActions {
  const run = (command: (v: EditorView) => void) => () => {
    if (!view) return;
    command(view);
    view.focus();
  };
  return {
    ...(canEdit
      ? {
          undo: { run: run((v) => undo(v.state)) },
          redo: { run: run((v) => redo(v.state)) },
        }
      : {}),
    'select-all': { run: run((v) => selectAll(v.state, v.dispatch)) },
  };
}
