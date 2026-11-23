// Insert > Symbols > Equation (docs/specs/034-text-documents/objects.md "Equations in the editor"): an empty equation
// at the caret, in place of a selection, the caret in its box to write it.
import type { EditorView } from 'prosemirror-view';
import type { Command } from 'prosemirror-state';
import { EQUATION, EquationEditing } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { enterEquation } from './text-document-equation-box';
import { startUndoStep } from './text-document-undo';

/** The menu item that puts one in. */
export const EQUATION_ITEM = 'equation';

/** Puts an empty equation in at the caret, a selection replaced, the caret in its box; false where text cannot go. */
export const insertEquation: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if (!$from.parent.inlineContent) return false;
  if (dispatch) {
    const tr = state.tr.replaceSelectionWith(
      state.schema.nodes[EQUATION]!.create({ math: [] }),
      true,
    );
    // The equation ends right before the caret the replacement left after it.
    const pos = tr.selection.from - 1;
    dispatch(enterEquation(tr, pos, EquationEditing.start()).scrollIntoView());
  }
  return true;
};

/**
 * Insert > Symbols > Equation, for whoever may edit the body; nothing for anyone else (dimmed). `onInserted`: the
 * equation toolbar turned on.
 */
export function equationActions(
  view: EditorView | null,
  canEdit: boolean,
  onInserted: () => void = () => {},
): OfficeActions {
  if (!canEdit) return {};
  return {
    [EQUATION_ITEM]: {
      run: () => {
        if (!view) return;
        startUndoStep(view);
        if (insertEquation(view.state, view.dispatch)) {
          track('Element', 'Added', 'TextDocumentEquation');
          debugLog('[text-document] equation inserted');
          onInserted();
        }
        view.focus();
      },
    },
  };
}
