// docs/specs/034-text-documents/tables.md "Inserting", objects.md "Building blocks" ("Where it goes"): blocks put in at
// the caret go before an empty paragraph or one whose start has the caret, after one whose end has it with an empty
// paragraph following, and split a paragraph between; a selection is deleted first.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import { offsetInside, placeBlocks } from './text-document-block-place';

const p = (text: string) => schema.nodes.paragraph!.create(null, text ? [schema.text(text)] : []);
const block = () => schema.nodes.paragraph!.create({ style: 'Block' }, [schema.text('B')]);

function placed(doc: PmNode, from: number, to = from) {
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  const tr = state.tr;
  const at = placeBlocks(tr, [block()]);
  const shape = tr.doc.content.content.map((node) =>
    node.attrs.style === 'Block' ? '[B]' : node.textContent,
  );
  return { at, shape, doc: tr.doc };
}

describe('placeBlocks', () => {
  it('splits a paragraph at the caret, leaving no empty half', () => {
    const { at, shape, doc } = placed(schema.node('doc', null, [p('abcd')]), 3);
    expect(shape).toEqual(['ab', '[B]', 'cd']);
    expect(doc.nodeAt(at!)?.attrs.style).toBe('Block');
  });

  it('goes before an empty paragraph, which stays after it to write on', () => {
    const { shape } = placed(schema.node('doc', null, [p('ab'), p('')]), 5);
    expect(shape).toEqual(['ab', '[B]', '']);
  });

  it('goes before a paragraph whose start has the caret', () => {
    expect(placed(schema.node('doc', null, [p('abcd')]), 1).shape).toEqual(['[B]', 'abcd']);
  });

  it('goes after a paragraph whose end has the caret, an empty paragraph following', () => {
    expect(placed(schema.node('doc', null, [p('abcd'), p('next')]), 5).shape).toEqual([
      'abcd',
      '[B]',
      '',
      'next',
    ]);
  });

  it('deletes a selection first', () => {
    expect(placed(schema.node('doc', null, [p('abcd')]), 2, 4).shape).toEqual(['a', '[B]', 'd']);
  });

  it('declines outside a text block', () => {
    const doc = schema.node('doc', null, [p('ab')]);
    const state = EditorState.create({ doc });
    const tr = state.tr.setSelection(TextSelection.create(doc, 0));
    // A text selection at 0 resolves into no text block's content: nothing is put in.
    expect(tr.selection.$from.parent.isTextblock ? 'text' : 'none').toBe('none');
    expect(placeBlocks(tr, [block()])).toBeNull();
    expect(tr.docChanged).toBe(false);
  });
});

describe('offsetInside', () => {
  it('finds a place inside a paragraph after earlier blocks', () => {
    const nodes = [p('ab'), p('cdef')];
    // Past the first paragraph (4), into the second (1), three characters on.
    expect(offsetInside(nodes, [1], 3)).toBe(8);
  });

  it('finds a cell’s paragraph inside a table', () => {
    const cell = (text: string) => schema.nodes.table_cell!.create(null, p(text));
    const row = (a: string, b: string) => schema.nodes.table_row!.create(null, [cell(a), cell(b)]);
    const table = schema.nodes.table!.create(null, [row('a', 'b'), row('', '')]);
    const doc = schema.node('doc', null, [p('x'), table]);
    const offset = offsetInside([p('x'), table], [1, 1, 0, 0], 0);
    // The second row's first cell's empty paragraph.
    const $pos = doc.resolve(offset);
    expect($pos.parent.type.name).toBe('paragraph');
    expect($pos.node($pos.depth - 2)).toBe(doc.child(1).child(1));
    expect($pos.index($pos.depth - 2)).toBe(0);
  });
});
