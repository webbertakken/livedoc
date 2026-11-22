// docs/specs/034-text-documents/tables.md "Working in a table", Move: the caret's row or column (the selected ones, as a
// block) moves past its neighbour, its widths with it and the caret in its cell; refused at the table's edge, across
// the header rows' boundary, and where a cell spans the rows or columns moved or passed.
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { textDocumentSchema as schema } from './text-document-schema';
import { moveColumnTo, moveColumns, moveRowTo, moveRows } from './text-document-table-move';

const cell = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.table_cell!.create(
    { colwidth: [100], ...attrs },
    schema.nodes.paragraph!.create(null, schema.text(text)),
  );
const header = (text: string) =>
  schema.nodes.table_header!.create(
    { colwidth: [100] },
    schema.nodes.paragraph!.create(null, schema.text(text)),
  );
const row = (...cells: PmNode[]) => schema.nodes.table_row!.create(null, cells);
const table = (...rows: PmNode[]) =>
  schema.nodes.doc!.create(null, [schema.nodes.table!.create(null, rows)]);
/** A 3 x 3 table, a1 to c3, column b 200 pt wide. */
const grid = () =>
  table(
    ...[1, 2, 3].map((r) => row(cell(`a${r}`), cell(`b${r}`, { colwidth: [200] }), cell(`c${r}`))),
  );

