// Insert > Horizontal line (docs/specs/034-text-documents/objects.md "Horizontal line"): an empty paragraph of the
// caret's style whose bottom border runs across the text width, put in at the caret, the paragraph split around it.
import type { EditorView } from 'prosemirror-view';
import { Selection, type Command } from 'prosemirror-state';
import type { BorderLine } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { caretParagraph } from './text-document-breaks';
import { startUndoStep } from './text-document-undo';

/** The line: solid, 1 pt wide, grey, 1 pt below its empty paragraph (default). */
export const HORIZONTAL_LINE: BorderLine = { width: 1, dash: 'solid', color: '#a6a6a6', space: 1 };

/** The menu item that puts one in. */
export const HORIZONTAL_LINE_ITEM = 'horizontal-line';

/** Puts a horizontal line in at the caret, a selection deleted first; the caret starts the paragraph after it. */
export const insertHorizontalLine: Command = (state, dispatch) => {
  const place = caretParagraph(state);
  if (!place) return false;
  if (dispatch) {
    const { tr, paragraph } = place;
    const line = paragraph.type.create({
      style: (paragraph.attrs as { style: unknown }).style,
      props: { borders: { bottom: HORIZONTAL_LINE } },
    });
    const $caret = tr.selection.$from;
    if ($caret.parentOffset === 0) tr.insert($caret.before(), line);
    else if ($caret.parentOffset === paragraph.content.size) {
      const after = $caret.after();
      const next = tr.doc.resolve(after).nodeAfter;
      // At a paragraph's end with none after it: an empty paragraph like it to write in.
      const rest =
        next?.type.name === 'paragraph'
          ? []
          : [paragraph.type.create({ ...paragraph.attrs, props: null, list: null })];
      tr.insert(after, [line, ...rest]);
      tr.setSelection(Selection.near(tr.doc.resolve(after + line.nodeSize + 1)));
    } else {
      tr.split($caret.pos);
      tr.insert(tr.selection.$from.before(), line);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Insert > Horizontal line, for whoever may edit the body; nothing for anyone else (dimmed). */
export function horizontalLineActions(view: EditorView | null, canEdit: boolean): OfficeActions {
  if (!canEdit) return {};
  return {
    [HORIZONTAL_LINE_ITEM]: {
      run: () => {
        if (!view) return;
        // A step of its own: the writing before it and after it undo apart.
        startUndoStep(view);
        if (insertHorizontalLine(view.state, view.dispatch)) {
          startUndoStep(view);
          track('Element', 'Added', 'TextDocumentHorizontalLine');
          debugLog('[text-document] horizontal line');
        }
        view.focus();
      },
    },
  };
}
