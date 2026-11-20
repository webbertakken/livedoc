// The caret as the context menu needs it (docs/specs/004-interface-design/office-shell.md "Context menus"): where it is
// on screen, for a menu opened from the keyboard, and moved to a right-click outside the selection.
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Point } from '@/lib/office/context-menu-place';

export function textDocumentCaretPoint(view: EditorView): Point | null {
  try {
    const { left, bottom } = view.coordsAtPos(view.state.selection.head);
    return { x: left, y: bottom };
  } catch {
    return null;
  }
}

// A right-click outside the selection moves the caret there; inside it, the selection stays.
export function placeTextDocumentCaret(view: EditorView, { x, y }: Point): void {
  const found = view.posAtCoords({ left: x, top: y });
  if (!found) return;
  const { from, to } = view.state.selection;
  if (found.pos >= from && found.pos <= to && from !== to) return;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, found.pos)));
}
