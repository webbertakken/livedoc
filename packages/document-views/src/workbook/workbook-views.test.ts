// A spreadsheet's views (docs/specs/024-agents/document-views.md "A spreadsheet's views"): the workbook outline and
// the cells view, as an agent reads them.
import { describe, expect, it } from 'vitest';
import {
  AGENT_LOCALE,
  applySheetWrite,
  emptyLayout,
  emptySheet,
  NOBODY,
  Workbook,
  WorkbookRecord,
  writeRows,
  type AgentValue,
  type Sheet,
  type SheetChart,
} from '@livedoc/sheets';
import { workbookOutlineView, type WorkbookOutlineSheet } from './outline';
import { cellText, sheetCellsView, SHEET_VIEW_CHARS_MAX } from './cells';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function sheetOf(
  id: string,
  title: string,
  rows: AgentValue[][],
  size = { rows: 50, cols: 8 },
): Sheet {
  const rand = seeded(id.length * 31 + title.length);
  const blank = emptySheet({
    id,
    tabId: `tab-${id}`,
    title,
    layout: emptyLayout(rand, size.rows, size.cols),
  });
  if (!rows.length) return blank;
  const made = writeRows(
    new Workbook({ sheets: [blank], locale: AGENT_LOCALE }),
    id,
    'A1',
    rows,
    rand,
  );
  if (!made.ok) throw new Error(made.error);
  return applySheetWrite(blank, made.write, { now: 0, by: NOBODY }).sheet;
}

function outlineSheet(sheet: Sheet): WorkbookOutlineSheet {
  const usedRows = new Set<string>();
  const usedCols = new Set<string>();
  for (const key of sheet.cells.keys()) {
    const [r, c] = key.split(':') as [string, string];
    usedRows.add(r);
    usedCols.add(c);
  }
  return { ...sheet, cellCount: sheet.cells.size, usedRows, usedCols };
}

const book = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

