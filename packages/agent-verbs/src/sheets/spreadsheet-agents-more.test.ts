// More of agents in a spreadsheet (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet"): the
// sheet tab changes' words and refusals, every field read_sheet answers of a chart, a Plan chart's look, and the CLI's
// `spreadsheet new` and `sheet add --after`.
import { describe, expect, it } from 'vitest';
import {
  emptySheet,
  sheetFromJson,
  sheetToJson,
  Workbook,
  WorkbookRecord,
  type SheetChart,
  type SheetJson,
} from '@livedoc/sheets';
import { VerbRefusal } from '../define';
import { contextOf, DOC_A, fakeApi, library, tabsOfA } from '../testing/fake-api';
import { sheetJson, sheetServer } from '../testing/sheets';
import { spreadsheetNew } from '../verbs/spreadsheet';
import { sheetAdd } from '../verbs/sheet';
import { changeSheet } from './change-sheet';
import { chartsRead } from './sheet-chart-objects';
import { lookFields } from './sheet-charts';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

function book(move?: () => Response) {
  const server = sheetServer(
    DOC_A,
    [
      sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, [['a', 1]]),
      sheetJson({ id: 'sheet_notes1', tabId: 'tab-notes1', title: 'Notes' }),
    ],
    { workbook: WORKBOOK },
  );
  const api = fakeApi(
    Object.assign(server.routes, {
      ...library,
      ...tabsOfA,
      [`/documents/${DOC_A}/workbook/sheets/sheet_notes1/move`]:
        move ??
        (() => Response.json({ tabId: 'tab-notes1', sheetId: 'sheet_notes1', orderIndex: 0 })),
      [`/documents/${DOC_A}/workbook/sheets`]: async (r: Request) => {
        const body = (await r.json()) as {
          name: string;
          sheetId: string;
          seed: { layout: SheetJson['layout'] };
        };
        const made = sheetToJson(
          emptySheet({
            id: body.sheetId,
            tabId: 'tab-new',
            title: body.name,
            layout: body.seed.layout,
          }),
        );
        server.sheets.push(made);
        return Response.json({
          tab: { id: 'tab-new', name: body.name, orderIndex: 2 },
          sheet: made,
        });
      },
    }),
  );
  return { api, server };
}

const change = (api: ReturnType<typeof book>['api'], sheet: string, changes: unknown[]) =>
  changeSheet(api, DOC_A, { sheet, changes: changes as never }, 'mcp');

describe('a sheet tab’s changes, in words', () => {
  it('shows a hidden sheet, and says when there were no charts to clear', async () => {
    const { api } = book();
    const shown = await change(api, 'Notes', [
      { op: 'hide', hidden: false },
      { op: 'clear_charts' },
    ]);
    expect(shown.applied).toEqual(['shown', 'cleared the sheet’s charts (none there)']);
  });

  it('refuses a range that is none, a move after itself, and a move the room refuses', async () => {
    const { api } = book(() => Response.json({ error: 'sheet_not_found' }, { status: 404 }));
    expect((await change(api, 'Notes', [{ op: 'clear_charts', range: '??' }])).refusal?.code).toBe(
      'range_invalid',
    );
    expect((await change(api, 'Notes', [{ op: 'move', after: 'notes' }])).refusal?.code).toBe(
      'write_invalid',
    );
    expect((await change(api, 'Notes', [{ op: 'move', after: 'Models' }])).refusal?.code).toBe(
      'sheet_not_found',
    );
  });

  it('throws a fault of the room’s while moving', async () => {
    const { api } = book(() => Response.json({ error: 'boom' }, { status: 500 }));
    await expect(change(api, 'Notes', [{ op: 'move', after: null }])).rejects.toThrow();
  });
});

