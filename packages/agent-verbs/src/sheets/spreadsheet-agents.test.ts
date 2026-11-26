// Agents in a spreadsheet (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet"; charts.md "The
// model"): change_sheet's chart lands as the sheet's own chart (titles, axis, lines by column, replace in place),
// clear_charts takes them off, move and hide work the sheet's tab, read_sheet and list_sheets answer the charts, a
// sheet is added through the workbook's door, and create_spreadsheet makes the document with its sheets filled.
import { describe, expect, it } from 'vitest';
import type { SheetChart, SheetJson, SheetWrite } from '@livedoc/sheets';
import { emptySheet, sheetToJson, WorkbookRecord } from '@livedoc/sheets';
import { DOC_A, fakeApi } from '../testing/fake-api';
import { seeded, sheetJson, sheetServer } from '../testing/sheets';
import { addSheet } from './add-sheet';
import { changeSheet } from './change-sheet';
import { createSpreadsheet } from './create-spreadsheet';
import { readSheet } from './read-sheet';
import { listSheets } from './sheet-listing';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
// Cost against coding index, a Pareto column with a gap, a tick box column.
const MODELS = [
  ['Model', 'Cost', 'Index', 'Pareto'],
  ['a', 1, 40, 40],
  ['b', 2, 50, null],
  ['c', 3, 55, 55],
];

function book(sheets: SheetJson[] = [], opts: { refuse?: string } = {}) {
  const all = sheets.length
    ? sheets
    : [
        sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, MODELS),
        sheetJson({ id: 'sheet_notes1', tabId: 'tab-notes1', title: 'Notes' }),
      ];
  const server = sheetServer(DOC_A, all, { workbook: WORKBOOK, ...opts });
  const moves: { sheetId: string; after: string }[] = [];
  const adds: Record<string, unknown>[] = [];
  const api = fakeApi(
    Object.assign(server.routes, {
      [`/documents/${DOC_A}`]: {
        document: {
          id: DOC_A,
          name: 'Model values',
          tabs: all.map((s, i) => ({ id: s.tabId, name: s.title, orderIndex: i, kind: 'sheet' })),
        },
      },
      [`/documents/${DOC_A}/workbook/sheets`]: async (r: Request) => {
        const body = (await r.json()) as {
          name: string;
          after?: string;
          sheetId: string;
          seed: { layout: SheetJson['layout'] };
        };
        adds.push(body);
        const made = sheetToJson(
          emptySheet({
            id: body.sheetId,
            tabId: 'tab-added1',
            title: body.name,
            layout: body.seed.layout,
          }),
        );
        server.sheets.push(made);
        return Response.json({
          tab: { id: made.tabId, name: made.title, orderIndex: 9 },
          sheet: made,
        });
      },
      [`/documents/${DOC_A}/workbook/sheets/sheet_notes1/move`]: async (r: Request) => {
        moves.push({ sheetId: 'sheet_notes1', ...((await r.json()) as { after: string }) });
        return Response.json({ tabId: 'tab-notes1', sheetId: 'sheet_notes1', orderIndex: 0 });
      },
    }),
  );
  return { api, server, moves, adds };
}

const objectsOf = (write: SheetWrite) =>
  write.kind === 'layout' ? write.changes.filter((c) => c.k === 'object') : [];

