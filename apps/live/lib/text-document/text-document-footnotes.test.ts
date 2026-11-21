// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Footnotes": marks numbered 1, 2, 3 in their order, again at once when a
// mark is added, moved or taken away; read as "Footnote N"; a note drawn led by its number.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { textDocumentSchema } from './text-document-schema';
import {
  footnoteNumbers,
  footnoteNumbersPlugin,
  NOTE_NUMBER_ATTRIBUTE,
  numberNote,
  touchesMark,
} from './text-document-footnotes';

const { nodes } = textDocumentSchema;
const mark = (story: string) => nodes.footnote!.create({ story });
const paragraph = (...content: Parameters<NonNullable<typeof nodes.paragraph>['create']>[1][]) =>
  nodes.paragraph!.create(null, content.flat() as never);
const docOf = (...paragraphs: ReturnType<typeof paragraph>[]) =>
  nodes.doc!.create(null, paragraphs);

const told = (state: EditorState) => {
  const plugin = state.plugins[0]!;
  return (plugin.getState(state) as ReturnType<typeof footnoteNumbers>)
    .find()
    .map((d) => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs);
};

describe('footnote numbers', () => {
  const doc = docOf(
    paragraph([textDocumentSchema.text('One'), mark('a')]),
    paragraph([mark('b'), textDocumentSchema.text('Two')]),
  );

  it('tells each mark its number in order, read as Footnote N', () => {
    const set = footnoteNumbers(doc);
    expect(
      set
        .find()
        .map((d) => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs),
    ).toEqual([
      { [NOTE_NUMBER_ATTRIBUTE]: '1', 'aria-label': 'Footnote 1' },
      { [NOTE_NUMBER_ATTRIBUTE]: '2', 'aria-label': 'Footnote 2' },
    ]);
  });

  it('numbers again when a mark comes or goes, and only moves them for other changes', () => {
    let state = EditorState.create({ doc, plugins: [footnoteNumbersPlugin()] });
    const typed = state.tr.insertText('x', 1);
    expect(touchesMark(typed)).toBe(false);
    state = state.apply(typed);
    expect(told(state).map((a) => a[NOTE_NUMBER_ATTRIBUTE])).toEqual(['1', '2']);
    // A mark before the others: they are 2 and 3 now.
    const added = state.tr.insert(1, mark('c'));
    expect(touchesMark(added)).toBe(true);
    state = state.apply(added);
    expect(told(state).map((a) => a[NOTE_NUMBER_ATTRIBUTE])).toEqual(['1', '2', '3']);
    // The first taken away.
    const removed = state.tr.delete(1, 2);
    expect(touchesMark(removed)).toBe(true);
    state = state.apply(removed);
    expect(told(state).map((a) => a['aria-label'])).toEqual(['Footnote 1', 'Footnote 2']);
  });

  it('leads a note’s copy with its number in superscript', () => {
    const copy = document.createElement('div');
    copy.innerHTML = '<p>The source.</p><p>More</p>';
    numberNote(copy, '3');
    expect(copy.innerHTML).toBe(
      '<p><sup class="text-document-note-number">3</sup>The source.</p><p>More</p>',
    );
  });
});