describe('a chart’s every option, through change_sheet', () => {
  it('keeps its columns, values and alt, clears a chart with no data, and names the charts a replace can take', async () => {
    const { api, server } = book();
    await change(api, 'Models', [
      {
        op: 'set',
        at: 'A1',
        rows: [
          ['k', 'v', 'w'],
          ['a', 1, 2],
        ],
      },
      {
        op: 'chart',
        type: 'column',
        range: 'A1:C2',
        columns: ['A', 'C'],
        values: true,
        alt: 'Values',
      },
      { op: 'chart', type: 'scatter', range: 'A1:C2', columns: ['B', 'C'], lines: ['w'], at: 'H9' },
    ]);
    const [chart] = server.sheets[0]!.layout.objects!;
    expect(chart).toMatchObject({
      values: true,
      alt: 'Values',
      cols: [server.sheets[0]!.layout.cols[0], server.sheets[0]!.layout.cols[2]],
    });
    const missing = await change(api, 'Models', [
      { op: 'chart', type: 'line', range: 'A1:C2', replace: 'nochart' },
    ]);
    expect(missing.refusal?.message).toContain(`Its charts: ${chart!.id}`);
    // Every cell it read deleted: no data, and no range for clear_charts to match.
    await change(api, 'Models', [{ op: 'delete_cols', cols: 'A:C' }]);
    expect(server.sheets[0]!.layout.objects![0]!.range).toBeUndefined();
    const cleared = await change(api, 'Models', [{ op: 'clear_charts', range: 'A1:Z9' }]);
    expect(cleared.applied).toEqual(['cleared the charts reading A1:Z9 (none there)']);
  });

  it('refuses a move on a Plan Sheet', async () => {
    const server = sheetServer(DOC_A, [
      sheetJson({ id: 'sheet_plan01', tabId: 't1', title: 'Costs' }),
    ]);
    const result = await changeSheet(
      fakeApi(server.routes),
      DOC_A,
      { sheet: 'Costs', changes: [{ op: 'move', after: null }] },
      'mcp',
    );
    expect(result.refusal?.code).toBe('not_spreadsheet');
  });
});

describe('a chart as read_sheet answers it', () => {
  it('answers every field it holds, its columns by letter, and no range once its cells went', () => {
    const json = sheetJson({ id: 'sheet_read01', tabId: 't', title: 'R' }, [
      ['x', 'y', 'z'],
      [1, 2, 3],
    ]);
    const { rows, cols } = json.layout;
    const full: SheetChart = {
      id: 'chart1',
      kind: 'chart',
      at: { r: rows[1]!, c: cols[4]!, dx: 3, dy: 4 },
      width: 300,
      height: 200,
      type: 'scatter',
      range: { r1: rows[0]!, c1: cols[0]!, r2: rows[1]!, c2: cols[2]! },
      cols: [cols[0]!, cols[2]!],
      legend: 'top',
      values: true,
      axis: false,
      title: 'T',
      xTitle: 'X',
      yTitle: 'Y',
      alt: 'A',
      // A look for a column the chart no longer reads names no line.
      series: { [cols[2]!]: { line: true }, [cols[1]!]: { color: '#112233' } },
    };
    const empty: SheetChart = {
      id: 'chart2',
      kind: 'chart',
      at: full.at,
      width: 300,
      height: 200,
      type: 'pie',
    };
    const sheet = sheetFromJson({ ...json, layout: { ...json.layout, objects: [full, empty] } });
    const wb = new Workbook({ sheets: [sheet], locale: 'en-GB' });
    expect(chartsRead(wb, sheet.id)).toEqual([
      {
        id: 'chart1',
        type: 'scatter',
        range: 'A1:C2',
        columns: ['A', 'C'],
        at: 'E2',
        width: 300,
        height: 200,
        title: 'T',
        xAxisTitle: 'X',
        yAxisTitle: 'Y',
        legend: 'top',
        values: true,
        axis: false,
        alt: 'A',
        lines: ['z'],
      },
      {
        id: 'chart2',
        type: 'pie',
        range: null,
        at: 'E2',
        width: 300,
        height: 200,
        legend: 'bottom',
        values: false,
        axis: true,
      },
    ]);
  });
});