describe('a chart in a spreadsheet', () => {
  it("lands as the sheet's own chart: at its cell, with titles, the axis, and lines kept by their column", async () => {
    const { api, server } = book();
    const result = await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [
          {
            op: 'chart',
            type: 'scatter',
            range: 'B1:D4',
            at: 'F2',
            title: 'Value',
            xAxisTitle: 'Cost',
            yAxisTitle: 'Coding index',
            lines: ['Pareto'],
            legend: 'none',
          },
        ],
      },
      'mcp',
    );
    expect(result.refusal).toBeUndefined();
    expect(result.applied[0]).toMatch(
      /^charted B1:D4 as a scatter chart at F2 \(chart [a-z0-9]+\)$/,
    );
    const [set] = objectsOf(server.writes[0]!.write);
    const chart = (set as { object: SheetChart }).object;
    const { layout } = server.sheets[0]!;
    expect(chart).toMatchObject({
      kind: 'chart',
      type: 'scatter',
      at: { r: layout.rows[1], c: layout.cols[5], dx: 0, dy: 0 },
      width: 420,
      height: 280,
      title: 'Value',
      xTitle: 'Cost',
      yTitle: 'Coding index',
      legend: 'none',
      series: { [layout.cols[3]!]: { line: true } },
    });
    expect(chart.axis).toBeUndefined();
    // No canvas element is placed: the chart is the sheet's.
    expect(api.calls.some((c) => c.includes('/tabs/') && c.includes('/changesets'))).toBe(false);
  });

  it('reads back with its id, then is replaced in place, keeping its id, and the axis turned off', async () => {
    const { api } = book();
    await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [{ op: 'chart', type: 'scatter', range: 'B1:D4', lines: ['Pareto'] }],
      },
      'mcp',
    );
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    if (!read.ok) throw new Error(read.message);
    const [chart] = read.charts!;
    expect(chart).toMatchObject({
      type: 'scatter',
      range: 'B1:D4',
      at: 'F1',
      legend: 'bottom',
      axis: true,
      values: false,
      lines: ['Pareto'],
    });
    const replaced = await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [
          {
            op: 'chart',
            type: 'area',
            range: 'B1:C4',
            axis: false,
            stack: 'percent',
            replace: chart!.id,
          },
        ],
      },
      'mcp',
    );
    expect(replaced.refusal).toBeUndefined();
    const again = await readSheet(api, DOC_A, { sheet: 'Models' });
    if (!again.ok) throw new Error(again.message);
    expect(again.charts).toEqual([
      expect.objectContaining({
        id: chart!.id,
        type: 'area',
        range: 'B1:C4',
        axis: false,
        stack: 'percent',
      }),
    ]);
    expect(chart!.stack).toBeUndefined();
  });

  it('draws a line chart smooth, and reads it back so', async () => {
    const { api } = book();
    const made = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Models', changes: [{ op: 'chart', type: 'line', range: 'B1:C4', smooth: true }] },
      'mcp',
    );
    expect(made.refusal).toBeUndefined();
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    if (!read.ok) throw new Error(read.message);
    expect(read.charts![0]).toMatchObject({ type: 'line', smooth: true });
  });

  it('types a combo chart’s series and puts one on the right axis, by name, and reads them back', async () => {
    const { api } = book();
    const made = await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [
          {
            op: 'chart',
            type: 'combo',
            range: 'A1:D4',
            seriesTypes: { index: 'area' },
            rightAxis: ['Pareto'],
          },
        ],
      },
      'mcp',
    );
    expect(made.refusal).toBeUndefined();
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    if (!read.ok) throw new Error(read.message);
    expect(read.charts![0]).toMatchObject({
      type: 'combo',
      seriesTypes: { Cost: 'column', Index: 'area', Pareto: 'line' },
      rightAxis: ['Pareto'],
    });
  });

  it('refuses series types off a combo chart, a right axis off a line, area or combo, and an unknown series', async () => {
    const { api } = book();
    const tryChart = async (extra: Record<string, unknown>) =>
      (
        await changeSheet(
          api,
          DOC_A,
          { sheet: 'Models', changes: [{ op: 'chart', range: 'A1:D4', ...extra } as never] },
          'mcp',
        )
      ).refusal;
    expect(await tryChart({ type: 'line', seriesTypes: { Cost: 'area' } })).toMatchObject({
      code: 'write_invalid',
      message: expect.stringContaining('seriesTypes type a combo chart'),
    });
    expect(await tryChart({ type: 'column', rightAxis: ['Cost'] })).toMatchObject({
      message: expect.stringContaining('a column chart has one'),
    });
    expect(await tryChart({ type: 'combo', seriesTypes: { Price: 'line' } })).toMatchObject({
      message: expect.stringContaining('"Price" is no series of the chart'),
    });
    expect(await tryChart({ type: 'area', rightAxis: ['Index'] })).toBeUndefined();
  });

  it('refuses to replace a chart the sheet does not hold', async () => {
    const { api } = book();
    const result = await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [{ op: 'chart', type: 'line', range: 'B1:C4', replace: 'nochart' }],
      },
      'mcp',
    );
    expect(result.refusal?.code).toBe('chart_not_found');
  });

  it('clears the charts reading a range, or every one', async () => {
    const { api } = book();
    await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [
          { op: 'chart', type: 'column', range: 'B1:C4' },
          { op: 'chart', type: 'column', range: 'D1:D4', at: 'F20' },
          { op: 'clear_charts', range: 'D2' },
        ],
      },
      'mcp',
    );
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    expect(read.ok && read.charts!.map((c) => c.range)).toEqual(['B1:C4']);
    const all = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Models', changes: [{ op: 'clear_charts' }] },
      'mcp',
    );
    expect(all.applied).toEqual(['cleared the sheet’s charts (1)']);
  });

  it('clears the one chart its id names, keeping the rest', async () => {
    const { api } = book();
    await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Models',
        changes: [
          { op: 'chart', type: 'column', range: 'B1:C4' },
          { op: 'chart', type: 'column', range: 'B1:C4', at: 'F20' },
        ],
      },
      'mcp',
    );
    const before = await readSheet(api, DOC_A, { sheet: 'Models' });
    const [first, second] = before.ok ? before.charts!.map((c) => c.id) : [];
    const cleared = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Models', changes: [{ op: 'clear_charts', id: first! }] },
      'mcp',
    );
    expect(cleared.applied).toEqual([`cleared the chart ${first}`]);
    const after = await readSheet(api, DOC_A, { sheet: 'Models' });
    expect(after.ok && after.charts!.map((c) => c.id)).toEqual([second]);
  });

  it('refuses clearing a chart id the sheet does not hold, or an id with a range', async () => {
    const { api } = book();
    const none = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Models', changes: [{ op: 'clear_charts', id: 'nochart' }] },
      'mcp',
    );
    expect(none.refusal?.code).toBe('chart_not_found');
    expect(none.refusal?.message).toContain('Its charts: none');
    const both = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Models', changes: [{ op: 'clear_charts', id: 'x', range: 'A1' }] },
      'mcp',
    );
    expect(both.refusal?.code).toBe('write_invalid');
  });

  it('lists each sheet with whether it is hidden and how many charts it holds', async () => {
    const { api } = book();
    await changeSheet(
      api,
      DOC_A,
      { sheet: 'Models', changes: [{ op: 'chart', type: 'pie', range: 'A1:B4' }] },
      'mcp',
    );
    const { sheets } = await listSheets(api, DOC_A);
    expect(sheets.map((s) => [s.title, s.hidden, s.charts, s.elementId])).toEqual([
      ['Models', false, 1, null],
      ['Notes', false, 0, null],
    ]);
  });
});

