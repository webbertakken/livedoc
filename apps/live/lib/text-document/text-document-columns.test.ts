// docs/specs/034-text-documents/page-layout.md "Columns" (What they apply to): the caret's section's columns, or the
// selection's own section with continuous breaks made where none is; nothing changed changes nothing.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { PageSetup, type Columns } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { columnsAt, columnsChange } from './text-document-columns';

const letter = PageSetup.of('letter');
const two: Columns = { count: 2, gap: 36 };
const three: Columns = { count: 3, gap: 18, separator: true };
const p = (text: string) => schema.nodes.paragraph!.create(null, schema.text(text));
const section = (setup: PageSetup, start = 'next-page') =>
  schema.nodes.section_break!.create({ start, setup });

function stateOf(blocks: PmNode[], anchor: number, head = anchor) {
  const doc = schema.nodes.doc!.create(null, blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

// Each block of the body: a paragraph's text, a break's start and column count, and whether it is an ODF region.
const shape = (doc: PmNode) => {
  const out: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') out.push(node.textContent);
    else {
      const { start, setup, region } = node.attrs as {
        start: string;
        setup: PageSetup;
        region: unknown;
      };
      out.push(`|${start} ${setup.columns?.count ?? 1}${region ? ' region' : ''}|`);
    }
  });
  return out;
};

describe('columnsAt', () => {
  it("reads the caret's section's columns, one where it has none", () => {
    const state = stateOf([p('a'), section({ ...letter, columns: two }, 'continuous'), p('b')], 5);
    expect(columnsAt(state, letter)).toEqual(two);
    expect(columnsAt(stateOf([p('a')], 1), letter)).toEqual({ count: 1, gap: 36 });
  });
});

describe('columnsChange', () => {
  it("sets the first section's columns where the caret is in it, making no break", () => {
    const { tr, first, sections } = columnsChange(stateOf([p('a'), p('b')], 1), two, letter, 'odf');
    expect(tr.docChanged).toBe(false);
    expect(first?.columns).toEqual(two);
    expect(sections).toBe(1);
  });

  it("sets a later section's columns on its break, keeping its paper", () => {
    const a5 = PageSetup.of('a5');
    const state = stateOf([p('a'), section(a5), p('b')], 5);
    const { tr, first } = columnsChange(state, three, letter, 'ooxml');
    expect(first).toBeNull();
    const setup = (tr.doc.child(1).attrs as { setup: PageSetup }).setup;
    expect(setup.columns).toEqual(three);
    expect(PageSetup.equal(setup, a5)).toBe(true);
  });

  it('makes the selected paragraphs a section of their own between continuous breaks (ODF regions)', () => {
    // "a" 0-3, "b" 3-6, "c" 6-9: select inside "b".
    const { tr, first } = columnsChange(
      stateOf([p('a'), p('b'), p('c')], 4, 5),
      two,
      letter,
      'odf',
    );
    expect(shape(tr.doc)).toEqual([
      'a',
      '|continuous 2 region|',
      'b',
      '|continuous 1 region|',
      'c',
    ]);
    expect(first).toBeNull();
  });

  it('makes OOXML continuous breaks without regions, and none at the document start or end', () => {
    const { tr, first } = columnsChange(stateOf([p('a'), p('b')], 1, 5), two, letter, 'ooxml');
    expect(shape(tr.doc)).toEqual(['a', 'b']);
    expect(first?.columns).toEqual(two);
  });

  it('keeps a break already before or after the selection as it is', () => {
    const state = stateOf([p('a'), section(letter), p('b'), p('c')], 5, 6);
    const { tr } = columnsChange(state, two, letter, 'ooxml');
    expect(shape(tr.doc)).toEqual(['a', '|next-page 2|', 'b', '|continuous 1|', 'c']);
  });

  it('changes nothing when the section already has these columns', () => {
    const state = stateOf([p('a'), section({ ...letter, columns: two }), p('b')], 5);
    expect(columnsChange(state, { count: 2, gap: 36 }, letter, 'odf').sections).toBe(0);
    expect(columnsChange(stateOf([p('a')], 1), { count: 1, gap: 20 }, letter, 'odf').sections).toBe(
      0,
    );
  });

  it('sets one column back as none', () => {
    const state = stateOf([p('a'), section({ ...letter, columns: two }), p('b')], 5);
    const { tr } = columnsChange(state, { count: 1, gap: 36 }, letter, 'odf');
    expect('columns' in (tr.doc.child(1).attrs as { setup: PageSetup }).setup).toBe(false);
  });
});
