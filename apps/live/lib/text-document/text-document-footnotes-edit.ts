// Putting footnotes in and moving between them (docs/specs/034-text-documents/page-layout.md "Footnotes"): Insert >
// Footnote makes a note, one empty paragraph at 10 pt under a new random id, and puts its mark at the caret, a
// selection ended there, in the caret's text formatting, as one step of the body's undo. The marks are found beside,
// after and before the caret, and a note's mark by its story.
import type { Node as PmNode } from 'prosemirror-model';
import { NodeSelection, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { FOOTNOTE, storyFragment, TEXT_PROPERTY_MARK_OF } from '@livedoc/text-documents';
import { caretTextProps } from './text-document-page-numbers';
import { startUndoStep } from './text-document-undo';

/** Insert > Footnote's item (text-document-menus.ts). */
export const FOOTNOTE_ITEM = 'footnote';
/** A note made in LiveDoc is in Normal text at this size (Google's). */
export const NOTE_SIZE_PT = 10;

/** A new note: one empty paragraph under a new random id; ODF holds its 10 pt as the paragraph's own text formatting. */
export function makeNoteStory(doc: Y.Doc, format: TextDocumentFormat): string {
  const id = crypto.randomUUID();
  const paragraph = new Y.XmlElement('paragraph');
  // The attribute's value is a whole JSON value; Yjs' typing says string, its encoding takes any.
  if (format === 'odf') paragraph.setAttribute('text', { size: NOTE_SIZE_PT } as never);
  doc.transact(() => storyFragment(doc, id).insert(0, [paragraph]));
  return id;
}

/**
 * Insert > Footnote: a new note and its mark at the caret, a selection ended there, in the caret's text formatting;
 * one step of the body's undo. Gives the note's story, or null where no mark can stand.
 */
export function insertFootnote(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
): string | null {
  const { state } = view;
  const type = state.schema.nodes[FOOTNOTE];
  const { $to } = state.selection;
  if (!type || !$to.parent.inlineContent) return null;
  const story = makeNoteStory(doc, format);
  const props = caretTextProps(state);
  const mark = type.create({ story, props: Object.keys(props).length > 0 ? props : null });
  const tr = state.tr.insert($to.pos, mark);
  tr.setSelection(TextSelection.create(tr.doc, $to.pos + mark.nodeSize)).scrollIntoView();
  startUndoStep(view);
  view.dispatch(tr);
  startUndoStep(view);
  return story;
}

/** A mark in the body: where it stands and the note it names. */
export type MarkAt = { readonly pos: number; readonly story: string };

const storyOf = (node: PmNode | null | undefined): string | null => {
  if (node?.type.name !== FOOTNOTE) return null;
  const story = (node.attrs as { story: unknown }).story;
  return typeof story === 'string' ? story : null;
};

/** Every mark in the body, in order. */
export function marksIn(doc: PmNode): MarkAt[] {
  const marks: MarkAt[] = [];
  doc.descendants((node, pos) => {
    const story = storyOf(node);
    if (story) marks.push({ pos, story });
    return node.type.name !== FOOTNOTE;
  });
  return marks;
}

/** The mark selected, or just before or just after the caret. */
export function markBeside(state: EditorState): MarkAt | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const story = storyOf(selection.node);
    return story ? { pos: selection.from, story } : null;
  }
  if (!selection.empty) return null;
  const { $head } = selection;
  const before = storyOf($head.nodeBefore);
  if (before) return { pos: $head.pos - $head.nodeBefore!.nodeSize, story: before };
  const after = storyOf($head.nodeAfter);
  return after ? { pos: $head.pos, story: after } : null;
}

/** The first mark after the caret (one just after it passed over), or the last before it. */
export function markAfter(state: EditorState): MarkAt | null {
  const head = state.selection.head;
  return marksIn(state.doc).find((m) => m.pos >= head) ?? null;
}

export function markBefore(state: EditorState): MarkAt | null {
  const head = state.selection.head;
  // A mark just before the caret is the one the caret is already at.
  return (
    marksIn(state.doc)
      .filter((m) => m.pos + 1 < head)
      .at(-1) ?? null
  );
}

/** Where the caret goes to stand just after a note's mark; null when no mark names it. */
export function afterMark(doc: PmNode, story: string): number | null {
  const mark = marksIn(doc).find((m) => m.story === story);
  return mark ? mark.pos + 1 : null;
}

/** The marks typed into an empty note start with, in OOXML (which holds no paragraph text formatting): 10 pt. */
export function noteStartMarks(view: EditorView, format: TextDocumentFormat): void {
  const { state } = view;
  const type = state.schema.marks[TEXT_PROPERTY_MARK_OF.size];
  if (format !== 'ooxml' || !type) return;
  const empty = state.doc.childCount === 1 && state.doc.firstChild!.content.size === 0;
  if (empty) view.dispatch(state.tr.setStoredMarks([type.create({ value: NOTE_SIZE_PT })]));
}

/** Each note's number by its story: its mark's place among the body's marks, from 1. */
export function noteNumbersOf(doc: PmNode): Map<string, number> {
  return new Map(marksIn(doc).map((mark, index) => [mark.story, index + 1]));
}
