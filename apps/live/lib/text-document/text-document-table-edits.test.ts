// docs/specs/034-text-documents/tables.md "Working in a table": rows and columns inserted like the caret's (columns
// keeping the table's width), deleted (columns narrowing it, the last deleting the table), distributed; cells merged and
// unmerged; the table deleted.
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  deleteColumns,
  deleteRows,
  deleteWholeTable,
  distributeColumns,
  distributeRows,
  insertColumns,
  insertRows,
  mergeTableCells,
  unmergeTableCell,
} from './text-document-table-edits';

const SHADE = { background: '#ff0000' };

const cell = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.table_cell!.create(
    { colwidth: [100], ...attrs },
    schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined),
  );
const row = (...cells: PmNode[]) => schema.nodes.table_row!.create(null, cells);
const after = () => schema.nodes.paragraph!.create(null, schema.text('after'));

/** A 2 x 2 table (a1 b1 / a2 b2), columns 100 and 300 pt, b1 shaded, then a paragraph. */
const grid = () =>
  schema.nodes.doc!.create(null, [
    schema.nodes.table!.create(null, [
      row(cell('a1'), cell('b1', { colwidth: [300], props: SHADE })),
      row(cell('a2'), cell('b2', { colwidth: [300] })),
    ]),
    after(),
  ]);

/** The state with the caret in the cell holding `text`. */
function caretIn(doc: PmNode, text: string): EditorState {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text === text) at = pos;
  });
  const state = EditorState.create({ doc, schema });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

const cellPos = (doc: PmNode, text: string) => {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && node.type.spec.tableRole === 'cell' && node.textContent === text) at = pos;
  });
  return at;
};

function run(state: EditorState, command: Command) {
  let next = state;
  const ran = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { ran, state: next };
}

const texts = (state: EditorState) =>
  state.doc.firstChild!.content.content.map((r) => r.content.content.map((c) => c.textContent));
const widths = (state: EditorState) =>
  state.doc.firstChild!.content.content.map((r) =>
    r.content.content.map((c) => c.attrs.colwidth as unknown),
  );

describe('insertRows', () => {
  it('puts an empty row like the caret\u2019s above or below it', () => {
    const above = run(caretIn(grid(), 'b2'), insertRows('above')).state;
    expect(texts(above)).toEqual([
      ['a1', 'b1'],
      ['', ''],
      ['a2', 'b2'],
    ]);
    const below = run(caretIn(grid(), 'b1'), insertRows('below')).state;
    expect(texts(below)).toEqual([
      ['a1', 'b1'],
      ['', ''],
      ['a2', 'b2'],
    ]);
    const added = below.doc.firstChild!.child(1);
    expect(added.child(1).attrs).toMatchObject({ props: SHADE, colwidth: [300], rowspan: 1 });
  });

  it('inserts as many rows as the selection spans, and grows a cell spanning across the place', () => {
    const state = caretIn(grid(), 'a1');
    const both = state.apply(
      state.tr.setSelection(
        CellSelection.create(state.doc, cellPos(state.doc, 'a1'), cellPos(state.doc, 'a2')),
      ),
    );
    expect(texts(run(both, insertRows('below')).state)).toHaveLength(4);
    const spanning = schema.nodes.doc!.create(null, [
      schema.nodes.table!.create(null, [
        row(cell('tall', { rowspan: 2 }), cell('b1')),
        row(cell('b2')),
      ]),
      after(),
    ]);
    const next = run(caretIn(spanning, 'b1'), insertRows('below')).state;
    expect(next.doc.firstChild!.child(0).child(0).attrs.rowspan).toBe(3);
    expect(next.doc.firstChild!.child(1).childCount).toBe(1);
  });

  it('does nothing outside a table', () => {
    expect(run(caretIn(grid(), 'after'), insertRows('above')).ran).toBe(false);
  });
});

describe('insertColumns', () => {
  it('puts a column like the caret\u2019s beside it, the table keeping its width', () => {
    const right = run(caretIn(grid(), 'b1'), insertColumns('right')).state;
    expect(texts(right)).toEqual([
      ['a1', 'b1', ''],
      ['a2', 'b2', ''],
    ]);
    // The new column at the caret's width (300) before every column shares the 400 pt: 400 / 700 each.
    expect(widths(right)[0]).toEqual([[57.14], [171.43], [171.43]]);
    expect(right.doc.firstChild!.child(0).child(2).attrs.props).toEqual(SHADE);
    const left = run(caretIn(grid(), 'a1'), insertColumns('left')).state;
    expect(texts(left)).toEqual([
      ['', 'a1', 'b1'],
      ['', 'a2', 'b2'],
    ]);
  });
});

describe('deleting', () => {
  it('deletes the caret\u2019s row and column, the others keeping their widths', () => {
    expect(texts(run(caretIn(grid(), 'a1'), deleteRows).state)).toEqual([['a2', 'b2']]);
    const narrower = run(caretIn(grid(), 'a1'), deleteColumns).state;
    expect(texts(narrower)).toEqual([['b1'], ['b2']]);
    expect(widths(narrower)).toEqual([[[300]], [[300]]]);
  });

  it('deletes the table when every row or column goes, and with Delete table', () => {
    const one = schema.nodes.doc!.create(null, [
      schema.nodes.table!.create(null, [row(cell('only'))]),
      after(),
    ]);
    expect(run(caretIn(one, 'only'), deleteRows).state.doc.childCount).toBe(1);
    expect(run(caretIn(one, 'only'), deleteColumns).state.doc.childCount).toBe(1);
    const gone = run(caretIn(grid(), 'b2'), deleteWholeTable).state;
    expect(gone.doc.firstChild!.type.name).toBe('paragraph');
    expect(run(caretIn(grid(), 'after'), deleteWholeTable).ran).toBe(false);
  });
});

describe('distributing', () => {
  it('shares every column\u2019s width equally, the table keeping its width', () => {
    expect(widths(run(caretIn(grid(), 'a1'), distributeColumns).state)).toEqual([
      [[200], [200]],
      [[200], [200]],
    ]);
  });

  it('gives every row the tallest one\u2019s height as its minimum', () => {
    const heights = [20, 35];
    let n = 0;
    const next = run(
      caretIn(grid(), 'a1'),
      distributeRows(() => heights[n++]!),
    ).state;
    next.doc.firstChild!.forEach((r) =>
      expect(r.attrs).toMatchObject({ height: 35, heightRule: null }),
    );
  });
});

describe('merging', () => {
  it('merges a selection of cells into the first, and unmerges it back', () => {
    const state = caretIn(grid(), 'a1');
    const pair = state.apply(
      state.tr.setSelection(
        CellSelection.create(state.doc, cellPos(state.doc, 'a1'), cellPos(state.doc, 'b1')),
      ),
    );
    const merged = run(pair, mergeTableCells).state;
    const first = merged.doc.firstChild!.child(0).child(0);
    expect(first.attrs).toMatchObject({ colspan: 2, colwidth: [100, 300] });
    expect(first.textContent).toBe('a1b1');
    // The caret alone merges nothing.
    expect(run(caretIn(grid(), 'a1'), mergeTableCells).ran).toBe(false);
    const inMerged = merged.apply(
      merged.tr.setSelection(TextSelection.create(merged.doc, cellPos(merged.doc, 'a1b1') + 2)),
    );
    const split = run(inMerged, unmergeTableCell).state;
    expect(split.doc.firstChild!.child(0).childCount).toBe(2);
    expect(run(caretIn(grid(), 'a1'), unmergeTableCell).ran).toBe(false);
  });
});
