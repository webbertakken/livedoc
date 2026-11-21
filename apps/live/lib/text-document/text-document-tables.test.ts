// docs/specs/034-text-documents/tables.md "Inserting" and "Working in a table": a new table's columns share the text width,
// every cell lined and padded as Google's; the caret's paragraph splits with no empty half and an empty paragraph after
// the table when nothing follows the caret; the caret in the first cell; Tab and Shift+Tab between cells, Tab in the last
// cell adding a row like the last.
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  goToCell,
  insertTable,
  NEW_TABLE_CELL,
  newTable,
  tableWidthAt,
} from './text-document-tables';

const p = (text = '') => schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
const doc = (...blocks: PmNode[]) => schema.nodes.doc!.create(null, blocks);

/** A state with the caret at `offset` in the paragraph holding `marker` text's start (or the first paragraph). */
function at(d: PmNode, pos: number, to = pos) {
  const state = EditorState.create({ doc: d, schema });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos, to)));
}

function run(state: EditorState, command: Command) {
  let next = state;
  const ran = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { ran, state: next };
}

const shape = (d: PmNode) => {
  const out: string[] = [];
  d.forEach((block) =>
    out.push(block.type.name === 'table' ? `table ${block.childCount}` : `p "${block.textContent}"`),
  );
  return out;
};

const cellText = (state: EditorState) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--)
    if ($from.node(d).type.spec.tableRole === 'cell') return $from.node(d).textContent;
  return null;
};

describe('newTable', () => {
  it('shares the width equally, every cell lined, padded and holding an empty paragraph', () => {
    const table = newTable({ columns: 4, rows: 2, width: 468 });
    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(2);
    table.forEach((row) => {
      expect(row.childCount).toBe(4);
      row.forEach((cell) => {
        expect(cell.type.name).toBe('table_cell');
        expect(cell.attrs.colwidth).toEqual([117]);
        expect(cell.attrs.props).toEqual(NEW_TABLE_CELL);
        expect(cell.childCount).toBe(1);
        expect(cell.firstChild!.type.name).toBe('paragraph');
        expect(cell.firstChild!.attrs.style).toBeNull();
      });
    });
    const line = { width: 1, dash: 'solid', color: '#000000', space: 0 };
    expect(NEW_TABLE_CELL).toEqual({
      borders: { top: line, bottom: line, left: line, right: line },
      padding: { top: 5, bottom: 5, left: 5, right: 5 },
    });
  });
});

describe('insertTable', () => {
  const size = { columns: 2, rows: 2 };

  it('takes an empty paragraph\u2019s place, an empty paragraph after it, the caret in the first cell', () => {
    const { ran, state } = run(at(doc(p('before'), p()), 9), insertTable(size, 400));
    expect(ran).toBe(true);
    expect(shape(state.doc)).toEqual(['p "before"', 'table 2', 'p ""']);
    expect(cellText(state)).toBe('');
    expect(state.selection.$from.node(1).type.name).toBe('table');
  });

  it('splits a paragraph at the caret with the table between its halves', () => {
    const { state } = run(at(doc(p('onetwo')), 4), insertTable(size, 400));
    expect(shape(state.doc)).toEqual(['p "one"', 'table 2', 'p "two"']);
  });

  it('goes before a paragraph whose start the caret is at, leaving no empty half', () => {
    const { state } = run(at(doc(p('words')), 1), insertTable(size, 400));
    expect(shape(state.doc)).toEqual(['table 2', 'p "words"']);
  });

  it('goes after a paragraph whose end the caret is at, an empty paragraph after it', () => {
    const { state } = run(at(doc(p('words'), p('next')), 6), insertTable(size, 400));
    expect(shape(state.doc)).toEqual(['p "words"', 'table 2', 'p ""', 'p "next"']);
  });

  it('puts the selection\u2019s writing away first', () => {
    const { state } = run(at(doc(p('abcdef')), 3, 5), insertTable(size, 400));
    expect(shape(state.doc)).toEqual(['p "ab"', 'table 2', 'p "ef"']);
  });

  it('is one step that undoes whole', () => {
    const before = at(doc(p('onetwo')), 4);
    let steps = 0;
    insertTable(size, 400)(before, (tr) => {
      steps = tr.docChanged ? 1 : 0;
    });
    expect(steps).toBe(1);
  });
});

describe('tableWidthAt', () => {
  it('is the section\u2019s text width outside a table, a cell\u2019s less its padding inside one', () => {
    const outside = at(doc(p('x')), 1);
    expect(tableWidthAt(outside, 468)).toBe(468);
    const { state } = run(outside, insertTable({ columns: 2, rows: 1 }, 400));
    // Each cell 200 pt, less 5 pt of padding each side.
    expect(tableWidthAt(state, 468)).toBe(190);
  });
});

describe('goToCell', () => {
  const table = () => {
    const { state } = run(at(doc(p()), 1), insertTable({ columns: 2, rows: 2 }, 400));
    return state;
  };
  const typed = (state: EditorState, text: string) => state.apply(state.tr.insertText(text));

  it('moves to the next cell with Tab and the one before with Shift+Tab', () => {
    let state = typed(table(), 'a');
    state = run(state, goToCell(1)).state;
    state = typed(state, 'b');
    state = run(state, goToCell(-1)).state;
    expect(cellText(state)).toBe('a');
    // The cell's writing is selected.
    expect(state.selection.empty).toBe(false);
  });

  it('holds Shift+Tab in the first cell', () => {
    const state = table();
    const { ran, state: after } = run(state, goToCell(-1));
    expect(ran).toBe(true);
    expect(after.selection.from).toBe(state.selection.from);
  });

  it('adds a row like the last with Tab in the last cell, the caret in its first cell', () => {
    let state = table();
    for (let i = 0; i < 3; i++) state = run(state, goToCell(1)).state;
    state = typed(state, 'last');
    const { ran, state: after } = run(state, goToCell(1));
    expect(ran).toBe(true);
    const t = after.doc.child(0);
    expect(t.childCount).toBe(3);
    t.lastChild!.forEach((cell) => {
      expect(cell.attrs.props).toEqual(NEW_TABLE_CELL);
      expect(cell.attrs.colwidth).toEqual([200]);
      expect(cell.textContent).toBe('');
    });
    expect(after.selection.empty).toBe(true);
    expect(after.selection.$from.index(1)).toBe(2);
    expect(after.selection.$from.index(2)).toBe(0);
  });

  it('copies a merged cell\u2019s columns into the added row, one row high', () => {
    const merged = schema.nodes.table_cell!.create(
      { colspan: 2, rowspan: 1, colwidth: [100, 100], props: { background: '#ff0000' } },
      p(),
    );
    const t = schema.nodes.table!.create(null, [schema.nodes.table_row!.create(null, [merged])]);
    const state = run(at(doc(t, p()), 4), goToCell(1)).state;
    const row = state.doc.child(0).lastChild!;
    expect(row.childCount).toBe(1);
    expect(row.firstChild!.attrs).toMatchObject({
      colspan: 2,
      rowspan: 1,
      colwidth: [100, 100],
      props: { background: '#ff0000' },
    });
  });

  it('leaves Tab to the writing outside a table', () => {
    expect(run(at(doc(p('x')), 1), goToCell(1)).ran).toBe(false);
  });
});