describe('a Plan chart’s look', () => {
  it('sets only what is given: a legend place, one axis title, the axis off', () => {
    expect(lookFields(undefined)).toEqual({});
    expect(lookFields({ legend: 'top', yAxisTitle: 'EUR', axis: false })).toEqual({
      chartAxisTitles: { y: 'EUR' },
      chartLegendPosition: 'top',
      chartAxis: false,
    });
    expect(lookFields({ xAxisTitle: 'Month' })).toEqual({ chartAxisTitles: { x: 'Month' } });
    expect(lookFields({ legend: 'none' })).toEqual({ chartLegend: false });
  });
});

describe('the CLI', () => {
  it('makes a spreadsheet with its sheets named, the first from a CSV, and prints it', async () => {
    const posted: { tabs: { name: string }[] }[] = [];
    const writes: string[] = [];
    const api = fakeApi(
      new Proxy(
        {},
        {
          has: () => true,
          get: () => async (r: Request) => {
            if (new URL(r.url).pathname.endsWith('/documents')) {
              posted.push((await r.json()) as { tabs: { name: string }[] });
              return Response.json({ document: {} }, { status: 201 });
            }
            writes.push(new URL(r.url).pathname);
            return Response.json({ applied: { kind: 'cells', cells: [] }, rev: 1, cells: [] });
          },
        },
      ),
    );
    const ctx = contextOf(api, [], [], { readInput: async () => 'Model,Cost\nA,1' });
    const out = await spreadsheetNew.run!(
      ctx,
      spreadsheetNew.input.parse({ name: 'Model values', sheets: ['Models', 'Pareto'], csv: '-' }),
    );
    expect(posted[0]!.tabs.map((t) => t.name)).toEqual(['Models', 'Pareto']);
    expect(out.sheets.map((s) => [s.name, s.filled])).toEqual([
      ['Models', 'A1:B2'],
      ['Pareto', null],
    ]);
    expect(writes).toHaveLength(1);
    expect(spreadsheetNew.text!(out)[0]).toMatch(
      /^\+ spreadsheet [0-9a-f]{8} "Model values" · Models A1:B2, Pareto · https:\/\/docs\.nu\/document\//,
    );
    expect(spreadsheetNew.quiet!(out)).toEqual([out.documentId]);
    const blank = await spreadsheetNew.run!(ctx, spreadsheetNew.input.parse({ name: 'Blank' }));
    expect(blank.sheets.map((s) => s.name)).toEqual(['Sheet1']);
  });

  it('says a refused spreadsheet in its words, and a filling refused after the making as a notice', async () => {
    const ctx = contextOf(fakeApi({}));
    await expect(
      spreadsheetNew.run!(ctx, spreadsheetNew.input.parse({ name: 'X', sheets: ['A', 'a'] })),
    ).rejects.toBeInstanceOf(VerbRefusal);
    const refused = contextOf(
      fakeApi(
        new Proxy(
          {},
          {
            has: () => true,
            get: () => (r: Request) =>
              new URL(r.url).pathname.endsWith('/documents')
                ? Response.json({ document: {} }, { status: 201 })
                : Response.json({ error: 'sheet_busy' }, { status: 409 }),
          },
        ),
      ),
      [],
      [],
      { readInput: async () => 'a,b' },
    );
    const out = await spreadsheetNew.run!(
      refused,
      spreadsheetNew.input.parse({ name: 'X', csv: '-' }),
    );
    expect(out.sheets).toEqual([]);
    expect(refused.notices[0]).toMatch(/filling "Sheet1" was refused/);
  });

  it('adds a sheet after another with sheet add --after', async () => {
    const { api, server } = book();
    const ctx = contextOf(api);
    const out = await sheetAdd.run!(
      ctx,
      sheetAdd.input.parse({ doc: DOC_A, title: 'Pareto', after: 'Models' }),
    );
    expect(out).toMatchObject({ title: 'Pareto', elementId: null });
    expect(server.sheets.map((s) => s.title)).toContain('Pareto');
  });
});
