import { describe, expect, it } from 'vitest';
import { Workbook } from '../engine/workbook';
import { renderFormula } from '../formula/stored';
import { makeSheets } from '../testing/book';
import { cellKey, type Sheet } from '../sheet';
import { sheetsFromFile, workbookFileOf, type WorkbookFile } from './workbook-file';

function seeded(n = 7): () => number {
  let x = n;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

describe('workbookFileOf', () => {
  // standard-mapping.md "Arrays in the file": a spill is written with its block, its other cells caching its values.
  it('gives a spilled formula its block and the block its values', () => {
    const sheets = makeSheets(
      {
        S: {
          A1: '=SEQUENCE(2, 2)',
          D1: '=SEQUENCE(1)',
          D3: '=SEQUENCE(2)',
          D4: 'x',
          E1: '=FILTER(D1:D3, D1:D3=1)',
          F1: '=SEQUENCE(2)',
        },
      },
      { rows: 5, cols: 7 },
    );
    const engine = new Workbook({ sheets, locale: 'en-GB' });
    const cells = workbookFileOf(engine, sheets).sheets[0]!.cells;
    expect(cells.filter((c) => c.r < 2 && c.c < 2)).toEqual([
      {
        r: 0,
        c: 0,
        formula: '=SEQUENCE(2, 2)',
        spans: { rows: 2, cols: 2 },
        value: { k: 'n', v: 1 },
      },
      { r: 0, c: 1, value: { k: 'n', v: 2 } },
      { r: 1, c: 0, value: { k: 'n', v: 3 } },
      { r: 1, c: 1, value: { k: 'n', v: 4 } },
    ]);
    // One value is no block; a blocked spill covers nothing.
    expect(cells.find((c) => c.r === 0 && c.c === 3)!.spans).toBeUndefined();
    expect(cells.find((c) => c.r === 2 && c.c === 3)!.spans).toBeUndefined();
    expect(cells.find((c) => c.r === 0 && c.c === 4)!.spans).toBeUndefined();
    expect(cells.find((c) => c.r === 0 && c.c === 5)!.spans).toEqual({ rows: 2, cols: 1 });
  });

  // standard-mapping.md "One model, two mappings": the file holds positions, formulas as typed and their values.
  it('holds each sheet in order with positions, formulas and the values they show', () => {
    const sheets = makeSheets(
      {
        Budget: { A1: '2', B1: '=A1*2', C1: 'rent', D1: 'TRUE', A2: '=1/0', B2: '=Costs!A1+1' },
        Costs: { A1: '40' },
      },
      { rows: 5, cols: 6 },
    );
    const engine = new Workbook({ sheets, locale: 'en-GB' });
    expect(workbookFileOf(engine, sheets)).toEqual({
      sheets: [
        {
          name: 'Budget',
          rows: 5,
          cols: 6,
          cells: [
            { r: 0, c: 0, value: { k: 'n', v: 2 } },
            { r: 0, c: 1, formula: '=A1*2', value: { k: 'n', v: 4 } },
            { r: 0, c: 2, value: { k: 's', v: 'rent' } },
            { r: 0, c: 3, value: { k: 'b', v: true } },
            { r: 1, c: 0, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
            { r: 1, c: 1, formula: '=Costs!A1+1', value: { k: 'n', v: 41 } },
          ],
        },
        { name: 'Costs', rows: 5, cols: 6, cells: [{ r: 0, c: 0, value: { k: 'n', v: 40 } }] },
      ],
    });
  });

  it('holds a spilled array whole, and no value for a formula or a spilled cell that shows empty', () => {
    const sheets = makeSheets({ S: { A1: '={1,2,C9}', B2: '=C9' } }, { rows: 10, cols: 4 });
    const file = workbookFileOf(new Workbook({ sheets, locale: 'en-GB' }), sheets);
    expect(file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, formula: '={1,2,C9}', spans: { rows: 1, cols: 3 }, value: { k: 'n', v: 1 } },
      { r: 0, c: 1, value: { k: 'n', v: 2 } },
      { r: 1, c: 1, formula: '=C9' },
    ]);
  });

  it('skips a format-only cell and a cell whose row is gone', () => {
    const [sheet] = makeSheets({ S: { A1: '1' } }, { rows: 2, cols: 2 }) as [Sheet];
    sheet.cells.set(cellKey(sheet.layout.rows[1]!, sheet.layout.cols[0]!), { format: { b: true } });
    sheet.cells.set(cellKey('gone', sheet.layout.cols[0]!), { input: { n: 3 } });
    const file = workbookFileOf(new Workbook({ sheets: [sheet], locale: 'en-GB' }), [sheet]);
    expect(file.sheets[0]!.cells).toEqual([{ r: 0, c: 0, value: { k: 'n', v: 1 } }]);
  });
});