describe('workbookOutlineView', () => {
  const models = sheetOf('s1', 'Models', [
    ['Model', 'Cost', 'Index'],
    ['Opus', 15, 60],
    ['Sonnet', 3, 50],
  ]);
  const { rows, cols } = models.layout;
  const chart: SheetChart = {
    kind: 'chart',
    id: 'chart_a1b2',
    type: 'scatter',
    range: { r1: rows[0]!, c1: cols[1]!, r2: rows[2]!, c2: cols[2]! },
    at: { r: rows[1]!, c: cols[7]!, dx: 0, dy: 0 },
    width: 420,
    height: 280,
    title: 'Cost against "index"',
    series: { [cols[2]!]: { line: true } },
  };
  const shaped: Sheet = {
    ...models,
    layout: {
      ...models.layout,
      frozenRows: 1,
      frozenCols: 2,
      filter: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[2]!, conds: {} },
      merges: [{ r1: rows[5]!, c1: cols[0]!, r2: rows[5]!, c2: cols[1]! }],
      names: [{ name: 'Costs', r1: rows[1]!, c1: cols[1]!, r2: rows[2]!, c2: cols[1]! }],
      rules: [{ kind: 'checkbox' } as never],
      formatRules: [{} as never, {} as never],
      bands: [{} as never],
      objects: [
        chart,
        { ...chart, id: 'chart_none', range: undefined, title: undefined, series: undefined },
      ],
    },
  };
  const notes = sheetOf('s2', 'Notes', []);
  const hidden: Sheet = { ...notes, layout: { ...notes.layout, hidden: true } };

  it('heads the spreadsheet and lists its sheets in tab order, the asked tab marked, with their parts', () => {
    const view = workbookOutlineView({
      name: 'Model costs',
      workbook: book,
      sheets: [outlineSheet(shaped), outlineSheet(hidden)],
      current: 'tab-s1',
    });
    expect(view.text.split('\n')).toEqual([
      'spreadsheet "Model costs" · ods · 2 sheets · en-GB · UTC',
      'sheet "Models" ◂ · A1:C3 · 9 cells · frozen 1 row, 2 columns · filter A1:C3 · 1 merge',
      '  names Costs=B2:B3',
      '  rules 1 validation, 2 format',
      '  bands 1',
      '  chart chart_a1b2 scatter B1:C3 at H2 "Cost against \\"index\\"" lines=C',
      '  chart chart_none scatter no data at H2',
      'sheet "Notes" · hidden · empty',
    ]);
    expect(view.json.sheets[1]).toMatchObject({
      title: 'Notes',
      hidden: true,
      used: null,
      current: false,
    });
    expect(view.json.spreadsheet).toEqual({
      name: 'Model costs',
      format: 'ods',
      locale: 'en-GB',
      timeZone: 'UTC',
    });
    expect(view.fit.state).toBe('full');
  });

  it('says a named range whose cells are gone reads #REF!, and frozen columns alone', () => {
    const lost: Sheet = {
      ...models,
      layout: {
        ...models.layout,
        frozenCols: 1,
        names: [{ name: 'Gone range', r1: 'nope', c1: cols[0]!, r2: 'nope', c2: cols[0]! }],
      },
    };
    const text = workbookOutlineView({
      name: 'B',
      workbook: book,
      sheets: [outlineSheet(lost)],
      current: 'x',
    }).text;
    expect(text).toContain('sheet "Models" · A1:C3 · 9 cells · frozen 1 column');
    expect(text).toContain('  names "Gone range"=#REF!');
  });

  // pivot-tables.md "The model": a pivot table's line, by its source, anchor and fields' columns.
  it('lists pivot tables by source, anchor and fields, another sheet’s source by its title', () => {
    const pivots: Sheet = {
      ...hidden,
      layout: {
        ...hidden.layout,
        objects: [
          {
            kind: 'pivot',
            id: 'pivot01',
            at: { r: hidden.layout.rows[0]!, c: hidden.layout.cols[0]! },
            source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[2]!, s: models.id },
            rows: [{ col: cols[0]! }],
            columns: [{ col: cols[1]! }],
            values: [
              { col: cols[2]!, summary: 'SUM' },
              { formula: '=Cost*2', summary: 'SUM', name: 'Double' },
              { col: 'gone', summary: 'COUNTA' },
            ],
          },
          {
            kind: 'pivot',
            id: 'pivot02',
            at: { r: 'gone', c: hidden.layout.cols[0]! },
            source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[0]!, st: 'models' },
          },
          {
            kind: 'pivot',
            id: 'pivot03',
            at: { r: hidden.layout.rows[1]!, c: hidden.layout.cols[1]! },
            source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[0]!, st: 'Gone' },
          },
          {
            kind: 'pivot',
            id: 'pivot04',
            at: { r: hidden.layout.rows[1]!, c: hidden.layout.cols[2]! },
            source: {
              r1: hidden.layout.rows[0]!,
              c1: hidden.layout.cols[0]!,
              r2: hidden.layout.rows[1]!,
              c2: hidden.layout.cols[0]!,
            },
          },
        ],
      },
    };
    const view = workbookOutlineView({
      name: 'P',
      workbook: book,
      sheets: [outlineSheet(models), outlineSheet(pivots)],
      current: 'x',
    });
    expect(view.text.split('\n').slice(-4)).toEqual([
      '  pivot pivot01 "Models"!A1:C3 at A1 rows=A cols=B values=SUM(C),Double,COUNTA(?)',
      '  pivot pivot02 "Models"!A1:A3 at #REF!',
      '  pivot pivot03 no data at B2',
      '  pivot pivot04 A1:A2 at C2',
    ]);
  });

  // inserted-objects.md "Agents": an image over cells' line, by its id, cell, size and alt text.
  it('lists images over cells by cell and size, with their alt text', () => {
    const pictured: Sheet = {
      ...hidden,
      layout: {
        ...hidden.layout,
        objects: [
          {
            kind: 'image',
            id: 'img01',
            at: { r: hidden.layout.rows[1]!, c: hidden.layout.cols[2]!, dx: 3, dy: 0 },
            width: 120,
            height: 80,
            imageId: 'g-1',
            alt: 'Logo',
          },
          {
            kind: 'image',
            id: 'img02',
            at: { r: hidden.layout.rows[0]!, c: hidden.layout.cols[0]!, dx: 0, dy: 0 },
            width: 16,
            height: 16,
            imageId: 'g-2',
          },
        ],
      },
    };
    const view = workbookOutlineView({
      name: 'P',
      workbook: book,
      sheets: [outlineSheet(pictured)],
      current: 'x',
    });
    expect(view.text.split('\n').slice(-2)).toEqual([
      '  image img01 at C2 120x80 "Logo"',
      '  image img02 at A1 16x16',
    ]);
    expect(view.json.sheets[0]!.images).toEqual([
      { id: 'img01', at: 'C2', width: 120, height: 80, alt: 'Logo' },
      { id: 'img02', at: 'A1', width: 16, height: 16 },
    ]);
  });

  // inserted-objects.md "Images in a cell": a cell's picture's line, by its cell and alt text, row by row.
  it('lists cells’ pictures after the images over cells, row by row, leaving out gone cells', () => {
    const { rows, cols } = hidden.layout;
    const view = workbookOutlineView({
      name: 'P',
      workbook: book,
      sheets: [
        {
          ...outlineSheet(hidden),
          cellPictures: [
            { r: rows[1]!, c: cols[0]! },
            { r: rows[0]!, c: cols[1]!, alt: 'A cat' },
            { r: rows[0]!, c: cols[0]! },
            { r: 'gone', c: cols[0]! },
            { r: rows[0]!, c: 'gone' },
          ],
        },
      ],
      current: 'x',
    });
    expect(view.text.split('\n').slice(-3)).toEqual([
      '  image in A1',
      '  image in B1 "A cat"',
      '  image in A2',
    ]);
    expect(view.json.sheets[0]!.images).toEqual([
      { at: 'A1', inCell: true },
      { at: 'B1', alt: 'A cat', inCell: true },
      { at: 'A2', inCell: true },
    ]);
  });

  it('ignores used ids no longer in the layout', () => {
    const sheet = {
      ...outlineSheet(notes),
      usedRows: new Set(['gone']),
      usedCols: new Set(['gone']),
    };
    expect(
      workbookOutlineView({ name: 'B', workbook: book, sheets: [sheet], current: 'x' }).text,
    ).toContain('sheet "Notes" · empty');
  });

  it('keeps whole lines to a budget and says what it left out', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      outlineSheet(sheetOf(`m${i}`, `Sheet ${i}`, [[i]])),
    );
    const view = workbookOutlineView(
      { name: 'Big', workbook: book, sheets: many, current: 'x' },
      { budget: 60, door: 'mcp' },
    );
    expect(view.fit.state).toBe('lines-dropped');
    expect(view.text.split('\n').at(-1)).toMatch(/sheet lines/);
  });
});