describe("a spreadsheet's sheet tabs", () => {
  it('moves a sheet first or after another, and hides and shows it', async () => {
    const { api, moves, server } = book();
    const first = await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Notes',
        changes: [
          { op: 'move', after: null },
          { op: 'hide', hidden: true },
        ],
      },
      'mcp',
    );
    expect(first.applied).toEqual(['moved first', 'hidden']);
    expect(moves).toEqual([{ sheetId: 'sheet_notes1', after: '' }]);
    expect(server.writes.at(-1)!.write).toEqual({
      kind: 'layout',
      changes: [{ k: 'options', hidden: true }],
    });
    await changeSheet(
      api,
      DOC_A,
      { sheet: 'Notes', changes: [{ op: 'move', after: 'Models' }] },
      'mcp',
    );
    expect(moves.at(-1)).toEqual({ sheetId: 'sheet_notes1', after: 'tab-models' });
  });

  it('refuses a move after a sheet that is not there', async () => {
    const { api } = book();
    const result = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Notes', changes: [{ op: 'move', after: 'Nowhere' }] },
      'mcp',
    );
    expect(result.refusal?.code).toBe('sheet_not_found');
  });

  it('refuses move and hide on a Plan Sheet', async () => {
    const server = sheetServer(DOC_A, [
      sheetJson({ id: 'sheet_plan01', tabId: 't1', title: 'Costs' }),
    ]);
    const api = fakeApi(server.routes);
    const result = await changeSheet(
      api,
      DOC_A,
      { sheet: 'Costs', changes: [{ op: 'hide', hidden: true }] },
      'mcp',
    );
    expect(result.refusal?.code).toBe('not_spreadsheet');
  });

  it('adds a sheet through the workbook door after the sheet named, then fills it', async () => {
    const { api, adds, server } = book();
    const result = await addSheet(
      api,
      DOC_A,
      {
        title: 'Pareto',
        after: 'Models',
        rows: [
          ['Cost', 'Index'],
          [1, 40],
        ],
      },
      'mcp',
      seeded(),
    );
    expect(result).toMatchObject({ ok: true, title: 'Pareto', elementId: null, filled: 'A1:B2' });
    expect(adds).toEqual([
      expect.objectContaining({
        name: 'Pareto',
        after: 'tab-models',
        seed: expect.objectContaining({ cells: [] }),
      }),
    ]);
    expect(server.writes.at(-1)!.sheetId).toBe((adds[0] as { sheetId: string }).sheetId);
  });

  it('refuses a taken name or a tabId in a spreadsheet before anything is made', async () => {
    const { api, adds } = book();
    expect(await addSheet(api, DOC_A, { title: 'models' }, 'mcp')).toMatchObject({
      ok: false,
      code: 'sheet_name_taken',
    });
    expect(await addSheet(api, DOC_A, { tabId: 'tab-models' }, 'mcp')).toMatchObject({
      ok: false,
      code: 'write_invalid',
    });
    expect(adds).toEqual([]);
  });
});

