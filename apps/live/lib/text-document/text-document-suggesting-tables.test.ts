// docs/specs/034-text-documents/review.md "While suggesting" (Rows and columns, Not yet): a row or column added is the
// person's insertion of it, its cells' writing unmarked; one deleted is marked and stays (one's own taken away); rows
// added one after another are one suggestion; a new column takes its neighbour's width, the others keeping theirs;
// across merged cells (director, 2026-11-26) a row or column put in grows the merged cell, one deleted leaves it until
// Accept, one's own taken away shrinks it back; reshaping anyone else's table is not yet.
import { describe, expect, it } from 'vitest';
import { TextSelection, type EditorState } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import { suggestTransaction } from './text-document-suggesting';
import {
  ADA,
  BEN,
  as,
  blockOf,
  commanded,
  idOf,
  mark,
  p,
  stateWith,
  suggest,
  table,
} from './text-document-suggesting.test-kit';
import { deleteColumns, deleteRows, setColumnWidths } from './text-document-table-edits';
import { insertColumns, insertRows } from './text-document-table-insert';
import { moveRows } from './text-document-table-move';

/** The state with the caret in the given cell (row, column) of the first table. */
function inCell(state: EditorState, row: number, column: number): EditorState {
  let at = -1;
  state.doc.descendants((n, pos) => {
    if (at >= 0) return false;
    if (n.type.name !== 'table') return true;
    const r = n.child(row);
    let offset = pos + 1;
    for (let i = 0; i < row; i++) offset += n.child(i).nodeSize;
    offset += 1;
    for (let c = 0; c < column; c++) offset += r.child(c).nodeSize;
    at = offset + 2;
    return false;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

/** Each row's suggestion id and each of its cells', as `row: cell cell`. */
const shape = (state: EditorState) => {
  const out: string[] = [];
  blockOf(state, 'table')!.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) =>
      cells.push(
        `${idOf(cell.attrs.insertion) ? `+${idOf(cell.attrs.insertion)}` : ''}${idOf(cell.attrs.deletion) ? `-${idOf(cell.attrs.deletion)}` : ''}` ||
          '.',
      ),
    );
    const r = `${idOf(row.attrs.insertion) ? `+${idOf(row.attrs.insertion)}` : ''}${idOf(row.attrs.deletion) ? `-${idOf(row.attrs.deletion)}` : ''}`;
    out.push(`${r || '.'}: ${cells.join(' ')}`);
  });
  return out;
};

/** Every inline mark of insertion or deletion inside the first table. */
const textMarks = (state: EditorState) => {
  const out: string[] = [];
  blockOf(state, 'table')!.descendants((n) => {
    for (const m of n.marks)
      if (m.type.name === 'insertion' || m.type.name === 'deletion')
        out.push(`${n.text}:${m.type.name}:${idOf(m.attrs)}`);
    return true;
  });
  return out;
};

const widths = (state: EditorState) => {
  const out: number[][] = [];
  blockOf(state, 'table')!.forEach((row) => {
    const w: number[] = [];
    row.forEach((cell) => w.push(...((cell.attrs.colwidth as number[] | null) ?? [])));
    out.push(w);
  });
  return out;
};

/** Each row's cells' spans, as `rows×columns`. */
const spans = (state: EditorState) => {
  const out: string[][] = [];
  blockOf(state, 'table')!.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) =>
      cells.push(`${String(cell.attrs.rowspan)}×${String(cell.attrs.colspan)}`),
    );
    out.push(cells);
  });
  return out;
};

const withTable = (t: PmNode = table()) => stateWith([p('a'), t, p('b')], 1);

/** A 2 × 2 table whose first column's cells are one, merged down. */
const mergedDown = () => {
  const cell = (attrs: Record<string, unknown>, text = '') =>
    schema.nodes.table_cell!.create({ colwidth: [100], ...attrs }, p(text));
  return schema.nodes.table!.create(null, [
    schema.nodes.table_row!.create(null, [cell({ rowspan: 2 }, 'tall'), cell({}, 'b1')]),
    schema.nodes.table_row!.create(null, [cell({}, 'b2')]),
  ]);
};
/** A 2 × 2 table whose first row is one cell, merged across. */
const mergedAcross = () => {
  const cell = (attrs: Record<string, unknown>, text = '') =>
    schema.nodes.table_cell!.create({ colwidth: [100], ...attrs }, p(text));
  return schema.nodes.table!.create(null, [
    schema.nodes.table_row!.create(null, [cell({ colspan: 2, colwidth: [100, 100] }, 'wide')]),
    schema.nodes.table_row!.create(null, [cell({}, 'a2'), cell({}, 'b2')]),
  ]);
};