describe('sheetsFromFile', () => {
  // standard-mapping.md "Arrays in the file": a block's other cells are cache, never inputs.
  it('skips the cells a block caches', () => {
    const made = sheetsFromFile(
      {
        sheets: [
          {
            name: 'S',
            rows: 2,
            cols: 2,
            cells: [
              { r: 0, c: 0, formula: '=SEQUENCE(2)', spans: { rows: 2, cols: 1 } },
              { r: 1, c: 0, value: { k: 'n', v: 2 } },
              { r: 1, c: 1, value: { k: 'n', v: 9 }, spans: { rows: 2, cols: 2 } },
              { r: 0, c: 1 },
            ],
          },
        ],
      },
      seeded(),
    );
    expect(made.sheets[0]!.cells.map((c) => c.i)).toEqual([
      { f: { t: 'SEQUENCE(2)', r: [] } },
      { n: 9 },
    ]);
  });

  const file: WorkbookFile = {
    sheets: [
      {
        name: 'Budget',
        rows: 3,
        cols: 3,
        cells: [
          { r: 0, c: 0, value: { k: 'n', v: 2 } },
          { r: 0, c: 1, formula: '=A1*2+Costs!A1', value: { k: 'n', v: 44 } },
          { r: 1, c: 0, value: { k: 's', v: 'rent' } },
          { r: 1, c: 1, value: { k: 'b', v: false } },
          { r: 2, c: 0, formula: '=SUM(', value: { k: 'n', v: 9 } },
          { r: 2, c: 1, value: { k: 'e', v: '#N/A' } },
        ],
      },
      { name: 'Costs', rows: 1, cols: 1, cells: [{ r: 0, c: 0, value: { k: 'n', v: 40 } }] },
    ],
  };

  // spreadsheet.md "Making a spreadsheet": a sheet opened from a file is at least a new sheet's 1,000 by 26.
  it('makes each sheet at least a new sheet grid, its cells by id and its formulas compiled', () => {
    const made = sheetsFromFile(file, seeded());
    const [budget, costs] = made.sheets;
    expect(budget!.title).toBe('Budget');
    expect(budget!.layout.rows).toHaveLength(1000);
    expect(budget!.layout.cols).toHaveLength(26);
    expect(costs!.id).not.toBe(budget!.id);
    const at = (r: number, c: number) =>
      budget!.cells.find((x) => x.r === budget!.layout.rows[r] && x.c === budget!.layout.cols[c])
        ?.i;
    expect(at(0, 0)).toEqual({ n: 2 });
    expect(at(1, 0)).toEqual({ s: 'rent' });
    expect(at(1, 1)).toEqual({ b: false });
    const formula = at(0, 1);
    if (!formula || !('f' in formula)) throw new Error('no formula');
    const handles = made.sheets.map((s) => ({ id: s.id, title: s.title, layout: s.layout }));
    const ctx = {
      own: handles[0]!,
      byTitle: (t: string) => handles.find((h) => h.title === t),
      byId: (id: string) => handles.find((h) => h.id === id),
    };
    expect(renderFormula(formula.f, ctx)).toBe('=A1*2+Costs!A1');
  });

  // standard-mapping.md "Formulas in the file's own syntax": an unreadable formula keeps its value, and says so.
  it('keeps the value of a formula it cannot read and names the loss', () => {
    const made = sheetsFromFile(file, seeded());
    const budget = made.sheets[0]!;
    const cell = budget.cells.find(
      (x) => x.r === budget.layout.rows[2] && x.c === budget.layout.cols[0],
    );
    expect(cell?.i).toEqual({ n: 9 });
    expect(made.losses).toEqual([{ k: 'formula_unread', sheet: 'Budget', r: 2, c: 0 }]);
  });

  it('drops a lone error value, which no input holds', () => {
    const budget = sheetsFromFile(file, seeded()).sheets[0]!;
    expect(
      budget.cells.some((x) => x.r === budget.layout.rows[2] && x.c === budget.layout.cols[1]),
    ).toBe(false);
  });

  // files-and-print.md "A file sent in parts": each sheet within the room the earlier ones left in the workbook.
  it('names a renamed sheet, a cut sheet, the sheets past the workbook and skips cells past the grid', () => {
    const made = sheetsFromFile(
      {
        sheets: [
          { name: 'A', rows: 1, cols: 1, cells: [] },
          {
            name: 'a',
            rows: 20_000,
            cols: 20_000,
            cells: [{ r: 15_000, c: 0, value: { k: 'n', v: 1 } }],
          },
          { name: '', rows: 1, cols: 1, cells: [] },
          { name: 'Gone', rows: 1, cols: 1, cells: [] },
        ],
      },
      seeded(),
    );
    expect(made.sheets.map((s) => s.title)).toEqual(['A', 'a 2', 'Sheet1']);
    expect(made.sheets.map((s) => [s.layout.rows.length, s.layout.cols.length])).toEqual([
      [1000, 26],
      [1092, 18_278],
      [554, 26],
    ]);
    expect(made.sheets[1]!.cells).toEqual([]);
    expect(made.losses).toEqual([
      { k: 'sheet_renamed', from: 'a', to: 'a 2' },
      { k: 'sheet_cut', sheet: 'a 2', rows: 1092, cols: 18_278 },
      { k: 'sheet_renamed', from: '', to: 'Sheet1' },
      { k: 'sheets_cut', kept: 3, had: 4 },
    ]);
  });

  it('uses Math.random when no source is given', () => {
    expect(
      sheetsFromFile({ sheets: [{ name: 'S', rows: 1, cols: 1, cells: [] }] }).sheets,
    ).toHaveLength(1);
  });
});
