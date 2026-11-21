// docs/specs/034-text-documents/tables.md "Working in a table"; keyboard-shortcuts.md "Table navigation": each move puts
// the caret at the start of a cell, after the table, or in the next or previous table; nowhere to go leaves it.
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { textDocumentSchema as schema } from './text-document-schema';
import { TABLE_NAVIGATION } from './text-document-table-navigation';

const p = (text: string) =>
  schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
const cell = (text: string) => schema.nodes.table_cell!.create(null, p(text));
const table = (rows: string[][]) =>
  schema.nodes.table!.create(
    null,
    rows.map((r) => schema.nodes.table_row!.create(null, r.map(cell))),
  );
const doc = () =>
  schema.nodes.doc!.create(null, [
    p('before'),
    table([
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
      ['a3', 'b3', 'c3'],
    ]),
    p('between'),
    table([['x1', 'y1']]),
    p('after'),
  ]);

function caretIn(d: PmNode, text: string): EditorState {
  let at = -1;
  d.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text === text) at = pos + 1;
  });
  const state = EditorState.create({ doc: d, schema });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

/** Where the caret lands: the text of its paragraph, and whether at its start. */
function move(from: string, id: string) {
  const state = caretIn(doc(), from);
  let next = state;
  const moved = TABLE_NAVIGATION[id]!(state, (tr) => {
    next = state.apply(tr);
  });
  const { $head } = next.selection;
  return { moved, at: $head.parent.textContent, start: $head.parentOffset === 0 };
}

describe('table navigation', () => {
  it.each([
    ['move-to-the-start-of-the-table', 'b2', 'a1'],
    ['move-to-the-end-of-the-table', 'b2', 'c3'],
    ['move-to-the-start-of-the-table-column', 'b2', 'b1'],
    ['move-to-the-end-of-the-table-column', 'b2', 'b3'],
    ['move-to-the-next-table-column', 'b2', 'c2'],
    ['move-to-the-previous-table-column', 'b2', 'a2'],
    ['move-to-the-start-of-the-table-row', 'b2', 'a2'],
    ['move-to-the-end-of-the-table-row', 'b2', 'c2'],
    ['move-to-the-next-table-row', 'b2', 'b3'],
    ['move-to-the-previous-table-row', 'b2', 'b1'],
    ['exit-table', 'b2', 'between'],
    ['move-to-the-next-table', 'b2', 'x1'],
    ['move-to-the-previous-table', 'y1', 'a1'],
    ['move-to-the-next-table', 'before', 'a1'],
  ])('%s from %s lands at the start of %s', (id, from, to) => {
    expect(move(from, id)).toEqual({ moved: true, at: to, start: true });
  });

  it('stays at an edge with nowhere to go, and does nothing outside a table', () => {
    expect(move('c2', 'move-to-the-next-table-column').at).toBe('c2');
    expect(move('a1', 'move-to-the-previous-table-row').at).toBe('a1');
    expect(move('y1', 'move-to-the-next-table').moved).toBe(false);
    expect(move('before', 'move-to-the-next-table-row').moved).toBe(false);
    expect(move('before', 'exit-table').moved).toBe(false);
  });
});
