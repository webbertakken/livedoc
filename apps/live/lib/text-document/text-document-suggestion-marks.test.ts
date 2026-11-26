// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "While suggesting": a suggested paragraph break or join is drawn as a pilcrow
// at the end of the paragraph before it, in its author's colour, struck through for a join.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  suggestedBlocks,
  suggestedBreaks,
  suggestedBreaksPlugin,
} from './text-document-suggestion-marks';

const mark = (colour = '#0284c7') => ({
  id: 's1',
  at: 1,
  author: { key: 'k', name: 'Ada', colour },
});
const p = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(attrs, schema.text(text));

describe('suggestedBreaks', () => {
  it('places a break’s and a join’s pilcrow at the end of the paragraph before', () => {
    const doc = schema.nodes.doc!.create(null, [
      p('one', { insertion: mark() }),
      p('two', { insertion: mark() }),
      p('three', { deletion: mark('nope') }),
    ]);
    expect(suggestedBreaks(doc)).toEqual([
      { at: 4, kind: 'insertion', ink: expect.any(String) },
      { at: 9, kind: 'deletion' },
    ]);
  });

  it('draws the pilcrows in the view', () => {
    const doc = schema.nodes.doc!.create(null, [p('one'), p('two', { deletion: mark() })]);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [suggestedBreaksPlugin()] }),
    });
    const drawn = view.dom.querySelector('.text-document-suggested-break-deletion') as HTMLElement;
    expect(drawn.textContent).toBe('¶');
    expect(drawn.style.textDecorationLine).toBe('line-through');
    view.destroy();
  });
});

// review.md "Whole blocks": a suggested block drawn inside an outline in its author's colour, dashed and struck through
// when deleted; what is inside it plain.
describe('suggestedBlocks', () => {
  const table = (attrs: Record<string, unknown>) =>
    schema.nodes.table!.create(
      attrs,
      schema.nodes.table_row!.create(null, schema.nodes.table_cell!.create(null, p('in'))),
    );

  it('finds each suggested table, section break and table of contents with its kind and ink', () => {
    const doc = schema.nodes.doc!.create(null, [
      p('a'),
      table({ insertion: mark() }),
      schema.nodes.section_break!.create({ deletion: mark() }),
      p('b'),
    ]);
    const blocks = suggestedBlocks(doc);
    expect(blocks.map((b) => [b.name, b.kind, b.id])).toEqual([
      ['table', 'insertion', 's1'],
      ['section_break', 'deletion', 's1'],
    ]);
    expect(blocks[0]!.ink).toEqual(expect.any(String));
  });

  // review.md "Rows and columns": a suggested row is drawn on each of its cells, a column's on its cells, inset.
  it('finds a suggested row as each of its cells, and a suggested cell itself', () => {
    const cell = (attrs: Record<string, unknown> = {}) =>
      schema.nodes.table_cell!.create(attrs, p('x'));
    const doc = schema.nodes.doc!.create(null, [
      p('a'),
      schema.nodes.table!.create(null, [
        schema.nodes.table_row!.create({ insertion: mark() }, [cell(), cell()]),
        schema.nodes.table_row!.create(null, [cell(), cell({ deletion: mark() })]),
      ]),
      p('b'),
    ]);
    const blocks = suggestedBlocks(doc);
    expect(blocks.map((b) => [b.name, b.kind, doc.nodeAt(b.from)!.type.name, b.inset])).toEqual([
      ['table_row', 'insertion', 'table_cell', true],
      ['table_row', 'insertion', 'table_cell', true],
      ['table_cell', 'deletion', 'table_cell', true],
    ]);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [suggestedBreaksPlugin()] }),
    });
    const drawn = view.dom.querySelector(
      'td.text-document-suggested-block-deletion',
    ) as HTMLElement;
    expect(drawn.style.outlineOffset).toBe('-2px');
    view.destroy();
  });

  it('draws the outline in the view, dashed and struck through for a deletion', () => {
    const doc = schema.nodes.doc!.create(null, [p('a'), table({ deletion: mark() }), p('b')]);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [suggestedBreaksPlugin()] }),
    });
    const drawn = view.dom.querySelector('.text-document-suggested-block-deletion') as HTMLElement;
    expect(drawn.getAttribute('data-suggestion')).toBe('s1');
    expect(drawn.style.outlineStyle).toBe('dashed');
    expect(drawn.style.textDecorationLine).toBe('line-through');
    view.destroy();
  });
});
