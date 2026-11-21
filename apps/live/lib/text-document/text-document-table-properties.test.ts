// docs/specs/034-text-documents/tables.md "Table properties": the panel shows what the cells it changes share, blank
// where they differ, and changes the selected cells (the caret's alone), their rows, their columns or the whole table.
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  setTableProperty,
  tablePropertiesAt,
  type TablePropertyChange,
} from './text-document-table-properties';

const LINE = { width: 1, dash: 'solid', color: '#000000', space: 0 };
const LINED = {
  borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
  padding: { top: 5, bottom: 5, left: 5, right: 5 },
};

const cell = (text: string, props: object = LINED, colwidth = [100]) =>
  schema.nodes.table_cell!.create(
    { colwidth, props },
    schema.nodes.paragraph!.create(null, schema.text(text)),
  );
const row = (cells: PmNode[], attrs: object | null = null) =>
  schema.nodes.table_row!.create(attrs, cells);
const doc = () =>
  schema.nodes.doc!.create(null, [
    schema.nodes.table!.create(null, [
      row(
        [
          cell('a1'),
          cell('b1', { ...LINED, background: '#ff0000', verticalAlign: 'middle' }, [200]),
        ],
        {
          height: 30,
        },
      ),
      row([cell('a2'), cell('b2', LINED, [200])]),
    ]),
    schema.nodes.paragraph!.create(null, schema.text('after')),
  ]);

const posOf = (d: PmNode, text: string, cells = false) => {
  let at = -1;
  d.descendants((node, pos) => {
    if (at >= 0) return false;
    if (cells && node.type.spec.tableRole === 'cell' && node.textContent === text) at = pos;
    if (!cells && node.isText && node.text === text) at = pos;
    return true;
  });
  return at;
};

const caretIn = (text: string) => {
  const state = EditorState.create({ doc: doc(), schema });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, posOf(state.doc, text) + 1)),
  );
};
const selecting = (from: string, to: string) => {
  const state = EditorState.create({ doc: doc(), schema });
  return state.apply(
    state.tr.setSelection(
      CellSelection.create(state.doc, posOf(state.doc, from, true), posOf(state.doc, to, true)),
    ),
  );
};

function apply(state: EditorState, change: TablePropertyChange) {
  let next = state;
  const ran = setTableProperty(change)(state, (tr) => {
    next = state.apply(tr);
  });
  return { ran, state: next };
}

const cellAttrs = (state: EditorState, text: string) =>
  state.doc.nodeAt(posOf(state.doc, text, true))!.attrs as {
    colwidth: number[];
    props: Record<string, unknown> | null;
  };

describe('tablePropertiesAt', () => {
  it('reads the caret\u2019s cell, its row and column, and the table', () => {
    expect(tablePropertiesAt(caretIn('b1'))).toEqual({
      rowHeight: 30,
      headerRows: 0,
      mostHeaderRows: 1,
      columnWidth: 200,
      verticalAlign: 'middle',
      align: 'start',
      indent: 0,
      borderColor: '#000000',
      borderWidth: 1,
      background: '#ff0000',
      padding: 5,
    });
  });

  it('is blank where the selected cells differ', () => {
    const shown = tablePropertiesAt(selecting('a1', 'b2'))!;
    expect(shown).toMatchObject({
      rowHeight: null,
      columnWidth: null,
      verticalAlign: null,
      background: null,
      borderWidth: 1,
      padding: 5,
    });
  });

  it('is nothing outside a table', () => {
    const state = EditorState.create({ doc: doc(), schema });
    const outside = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posOf(state.doc, 'after') + 1)),
    );
    expect(tablePropertiesAt(outside)).toBeNull();
    expect(apply(outside, { field: 'padding', value: 2 }).ran).toBe(false);
  });
});

