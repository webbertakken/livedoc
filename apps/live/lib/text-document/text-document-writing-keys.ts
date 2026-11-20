// Keys in the writing (docs/specs/034-text-documents/text-and-paragraphs.md "Writing"): Tab types a tab; over a
// selection that spans paragraphs, Tab and Shift+Tab step their indent; elsewhere Shift+Tab is held, so focus stays in
// the writing. Shift+Enter is a line break. A list item's start is the list's (lists.md "Levels"), bound ahead of these.
import { keymap } from 'prosemirror-keymap';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
import type { TextFormatting } from './text-document-formatting';
import { INDENT_STEP_PT, stepIndent } from './text-document-paragraph-formatting';

const spansParagraphs = (state: EditorState): boolean =>
  !state.selection.$from.sameParent(state.selection.$to);

/** Tab: a tab character in place of the selection, or a step of indent over paragraphs. */
export const pressTab =
  (formatting: () => TextFormatting): Command =>
  (state, dispatch, view) => {
    if (spansParagraphs(state))
      return stepIndent(formatting(), INDENT_STEP_PT)(state, dispatch, view);
    dispatch?.(state.tr.insertText('\t').scrollIntoView());
    return true;
  };

/** Shift+Tab: a step of indent back over paragraphs; otherwise held, so the writing keeps focus. */
export const pressShiftTab =
  (formatting: () => TextFormatting): Command =>
  (state, dispatch, view) =>
    spansParagraphs(state)
      ? stepIndent(formatting(), -INDENT_STEP_PT)(state, dispatch, view)
      : true;

/** Shift+Enter: a line break in place of the selection, the paragraph kept whole. */
export const insertLineBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText('\n').scrollIntoView());
  return true;
};

/** Tab, Shift+Tab and Shift+Enter where the writing takes edits; read only, the keys are the browser's. */
export function writingKeysPlugin(formatting: () => TextFormatting): Plugin {
  const editing =
    (command: Command): Command =>
    (state, dispatch, view) =>
      view?.editable === true && command(state, dispatch, view);
  return keymap({
    Tab: editing(pressTab(formatting)),
    'Shift-Tab': editing(pressShiftTab(formatting)),
    'Shift-Enter': editing(insertLineBreak),
  });
}