describe('sheetCellsView', () => {
  const costs = sheetOf('c1', 'Costs', [
    ['Model', 'Cost', 'Total'],
    ['Opus | big', 15, '=B2*4'],
    ['Line\nbreak', true, '=IF(A2="x|y",1,"none")'],
  ]);
  const formatted: Sheet = (() => {
    const key = `${costs.layout.rows[1]}:${costs.layout.cols[1]}`;
    const cell = costs.cells.get(key)!;
    const cells = new Map(costs.cells);
    cells.set(key, { ...cell, format: { nf: 'currency', dp: 2, cur: '$' } });
    return { ...costs, cells } as Sheet;
  })();
  const wb = new Workbook({ sheets: [formatted], locale: AGENT_LOCALE });

  it('prints a row a line, each cell its address, input and what a formula shows', () => {
    const view = sheetCellsView({ wb, sheetId: 'c1', title: 'Costs' });
    if (!view.ok) throw new Error(view.message);
    const lines = view.text.split('\n');
    expect(lines[0]).toBe('sheet "Costs" · cells A1:C3 of A1:C3');
    expect(lines[1]).toBe('1 | A1 "Model" | B1 "Cost" | C1 "Total"');
    expect(lines[2]).toMatch(/^2 \| A2 "Opus \| big" \| B2 15 → "\$15\.00" \| C2 =B2\*4 → 60$/);
    expect(lines[3]).toBe('3 | A3 "Line\\nbreak" | B3 TRUE | C3 =IF(A2="x\\|y",1,"none") → "none"');
    expect(view.json.rows).toHaveLength(3);
    expect(view.json.next).toBeNull();
  });

  it('reads a named range, skipping empty rows, and refuses a range that is none', () => {
    const view = sheetCellsView({ wb, sheetId: 'c1', title: 'Costs', range: 'B2:B9' });
    if (!view.ok) throw new Error(view.message);
    expect(view.text.split('\n')).toEqual([
      'sheet "Costs" · cells B2:B9 of A1:C3',
      '2 | B2 15 → "$15.00"',
      '3 | B3 TRUE',
    ]);
    expect(sheetCellsView({ wb, sheetId: 'c1', title: 'Costs', range: 'nonsense' })).toEqual({
      ok: false,
      message: 'range takes an A1 cell or range, like A1:D20: "nonsense"',
    });
  });

  it('adds a cell’s own link, a range of the workbook by name (inserted-objects.md "Links, agents")', () => {
    const at = (r: number, c: number) => `${costs.layout.rows[r]}:${costs.layout.cols[c]}`;
    const cells = new Map(formatted.cells);
    cells.set(at(0, 0), { ...cells.get(at(0, 0))!, format: { ln: 'https://docs.nu/' } });
    cells.set(at(0, 1), { ...cells.get(at(0, 1))!, format: { ln: '#gid=c1&range=B2' } });
    const linked = new Workbook({
      sheets: [{ ...formatted, cells } as Sheet],
      locale: AGENT_LOCALE,
    });
    const view = sheetCellsView({ wb: linked, sheetId: 'c1', title: 'Costs', range: 'A1:B1' });
    expect(view.ok && view.text.split('\n')[1]).toBe(
      '1 | A1 "Model" ↗ "https://docs.nu/" | B1 "Cost" ↗ "Costs!B2"',
    );
    expect(view.ok && view.json.rows[0]!.cells[0]!.link).toBe('https://docs.nu/');
  });

  it('says an empty sheet is one', () => {
    const empty = new Workbook({ sheets: [sheetOf('e1', 'Empty', [])], locale: AGENT_LOCALE });
    const view = sheetCellsView({ wb: empty, sheetId: 'e1', title: 'Empty' });
    expect(view.ok && view.text).toBe('sheet "Empty" · cells A1 of an empty sheet');
  });

  it('stops at the cells one read answers and says where to read on', () => {
    const tall = sheetOf(
      't1',
      'Tall',
      Array.from({ length: 2_600 }, (_, i) => [i, i * 2]),
      { rows: 2_700, cols: 2 },
    );
    const view = sheetCellsView({
      wb: new Workbook({ sheets: [tall], locale: AGENT_LOCALE }),
      sheetId: 't1',
      title: 'Tall',
    });
    if (!view.ok) throw new Error(view.message);
    expect(view.json.rows).toHaveLength(2_500);
    expect(view.json.next).toBe('A2501:B2600');
    expect(view.text.split('\n').at(-1)).toBe('… read on with range A2501:B2600');
  });

  it('stops on a whole row at the most characters one view prints', () => {
    const long = 'x'.repeat(4_000);
    const wide = sheetOf(
      'w1',
      'Wide',
      Array.from({ length: 40 }, () => [long]),
      { rows: 60, cols: 2 },
    );
    const view = sheetCellsView({
      wb: new Workbook({ sheets: [wide], locale: AGENT_LOCALE }),
      sheetId: 'w1',
      title: 'Wide',
      range: 'A1:A50',
    });
    if (!view.ok) throw new Error(view.message);
    expect(view.json.rows.length).toBeLessThan(40);
    expect(view.text.length).toBeLessThan(SHEET_VIEW_CHARS_MAX + 200);
    expect(view.json.next).toBe(`A${view.json.rows.length + 1}:A50`);
  });

  it('words each kind of cell', () => {
    expect(cellText({ at: 'A1', input: '', value: 3, display: '3' })).toBe('A1 → 3');
    expect(cellText({ at: 'A1', input: '0.5', value: 0.5, display: '50%' })).toBe('A1 0.5 → "50%"');
    expect(cellText({ at: 'A1', input: "'12", value: '12', display: '12' })).toBe(
      'A1 "\'12" → "12"',
    );
    expect(cellText({ at: 'A1', input: '=A2', value: '#REF!', display: '#REF!' })).toBe(
      'A1 =A2 → "#REF!"',
    );
  });
});