describe('setTableProperty', () => {
  it('sets the caret\u2019s cell alone', () => {
    const { state } = apply(caretIn('a1'), { field: 'background', value: '#00ff00' });
    expect(cellAttrs(state, 'a1').props).toMatchObject({ background: '#00ff00' });
    expect(cellAttrs(state, 'a2').props).not.toHaveProperty('background');
    const cleared = apply(caretIn('b1'), { field: 'background', value: null }).state;
    expect(cellAttrs(cleared, 'b1').props).not.toHaveProperty('background');
  });

  it('sets every selected cell', () => {
    let state = apply(selecting('a1', 'b2'), { field: 'verticalAlign', value: 'bottom' }).state;
    for (const t of ['a1', 'b1', 'a2', 'b2'])
      expect(cellAttrs(state, t).props).toMatchObject({ verticalAlign: 'bottom' });
    state = apply(selecting('a1', 'a2'), { field: 'padding', value: 8 }).state;
    expect(cellAttrs(state, 'a2').props).toMatchObject({
      padding: { top: 8, bottom: 8, left: 8, right: 8 },
    });
    expect(cellAttrs(state, 'b2').props).toMatchObject({ padding: LINED.padding });
  });

  it('sets the border\u2019s colour and width on every side, and takes the lines away at 0', () => {
    let state = apply(caretIn('a1'), { field: 'borderWidth', value: 3 }).state;
    expect(cellAttrs(state, 'a1').props!.borders).toEqual({
      top: { ...LINE, width: 3 },
      bottom: { ...LINE, width: 3 },
      left: { ...LINE, width: 3 },
      right: { ...LINE, width: 3 },
    });
    state = apply(state, { field: 'borderColor', value: '#336699' }).state;
    expect((cellAttrs(state, 'a1').props!.borders as { top: object }).top).toEqual({
      ...LINE,
      width: 3,
      color: '#336699',
    });
    state = apply(state, { field: 'borderWidth', value: 0 }).state;
    expect(cellAttrs(state, 'a1').props).not.toHaveProperty('borders');
    // A colour given cells with no lines draws them 1 pt.
    state = apply(state, { field: 'borderColor', value: '#336699' }).state;
    expect((cellAttrs(state, 'a1').props!.borders as { left: object }).left).toEqual({
      ...LINE,
      color: '#336699',
    });
  });

  it('sets the rows\u2019 minimum height, 0 taking it away', () => {
    let state = apply(caretIn('a2'), { field: 'rowHeight', value: 40 }).state;
    expect(state.doc.firstChild!.child(1).attrs).toMatchObject({ height: 40, heightRule: null });
    expect(state.doc.firstChild!.child(0).attrs).toMatchObject({ height: 30 });
    state = apply(state, { field: 'rowHeight', value: 0 }).state;
    expect(state.doc.firstChild!.child(1).attrs.height).toBeNull();
  });

  it('sets the columns\u2019 width, at least 0.1 in, the others as they were', () => {
    let state = apply(caretIn('a1'), { field: 'columnWidth', value: 150 }).state;
    expect(cellAttrs(state, 'a2').colwidth).toEqual([150]);
    expect(cellAttrs(state, 'b2').colwidth).toEqual([200]);
    state = apply(state, { field: 'columnWidth', value: 1 }).state;
    expect(cellAttrs(state, 'a1').colwidth).toEqual([7.2]);
  });

  it('pins header rows over the whole table', () => {
    const state = apply(caretIn('b2'), { field: 'headerRows', value: 1 }).state;
    expect(tablePropertiesAt(state)!.headerRows).toBe(1);
    expect(apply(state, { field: 'headerRows', value: 2 }).ran).toBe(false);
  });

  it('aligns and indents the whole table', () => {
    let state = apply(caretIn('a1'), { field: 'align', value: 'center' }).state;
    expect(state.doc.firstChild!.attrs).toMatchObject({ align: 'center' });
    expect(tablePropertiesAt(state)!.align).toBe('center');
    state = apply(state, { field: 'align', value: 'start' }).state;
    expect(state.doc.firstChild!.attrs.align).toBeNull();
    state = apply(state, { field: 'indent', value: 36 }).state;
    expect(state.doc.firstChild!.attrs.indent).toBe(36);
    expect(tablePropertiesAt(state)!.indent).toBe(36);
  });
});
