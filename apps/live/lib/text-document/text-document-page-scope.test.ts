// docs/specs/034-text-documents/page-layout.md "Page setup" (Apply to): a setup over the whole document, the caret's
// section, from the caret on, or the selected content with the breaks it needs; the page colour the document's.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { PageSetup } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { applyToChoices, pageScopeChange, type ApplyTo } from './text-document-page-scope';

const letter = PageSetup.of('letter');
const a5 = PageSetup.of('a5');
const landscape = { ...PageSetup.oriented(letter, 'landscape'), pageColor: '#fff2cc' };
const p = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));
const section = (setup: PageSetup, start = 'next-page') =>
  schema.nodes.section_break!.create({ start, setup });

function stateOf(blocks: PmNode[], anchor: number, head = anchor) {
  const doc = schema.nodes.doc!.create(null, blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

// Each block of the body after the change: a paragraph's text, a break's start and orientation.
const shape = (doc: PmNode) => {
  const out: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') out.push(node.textContent);
    else {
      const { start, setup } = node.attrs as { start: string; setup: PageSetup };
      out.push(`|${start} ${setup.orientation}|`);
    }
  });
  return out;
};

const change = (state: EditorState, scope: ApplyTo) =>
  pageScopeChange(state, scope, landscape, letter);

describe('applyToChoices', () => {
  it('offers This section while there are sections, and Selected content while text is selected', () => {
    expect(applyToChoices(stateOf([p('a')], 1))).toEqual(['document', 'forward']);
    expect(applyToChoices(stateOf([p('a'), section(a5), p('b')], 1, 2))).toEqual([
      'document',
      'section',
      'forward',
      'selection',
    ]);
  });
});

describe('pageScopeChange', () => {
  it('sets every section for the whole document, and the colour as the document page colour', () => {
    const { tr, first, sections } = change(stateOf([p('a'), section(a5), p('b')], 1), 'document');
    expect(shape(tr.doc)).toEqual(['a', '|next-page landscape|', 'b']);
    expect(first).toEqual(landscape);
    expect(sections).toBe(2);
  });

  it("sets the caret's section only, the document's colour still", () => {
    const state = stateOf([p('a'), section(a5), p('b'), section(a5), p('c')], 6);
    const { tr, first, sections } = change(state, 'section');
    expect(shape(tr.doc)).toEqual(['a', '|next-page landscape|', 'b', '|next-page portrait|', 'c']);
    // The first section keeps its paper; only the colour is the whole document's.
    expect(first).toEqual({ ...letter, pageColor: '#fff2cc' });
    expect(sections).toBe(1);
  });

  it('ends the section at the caret and sets it and every later one from the caret on', () => {
    const state = stateOf([p('one two'), section(a5), p('b')], 4, 6);
    const { tr, sections } = change(state, 'forward');
    expect(shape(tr.doc)).toEqual([
      'one',
      '|next-page landscape|',
      ' two',
      '|next-page landscape|',
      'b',
    ]);
    expect(sections).toBe(2);
  });

  it('puts selected content in a section of its own, reusing a break there and making it start a page', () => {
    // Paragraphs b and c selected, with a continuous break after them.
    const blocks = [p('a'), p('b'), p('c'), section(a5, 'continuous'), p('d')];
    const state = stateOf(blocks, 5, 8);
    const { tr, first, sections } = change(state, 'selection');
    expect(shape(tr.doc)).toEqual([
      'a',
      '|next-page landscape|',
      'b',
      'c',
      '|next-page portrait|',
      'd',
    ]);
    expect(first).toEqual({ ...letter, pageColor: '#fff2cc' });
    expect(sections).toBe(1);
  });

  it('needs no break before content at the document start, nor after it at the end', () => {
    const { tr, first } = change(stateOf([p('a'), p('b')], 1, 2), 'selection');
    expect(shape(tr.doc)).toEqual(['a', '|next-page portrait|', 'b']);
    expect(first).toEqual(landscape);
    const last = change(stateOf([p('a'), p('b')], 4, 5), 'selection');
    expect(shape(last.tr.doc)).toEqual(['a', '|next-page landscape|', 'b']);
    expect(last.first).toEqual({ ...letter, pageColor: '#fff2cc' });
  });

  it('changes nothing of the first section when it is out of scope and the colour is the same', () => {
    const same = pageScopeChange(
      stateOf([p('a'), section(a5), p('b')], 6),
      'section',
      PageSetup.oriented(letter, 'landscape'),
      letter,
    );
    expect(same.first).toBeNull();
  });
});