describe('suggestTransaction on rows and columns', () => {
  it('adds a row as the person’s insertion, its cells’ writing unmarked', () => {
    const state = inCell(withTable(), 0, 0);
    const next = suggest(state, commanded(state, insertRows('below')));
    expect(shape(next)).toEqual(['.: . .', '+s1: . .', '.: . .']);
    expect(textMarks(next)).toEqual([]);
  });

  it('makes rows added one after another one suggestion', () => {
    const state = inCell(withTable(), 0, 0);
    const once = suggest(state, commanded(state, insertRows('below')));
    const twice = suggest(
      inCell(once, 1, 0),
      commanded(inCell(once, 1, 0), insertRows('below')),
      as(ADA, 's2'),
    );
    expect(shape(twice)).toEqual(['.: . .', '+s1: . .', '+s1: . .', '.: . .']);
  });

  it('suggests a row deleted: it stays, marked, the caret in it', () => {
    const state = inCell(withTable(), 1, 0);
    const result = suggestTransaction(state, commanded(state, deleteRows), as(ADA));
    if ('refused' in result) throw new Error(result.refused);
    const next = state.apply(result.tr);
    expect(shape(next)).toEqual(['.: . .', '-s1: . .']);
    const $head = next.selection.$head;
    expect($head.node($head.depth - 2).type.name).toBe('table_row');
    expect($head.index($head.depth - 3)).toBe(1);
  });

  it('takes one’s own suggested row away when it is deleted', () => {
    const state = inCell(withTable(), 0, 0);
    const added = suggest(state, commanded(state, insertRows('below')));
    const inAdded = inCell(added, 1, 0);
    expect(shape(suggest(inAdded, commanded(inAdded, deleteRows)))).toEqual(['.: . .', '.: . .']);
  });

  it('adds a column as each new cell’s insertion, the table growing by its neighbour’s width', () => {
    const state = inCell(withTable(), 0, 1);
    const next = suggest(state, commanded(state, insertColumns('right', { keepWidths: true })));
    expect(shape(next)).toEqual(['.: . . +s1', '.: . . +s1']);
    expect(widths(next)).toEqual([
      [100, 100, 100],
      [100, 100, 100],
    ]);
    expect(textMarks(next)).toEqual([]);
  });

  it('suggests a column deleted: each of its cells marked, staying', () => {
    const state = inCell(withTable(), 0, 0);
    const next = suggest(state, commanded(state, deleteColumns));
    expect(shape(next)).toEqual(['.: -s1 .', '.: -s1 .']);
  });

  it('writes in one’s own suggested row plainly; another person’s writing there is their own', () => {
    const state = inCell(withTable(), 0, 0);
    const added = inCell(suggest(state, commanded(state, insertRows('below'))), 1, 0);
    const own = suggest(added, added.tr.insertText('mine'));
    expect(textMarks(own)).toEqual([]);
    const bens = suggest(added, added.tr.insertText('his'), as(BEN, 'b1'));
    expect(textMarks(bens)).toEqual(['his:insertion:b1']);
  });

  it('grows a merged cell over a row put in through it, as part of the row', () => {
    const state = inCell(withTable(mergedDown()), 0, 1);
    const next = suggest(state, commanded(state, insertRows('below')));
    expect(shape(next)).toEqual(['.: . .', '+s1: .', '.: .']);
    expect(spans(next)).toEqual([['3×1', '1×1'], ['1×1'], ['1×1']]);
  });

  it('grows a merged cell over a column put in through it, by the column’s width', () => {
    const state = inCell(withTable(mergedAcross()), 1, 0);
    const next = suggest(state, commanded(state, insertColumns('right', { keepWidths: true })));
    expect(shape(next)).toEqual(['.: .', '.: . +s1 .']);
    expect(spans(next)).toEqual([['1×3'], ['1×1', '1×1', '1×1']]);
    expect(widths(next)).toEqual([
      [100, 100, 100],
      [100, 100, 100],
    ]);
  });

  it('marks a row a merged cell crosses deleted, the merged cell staying', () => {
    const state = inCell(withTable(mergedDown()), 1, 0);
    const next = suggest(state, commanded(state, deleteRows));
    expect(shape(next)).toEqual(['.: . .', '-s1: .']);
    expect(spans(next)).toEqual([['2×1', '1×1'], ['1×1']]);
  });

  it('marks a row a merged cell starts in deleted, nothing moving', () => {
    const state = inCell(withTable(mergedDown()), 0, 1);
    const next = suggest(state, commanded(state, deleteRows));
    expect(shape(next)).toEqual(['-s1: . .', '.: .']);
    expect(spans(next)).toEqual([['2×1', '1×1'], ['1×1']]);
  });

  it('marks a column a merged cell crosses deleted, the merged cell staying', () => {
    const state = inCell(withTable(mergedAcross()), 1, 0);
    const next = suggest(state, commanded(state, deleteColumns));
    expect(shape(next)).toEqual(['.: .', '.: -s1 .']);
    expect(spans(next)).toEqual([['1×2'], ['1×1', '1×1']]);
  });

  it('takes one’s own row away through a merged cell, shrinking it back', () => {
    const state = inCell(withTable(mergedDown()), 0, 1);
    const grown = inCell(suggest(state, commanded(state, insertRows('below'))), 1, 0);
    const next = suggest(grown, commanded(grown, deleteRows));
    expect(shape(next)).toEqual(['.: . .', '.: .']);
    expect(spans(next)).toEqual([['2×1', '1×1'], ['1×1']]);
  });

  it('takes one’s own column away through a merged cell, its width with it', () => {
    const state = inCell(withTable(mergedAcross()), 1, 0);
    const grown = inCell(
      suggest(state, commanded(state, insertColumns('right', { keepWidths: true }))),
      1,
      1,
    );
    const next = suggest(grown, commanded(grown, deleteColumns));
    expect(shape(next)).toEqual(['.: .', '.: . .']);
    expect(spans(next)).toEqual([['1×2'], ['1×1', '1×1']]);
    expect(widths(next)).toEqual([
      [100, 100],
      [100, 100],
    ]);
  });

  it('marks a column deleted through one’s own row, that row’s cell too', () => {
    const state = inCell(withTable(), 0, 0);
    const added = inCell(suggest(state, commanded(state, insertRows('below'))), 0, 1);
    const next = suggest(added, commanded(added, deleteColumns), as(ADA, 's2'));
    expect(shape(next)).toEqual(['.: . -s2', '+s1: . -s2', '.: . -s2']);
  });

  it('takes one’s own column away through one’s own row', () => {
    const state = inCell(withTable(), 0, 0);
    const column = inCell(
      suggest(state, commanded(state, insertColumns('right', { keepWidths: true }))),
      0,
      0,
    );
    const row = inCell(suggest(column, commanded(column, insertRows('below'))), 0, 1);
    expect(shape(row)).toEqual(['.: . +s1 .', '+s1: . . .', '.: . +s1 .']);
    const next = suggest(row, commanded(row, deleteColumns));
    expect(shape(next)).toEqual(['.: . .', '+s1: . .', '.: . .']);
  });

  it('refuses deleting a column partly one’s own: not yet', () => {
    const state = inCell(withTable(), 0, 0);
    const column = inCell(
      suggest(state, commanded(state, insertColumns('right', { keepWidths: true }))),
      0,
      0,
    );
    const row = inCell(
      suggest(column, commanded(column, insertRows('below')), as(BEN, 'b1')),
      0,
      1,
    );
    expect(shape(row)).toEqual(['.: . +s1 .', '+b1: . . .', '.: . +s1 .']);
    expect(suggestTransaction(row, commanded(row, deleteColumns), as(ADA))).toEqual({
      refused: 'structure',
    });
  });

  it('refuses changing only the widths of anyone else’s table', () => {
    const state = inCell(withTable(), 0, 0);
    const tr = state.tr;
    setColumnWidths(tr, 4, [150, 50]);
    expect(suggestTransaction(state, tr, as(ADA))).toEqual({ refused: 'structure' });
  });

  it('puts a row in beside a suggested row in Editing without its suggestion', () => {
    const suggested = inCell(withTable(), 0, 0);
    const added = inCell(suggest(suggested, commanded(suggested, insertRows('below'))), 1, 0);
    const plain = added.apply(commanded(added, insertRows('below')));
    expect(shape(plain)).toEqual(['.: . .', '+s1: . .', '.: . .', '.: . .']);
  });

  it('refuses moving rows in anyone else’s table, and moves them plainly in one’s own', () => {
    const others = inCell(withTable(), 0, 0);
    expect(suggestTransaction(others, commanded(others, moveRows('down')), as(ADA))).toEqual({
      refused: 'structure',
    });
    const own = inCell(withTable(table({ insertion: mark('s0') })), 0, 0);
    const moved = suggest(own, commanded(own, moveRows('down')));
    expect(shape(moved)).toEqual(['.: . .', '.: . .']);
  });
});
