// Formatting copied, pasted and cleared (docs/specs/034-text-documents/text-and-paragraphs.md "Paint format", "Clear
// formatting"): a run's own formatting is its property marks, its character style and the file's own run formatting;
// a paragraph's is its style and its own paragraph formatting. Links, lists and kept content are never formatting
// here. Each command is one transaction, so one undo step.
import type { Mark } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import {
  RUN_KEPT_MARK,
  TEXT_PROPERTY_MARKS,
  TEXT_STYLE_MARK,
  type ParagraphProps,
} from '@livedoc/text-documents';
import { selectedParagraphs } from './text-document-paragraphs';

/** The marks that are a run's own formatting. */
export const FORMATTING_MARKS: ReadonlySet<string> = new Set([
  ...TEXT_PROPERTY_MARKS,
  TEXT_STYLE_MARK,
  RUN_KEPT_MARK,
]);

/** What the formatting clipboard holds. */
export type FormattingCopy = {
  readonly marks: readonly Mark[];
  /** The paragraph style's id; null for Normal text. */
  readonly style: string | null;
  readonly props: ParagraphProps | null;
};

const isFormatting = (mark: Mark) => FORMATTING_MARKS.has(mark.type.name);
const withoutFormatting = (marks: readonly Mark[]) => marks.filter((m) => !isFormatting(m));

/** The marks at the caret: those stored for the next characters typed, else those of the text there. */
const caretMarks = (state: EditorState): readonly Mark[] =>
  state.storedMarks ?? state.selection.$from.marks();

/** The formatting where the selection starts (the caret's, when nothing is selected), and its paragraph's. */
export function copyFormatting(state: EditorState): FormattingCopy {
  const { $from, empty } = state.selection;
  const marks = empty ? caretMarks(state) : ($from.nodeAfter?.marks ?? $from.marks());
  const attrs = $from.parent.attrs as { style: string | null; props: ParagraphProps | null };
  return { marks: marks.filter(isFormatting), style: attrs.style, props: attrs.props };
}

type ParagraphChange = (attrs: Record<string, unknown>) => Record<string, unknown>;

/**
 * Sets every paragraph the selection touches by `paragraph`, and gives its text `marks` in place of its own formatting
 * (with nothing selected: the next characters typed). Kept content is never edited.
 */
function reformat(paragraph: ParagraphChange, marks: readonly Mark[]): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    for (const { node, pos } of selectedParagraphs(state))
      tr.setNodeMarkup(pos, undefined, paragraph({ ...node.attrs }));
    if (state.selection.empty)
      tr.setStoredMarks([...withoutFormatting(caretMarks(state)), ...marks]);
    else
      for (const { $from, $to } of state.selection.ranges)
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          if (!node.isText) return true;
          const from = Math.max($from.pos, pos);
          const to = Math.min($to.pos, pos + node.nodeSize);
          for (const mark of node.marks) if (isFormatting(mark)) tr.removeMark(from, to, mark.type);
          for (const mark of marks) tr.addMark(from, to, mark);
          return false;
        });
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Paste text formatting: the copy's paragraph style and formatting, and its text formatting, on the selection. */
export const pasteFormatting = (copy: FormattingCopy): Command =>
  reformat((attrs) => ({ ...attrs, style: copy.style, props: copy.props }), copy.marks);

/** Clear formatting: no own text formatting, and the paragraphs back to their style's formatting, style and list kept. */
export const clearFormatting: Command = reformat((attrs) => ({ ...attrs, props: null }), []);
