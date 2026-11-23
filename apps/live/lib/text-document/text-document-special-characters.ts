// Insert > Symbols > Special characters (docs/specs/034-text-documents/objects.md "Special characters"): a character
// pressed in the dialog put in at the caret of the writing the caret is in, each press an undo step of its own.
import type { EditorView } from 'prosemirror-view';
import type { Command } from 'prosemirror-state';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { startUndoStep } from './text-document-undo';

/** The menu item that opens the dialog. */
export const SPECIAL_CHARACTERS_ITEM = 'special-characters';

/** Puts the text in place of the selection, in the caret's formatting; the caret goes after it. */
export const insertCharacter =
  (text: string): Command =>
  (state, dispatch) => {
    if (!text) return false;
    dispatch?.(state.tr.insertText(text).scrollIntoView());
    return true;
  };

/** Insert > Symbols > Special characters, for whoever may edit; nothing for anyone else (dimmed). */
export function specialCharacterActions(
  view: EditorView | null,
  canEdit: boolean,
  open: () => void,
): OfficeActions {
  if (!canEdit) return {};
  return { [SPECIAL_CHARACTERS_ITEM]: { run: () => view && open() } };
}

/** A character pressed in the dialog: put in on an undo step of its own; the dialog keeps the focus. */
export function insertSpecialCharacter(view: EditorView, text: string): boolean {
  if (view.isDestroyed) return false;
  startUndoStep(view);
  if (!insertCharacter(text)(view.state, view.dispatch)) return false;
  startUndoStep(view);
  track('Element', 'Added', 'TextDocumentSpecialCharacter');
  debugLog('[text-document] special character');
  return true;
}