describe('create_spreadsheet', () => {
  // The create route alone: the bodies it was sent.
  function made() {
    const posted: Record<string, unknown>[] = [];
    const api = fakeApi({
      '/documents': async (r: Request) => {
        posted.push((await r.json()) as Record<string, unknown>);
        return Response.json({ document: { id: 'x' } }, { status: 201 });
      },
    });
    return { api, posted };
  }

  it('makes the document in one request: a sheet tab each, in ODF, made by its agent', async () => {
    const { api, posted } = made();
    const result = await createSpreadsheet(
      api,
      { name: 'Model values', sheets: [{ name: 'Models' }, { name: 'Pareto' }] },
      'mcp',
      seeded(),
    );
    expect(result).toMatchObject({ ok: true, name: 'Model values' });
    const [body] = posted as {
      name: string;
      source: string;
      tabs: { id: string; name: string; kind: string }[];
      sheets: { tabId: string; title: string }[];
      workbook: { format: string };
    }[];
    expect(body!.source).toBe('mcp');
    expect(body!.tabs.map((t) => [t.name, t.kind])).toEqual([
      ['Models', 'sheet'],
      ['Pareto', 'sheet'],
    ]);
    expect(body!.sheets.map((s) => s.title)).toEqual(['Models', 'Pareto']);
    expect(body!.sheets.map((s) => s.tabId)).toEqual(body!.tabs.map((t) => t.id));
    expect(body!.workbook.format).toBe('ods');
  });

  it('makes one sheet, Sheet1, when none are named', async () => {
    const { api, posted } = made();
    await createSpreadsheet(api, { name: 'Blank' }, 'cli', seeded());
    expect((posted[0] as { tabs: { name: string }[] }).tabs.map((t) => t.name)).toEqual(['Sheet1']);
  });

  it('refuses a name two sheets share, or no name, before anything is made', async () => {
    const { api, posted } = made();
    expect(
      await createSpreadsheet(api, { name: 'X', sheets: [{ name: 'A' }, { name: 'a' }] }, 'mcp'),
    ).toMatchObject({ ok: false, code: 'sheet_name_taken' });
    expect(
      await createSpreadsheet(api, { name: 'X', sheets: [{ name: 'a/b' }] }, 'mcp'),
    ).toMatchObject({
      ok: false,
      code: 'sheet_name_invalid',
    });
    expect(await createSpreadsheet(api, { name: '  ' }, 'mcp')).toMatchObject({ ok: false });
    expect(posted).toEqual([]);
  });

  it('fills each sheet through its writes, a formula reading a sheet named after it', async () => {
    const sent: { path: string; write: SheetWrite }[] = [];
    // The create, then each write taken as it is sent (the sheets are blank, so the cells land as written).
    const routes = new Proxy(
      {},
      {
        has: () => true,
        get: () => async (r: Request) => {
          const path = new URL(r.url).pathname.replace(/^\/api/, '');
          if (path === '/documents') return Response.json({ document: {} }, { status: 201 });
          const { write } = (await r.json()) as { write: SheetWrite };
          sent.push({ path, write });
          return Response.json({ applied: write, rev: 1, cells: [] });
        },
      },
    );
    const filled = await createSpreadsheet(
      fakeApi(routes),
      {
        name: 'Book',
        sheets: [
          { name: 'Summary', rows: [['Total', '=SUM(Costs!B1:B2)']] },
          { name: 'Costs', csv: 'Rent,1200\nFood,300' },
        ],
      },
      'mcp',
      seeded(),
    );
    expect(filled).toMatchObject({
      ok: true,
      sheets: [
        { name: 'Summary', filled: 'A1:B1' },
        { name: 'Costs', filled: 'A1:B2' },
      ],
    });
    expect(sent.map((s) => s.write.kind)).toEqual(['cells', 'cells']);
  });

  it('refuses a formula it cannot read, naming the sheet and cell', async () => {
    const { api, posted } = made();
    const result = await createSpreadsheet(
      api,
      { name: 'Book', sheets: [{ name: 'S', rows: [['=SUM(']] }] },
      'mcp',
    );
    expect(result).toMatchObject({ ok: false, code: 'formula_invalid' });
    expect(result.ok === false && result.message).toContain('"S"!A1');
    expect(posted).toEqual([]);
  });
});
