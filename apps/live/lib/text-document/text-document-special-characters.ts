// Insert > Symbols > Special characters and Insert > Emoji (docs/specs/034-text-documents/objects.md "Special
// characters", "Emoji"): a character or emoji pressed in its dialog put in at the caret of the writing the caret is
// in, each press an undo step of its own.
import type { EditorView } from 'prosemirror-view';
import type { Command } from 'prosemirror-state';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { startUndoStep } from './text-document-undo';

/** The menu items that open the dialogs. */
export const SPECIAL_CHARACTERS_ITEM = 'special-characters';
export const EMOJI_ITEM = 'emoji';

export type CharacterDialog = 'special-characters' | 'emoji';

/** Puts the text in place of the selection, in the caret's formatting; the caret goes after it. */
export const insertCharacter =
  (text: string): Command =>
  (state, dispatch) => {
    if (!text) return false;
    dispatch?.(state.tr.insertText(text).scrollIntoView());
    return true;
  };

/** Insert > Symbols > Special characters and Insert > Emoji, for whoever may edit; nothing for anyone else (dimmed). */
export function characterDialogActions(
  view: EditorView | null,
  canEdit: boolean,
  open: (dialog: CharacterDialog) => void,
): OfficeActions {
  if (!canEdit) return {};
  return {
    [SPECIAL_CHARACTERS_ITEM]: { run: () => view && open('special-characters') },
    [EMOJI_ITEM]: { run: () => view && open('emoji') },
  };
}

const COUNTED = {
  'special-characters': 'TextDocumentSpecialCharacter',
  emoji: 'TextDocumentEmoji',
} as const;

/** A character or emoji pressed in its dialog: put in on an undo step of its own; the dialog keeps the focus. */
export function insertPicked(view: EditorView, text: string, from: CharacterDialog): boolean {
  if (view.isDestroyed) return false;
  startUndoStep(view);
  if (!insertCharacter(text)(view.state, view.dispatch)) return false;
  startUndoStep(view);
  track('Element', 'Added', COUNTED[from]);
  debugLog('[text-document] character inserted', { from });
  return true;
}