const posOf = (doc: PmNode, text: string, cells = false) => {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (cells && node.type.spec.tableRole !== undefined && node.textContent === text) at = pos;
    if (!cells && node.isText && node.text === text) at = pos;
    return true;
  });
  return at;
};
const caretIn = (doc: PmNode, text: string) => {
  const state = EditorState.create({ doc, schema });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, posOf(doc, text) + 1)));
};
const selecting = (doc: PmNode, from: string, to: string) => {
  const state = EditorState.create({ doc, schema });
  return state.apply(
    state.tr.setSelection(
      CellSelection.create(state.doc, posOf(doc, from, true), posOf(doc, to, true)),
    ),
  );
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
const caretText = (state: EditorState) => state.selection.$from.parent.textContent;

describe('moveRows', () => {
  it('moves the caret\u2019s row up or down past its neighbour, the caret with it', () => {
    const down = run(caretIn(grid(), 'b1'), moveRows('down')).state;
    expect(texts(down)).toEqual([
      ['a2', 'b2', 'c2'],
      ['a1', 'b1', 'c1'],
      ['a3', 'b3', 'c3'],
    ]);
    expect(caretText(down)).toBe('b1');
    const up = run(down, moveRows('up')).state;
    expect(texts(up)[0]).toEqual(['a1', 'b1', 'c1']);
    expect(caretText(up)).toBe('b1');
  });

  it('moves the selected rows as a block', () => {
    const moved = run(selecting(grid(), 'a1', 'c2'), moveRows('down')).state;
    expect(texts(moved).map((r) => r[0])).toEqual(['a3', 'a1', 'a2']);
    expect(moved.selection).toBeInstanceOf(CellSelection);
  });

  it('is refused at the table\u2019s edge', () => {
    expect(run(caretIn(grid(), 'a1'), moveRows('up')).ran).toBe(false);
    expect(run(caretIn(grid(), 'a3'), moveRows('down')).ran).toBe(false);
  });

  it('never moves a row across the header rows\u2019 boundary', () => {
    const headed = table(
      row(header('h1'), header('h2')),
      row(cell('a1'), cell('b1')),
      row(cell('a2'), cell('b2')),
    );
    expect(run(caretIn(headed, 'a1'), moveRows('up')).ran).toBe(false);
    expect(run(caretIn(headed, 'h1'), moveRows('down')).ran).toBe(false);
    expect(run(caretIn(headed, 'a1'), moveRows('down')).ran).toBe(true);
  });

  it('is refused where a cell spans the rows moved or passed', () => {
    const spanned = table(
      row(cell('a1', { rowspan: 2 }), cell('b1')),
      row(cell('b2')),
      row(cell('a3'), cell('b3')),
    );
    expect(run(caretIn(spanned, 'b2'), moveRows('down')).ran).toBe(false);
    expect(run(caretIn(spanned, 'a3'), moveRows('up')).ran).toBe(false);
  });

  it('only checks when asked to dry run', () => {
    expect(moveRows('down')(caretIn(grid(), 'a1'))).toBe(true);
    expect(moveRows('up')(caretIn(grid(), 'a1'))).toBe(false);
  });
});

describe('moveColumns', () => {
  it('moves the caret\u2019s column with its width, the caret with it', () => {
    const right = run(caretIn(grid(), 'b2'), moveColumns('right')).state;
    expect(texts(right)[0]).toEqual(['a1', 'c1', 'b1']);
    expect(right.doc.firstChild!.child(0).child(2).attrs.colwidth).toEqual([200]);
    expect(caretText(right)).toBe('b2');
    const left = run(caretIn(grid(), 'b2'), moveColumns('left')).state;
    expect(texts(left)[2]).toEqual(['b3', 'a3', 'c3']);
  });

  it('moves the selected columns as a block, and is refused at the edge', () => {
    const moved = run(selecting(grid(), 'a1', 'b3'), moveColumns('right')).state;
    expect(texts(moved)[0]).toEqual(['c1', 'a1', 'b1']);
    expect(run(caretIn(grid(), 'c1'), moveColumns('right')).ran).toBe(false);
    expect(run(caretIn(grid(), 'a1'), moveColumns('left')).ran).toBe(false);
  });

  it('is refused where a cell spans the columns moved or passed', () => {
    const spanned = table(
      row(cell('a1', { colspan: 2, colwidth: [100, 100] }), cell('c1')),
      row(cell('a2'), cell('b2'), cell('c2')),
    );
    expect(run(caretIn(spanned, 'c2'), moveColumns('left')).ran).toBe(false);
    expect(run(caretIn(spanned, 'a2'), moveColumns('right')).ran).toBe(false);
  });
});

describe('moveRowTo', () => {
  it('takes a row out and puts it back before another, the caret in it', () => {
    const state = caretIn(grid(), 'b2');
    const tableStart = 1;
    const moved = run(state, moveRowTo(tableStart, 0, 3)).state;
    expect(texts(moved).map((r) => r[0])).toEqual(['a2', 'a3', 'a1']);
    expect(caretText(moved)).toBe('a1');
    const back = run(moved, moveRowTo(tableStart, 2, 0)).state;
    expect(texts(back).map((r) => r[0])).toEqual(['a1', 'a2', 'a3']);
  });

  it('changes nothing for a place beside itself, and refuses across header rows or spans', () => {
    expect(run(caretIn(grid(), 'a1'), moveRowTo(1, 1, 2)).ran).toBe(false);
    expect(run(caretIn(grid(), 'a1'), moveRowTo(1, 1, 1)).ran).toBe(false);
    const headed = table(
      row(header('h1'), header('h2')),
      row(cell('a1'), cell('b1')),
      row(cell('a2'), cell('b2')),
    );
    expect(run(caretIn(headed, 'a1'), moveRowTo(1, 2, 0)).ran).toBe(false);
    expect(run(caretIn(headed, 'a1'), moveRowTo(1, 2, 1)).ran).toBe(true);
    const spanned = table(
      row(cell('a1', { rowspan: 2 }), cell('b1')),
      row(cell('b2')),
      row(cell('a3'), cell('b3')),
    );
    expect(run(caretIn(spanned, 'a3'), moveRowTo(1, 2, 0)).ran).toBe(false);
  });
});

describe('moveColumnTo', () => {
  it('takes a column out and puts it back before another, its width with it', () => {
    const moved = run(caretIn(grid(), 'a1'), moveColumnTo(1, 1, 0)).state;
    expect(texts(moved)[1]).toEqual(['b2', 'a2', 'c2']);
    expect(moved.doc.firstChild!.child(0).child(0).attrs.colwidth).toEqual([200]);
    const last = run(caretIn(grid(), 'a1'), moveColumnTo(1, 0, 3)).state;
    expect(texts(last)[0]).toEqual(['b1', 'c1', 'a1']);
    expect(run(caretIn(grid(), 'a1'), moveColumnTo(1, 0, 1)).ran).toBe(false);
  });
});
