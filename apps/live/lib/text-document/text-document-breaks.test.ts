// docs/specs/034-text-documents/page-layout.md "Breaks": a page break ends the paragraph and starts the rest on a new
// page as its page break before; a section break goes between the two halves with the caret's section's setup;
// Backspace and Delete take a page break away before joining; the labels drawn where breaks are shown.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Command } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { PageSetup, Styles, type ParagraphProps } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  breakLabels,
  insertPageBreak,
  insertSectionBreak,
  removePageBreakBackward,
  removePageBreakForward,
  sectionSetupAt,
} from './text-document-breaks';

const formatting = { styles: Styles.builtIn('odf'), defaults: Styles.defaults() };
const p = (text: string, props: ParagraphProps | null = null) =>
  schema.nodes.paragraph!.create({ props }, text ? schema.text(text) : undefined);
const letter = PageSetup.of('letter');
const a5 = PageSetup.of('a5');
const section = (setup: PageSetup, start = 'next-page') =>
  schema.nodes.section_break!.create({ start, setup });

function stateWith(blocks: PmNode[], anchor: number, head = anchor) {
  const doc = schema.nodes.doc!.create(null, blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

function run(state: EditorState, command: Command) {
  let next = state;
  const done = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { done, state: next };
}

const own = (node: PmNode) => (node.attrs as { props: ParagraphProps | null }).props ?? {};

describe('insertPageBreak', () => {
  it('ends the paragraph at the caret and gives the rest its own page break before', () => {
    const { state } = run(stateWith([p('one two', { align: 'center' })], 4), insertPageBreak);
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(0).textContent).toBe('one');
    expect(own(state.doc.child(0)).pageBreakBefore).toBeUndefined();
    expect(state.doc.child(1).textContent).toBe(' two');
    expect(own(state.doc.child(1))).toEqual({ align: 'center', pageBreakBefore: true });
    // The caret is at the start of the new page.
    expect(state.selection.from).toBe(state.doc.child(0).nodeSize + 1);
  });

  it('replaces a selection, and at a paragraph start leaves an empty paragraph behind', () => {
    const replaced = run(stateWith([p('one two')], 2, 5), insertPageBreak).state;
    expect(replaced.doc.child(0).textContent).toBe('o');
    expect(replaced.doc.child(1).textContent).toBe('two');
    const start = run(stateWith([p('one')], 1), insertPageBreak).state;
    expect(start.doc.child(0).textContent).toBe('');
    expect(own(start.doc.child(1)).pageBreakBefore).toBe(true);
  });

  it('does nothing with a section break selected', () => {
    const doc = schema.nodes.doc!.create(null, [p('a'), section(letter), p('b')]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 3) });
    expect(run(state, insertPageBreak).done).toBe(false);
  });
});

describe('insertSectionBreak', () => {
  it('puts a section break between the halves with the setup of the section the caret is in', () => {
    const before = stateWith([p('intro'), section(a5), p('one two')], 0);
    const caret = before.doc.child(0).nodeSize + before.doc.child(1).nodeSize + 4;
    const { state } = run(
      before.apply(before.tr.setSelection(TextSelection.create(before.doc, caret))),
      insertSectionBreak('continuous', letter),
    );
    expect(state.doc.childCount).toBe(5);
    const made = state.doc.child(3);
    expect(made.type.name).toBe('section_break');
    expect(made.attrs).toMatchObject({ start: 'continuous', setup: a5 });
    expect(state.doc.child(4).textContent).toBe(' two');
    expect(state.selection.$from.parent).toBe(state.doc.child(4));
  });

  it('goes before a paragraph at its start and after one at its end, with a paragraph to write in', () => {
    const atStart = run(stateWith([p('one')], 1), insertSectionBreak('next-page', letter)).state;
    expect(atStart.doc.child(0).type.name).toBe('section_break');
    expect(atStart.doc.child(0).attrs).toMatchObject({ setup: letter });
    const atEnd = run(stateWith([p('one')], 4), insertSectionBreak('next-page', letter)).state;
    expect(atEnd.doc.childCount).toBe(3);
    expect(atEnd.doc.child(1).type.name).toBe('section_break');
    expect(atEnd.doc.child(2).textContent).toBe('');
    expect(atEnd.selection.$from.parent).toBe(atEnd.doc.child(2));
  });

  it('makes a continuous section in ODF a named region, and none in OOXML', () => {
    const odf = run(
      stateWith([p('one')], 2),
      insertSectionBreak('continuous', letter, 'odf'),
    ).state;
    expect((odf.doc.child(1).attrs as { region: { xml: string } }).region.xml).toContain(
      'LiveDocSection1',
    );
    const ooxml = run(
      stateWith([p('one')], 2),
      insertSectionBreak('continuous', letter, 'ooxml'),
    ).state;
    expect(ooxml.doc.child(1).attrs).toMatchObject({ region: null });
    const next = run(
      stateWith([p('one')], 2),
      insertSectionBreak('next-page', letter, 'odf'),
    ).state;
    expect(next.doc.child(1).attrs).toMatchObject({ region: null });
  });

  it('reads the section a place is in', () => {
    const doc = schema.nodes.doc!.create(null, [p('a'), section(a5), p('b')]);
    expect(sectionSetupAt(doc, 1, letter)).toBe(letter);
    expect(sectionSetupAt(doc, doc.content.size - 1, letter)).toEqual(a5);
  });
});

describe('removing a page break', () => {
  it('takes the break away with Backspace at the start of its paragraph, and nothing else', () => {
    const blocks = [p('one'), p('two', { pageBreakBefore: true, align: 'end' })];
    const { done, state } = run(stateWith(blocks, 6), removePageBreakBackward);
    expect(done).toBe(true);
    expect(state.doc.childCount).toBe(2);
    expect(own(state.doc.child(1))).toEqual({ align: 'end' });
    // Then Backspace is the editor's own.
    expect(run(state, removePageBreakBackward).done).toBe(false);
    expect(run(stateWith(blocks, 7), removePageBreakBackward).done).toBe(false);
  });

  it('takes the break away with Delete at the end of the paragraph before it', () => {
    const blocks = [p('one'), p('two', { pageBreakBefore: true })];
    const { done, state } = run(stateWith(blocks, 4), removePageBreakForward);
    expect(done).toBe(true);
    expect(own(state.doc.child(1))).toEqual({});
    expect(run(stateWith(blocks, 3), removePageBreakForward).done).toBe(false);
    expect(run(stateWith([p('one')], 4), removePageBreakForward).done).toBe(false);
  });
});

describe('breakLabels', () => {
  it('labels each paragraph that starts a page by its own or its style', () => {
    const heading = Styles.idOfRole(formatting.styles, 'heading1')!;
    const styles = formatting.styles.map((s) =>
      s.id === heading ? { ...s, paragraph: { ...s.paragraph, pageBreakBefore: true } } : s,
    );
    const doc = schema.nodes.doc!.create(null, [
      p('a'),
      p('b', { pageBreakBefore: true }),
      schema.nodes.paragraph!.create({ style: heading }, schema.text('c')),
    ]);
    const labels = breakLabels(doc, { ...formatting, styles }).find();
    expect(labels.map((d) => d.from)).toEqual([3, 6]);
  });
});
