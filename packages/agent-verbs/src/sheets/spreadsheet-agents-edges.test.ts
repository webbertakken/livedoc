// The edges of agents in a spreadsheet (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet"):
// every refusal named before anything is made, a failed filling taking its new sheet tab away again, a design's charts
// made the sheet's own, and a spreadsheet made but not filled saying so.
import { describe, expect, it } from 'vitest';
import { emptySheet, sheetToJson, WorkbookRecord, type SheetJson } from '@livedoc/sheets';
import { DOC_A, fakeApi } from '../testing/fake-api';
import { seeded, sheetJson, sheetServer } from '../testing/sheets';
import { addSheet } from './add-sheet';
import { changeSheet } from './change-sheet';
import { CREATE_SPREADSHEET_SHEETS_MAX, createSpreadsheet } from './create-spreadsheet';
import { readSheet } from './read-sheet';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const LONG = 'x'.repeat(60_000);

// A spreadsheet of one sheet whose workbook door makes sheets from their seed; `refuse` refuses every write, and
// `deleteThrows` makes a delete fail on the wire.
function book(opts: { refuse?: string; deleteThrows?: boolean } = {}) {
  const server = sheetServer(
    DOC_A,
    [sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, [['a', 1]])],
    { workbook: WORKBOOK, ...(opts.refuse ? { refuse: opts.refuse } : {}) },
  );
  const deleted: string[] = [];
  const routes = Object.assign(server.routes, {
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
      return Response.json({ tab: { id: 'tab-new', name: body.name, orderIndex: 1 }, sheet: made });
    },
  });
  // A sheet's own door, for its delete.
  const api = fakeApi(
    new Proxy(routes, {
      has: () => true,
      get: (target, key) => {
        if (typeof key === 'string' && /\/workbook\/sheets\/[^/]+$/.test(key))
          return (r: Request) => {
            if (opts.deleteThrows) throw new Error('offline');
            deleted.push(new URL(r.url).pathname);
            return new Response(null, { status: 204 });
          };
        return (target as Record<string, unknown>)[key as string];
      },
    }),
  );
  return { api, server, deleted };
}

describe('add_sheet in a spreadsheet, at its edges', () => {
  it('names a new sheet with the next free SheetN when given none', async () => {
    const { api } = book();
    expect(await addSheet(api, DOC_A, {}, 'mcp', seeded())).toMatchObject({
      ok: true,
      title: 'Sheet2',
      filled: null,
    });
  });

  it('refuses a name that is no sheet name, an unknown sheet to go after, and an unreadable formula', async () => {
    const { api, server } = book();
    expect(await addSheet(api, DOC_A, { title: 'a/b' }, 'mcp')).toMatchObject({
      ok: false,
      code: 'sheet_name_invalid',
    });
    expect(await addSheet(api, DOC_A, { after: 'Nowhere' }, 'mcp')).toMatchObject({
      ok: false,
      code: 'sheet_not_found',
    });
    expect(await addSheet(api, DOC_A, { rows: [['=SUM(']] }, 'mcp')).toMatchObject({
      ok: false,
      code: 'formula_invalid',
    });
    expect(server.sheets).toHaveLength(1);
  });

  it('refuses first cells past the caps before the tab is made', async () => {
    const { api, server } = book();
    const result = await addSheet(api, DOC_A, { rows: [[LONG]] }, 'mcp');
    expect(result).toMatchObject({ ok: false, code: 'input_too_long' });
    expect(server.sheets).toHaveLength(1);
  });

  it('takes its new tab away again when its filling is refused, and says so even when the delete fails', async () => {
    const refused = book({ refuse: 'sheet_full' });
    const result = await addSheet(refused.api, DOC_A, { rows: [['a']] }, 'mcp', seeded());
    expect(result).toMatchObject({ ok: false, code: 'sheet_full' });
    expect(refused.deleted).toHaveLength(1);
    const offline = book({ refuse: 'sheet_full', deleteThrows: true });
    expect(await addSheet(offline.api, DOC_A, { rows: [['a']] }, 'mcp', seeded())).toMatchObject({
      ok: false,
      code: 'sheet_full',
    });
  });

  it("lays a design out with its charts as the sheet's own", async () => {
    const { api, server } = book();
    const result = await addSheet(
      api,
      DOC_A,
      {
        title: 'Sales',
        design: {
          heading: 'Sales',
          blocks: [
            {
              kind: 'table',
              head: ['Region', 'Amount'],
              rows: [
                ['North', 100],
                ['South', 250],
              ],
              chart: { type: 'pie' },
            },
            { kind: 'table', head: ['Q', 'N'], rows: [['1', 2]], chart: { type: 'column' } },
          ],
        },
      },
      'mcp',
      seeded(),
    );
    expect(result).toMatchObject({ ok: true, title: 'Sales' });
    const sales = server.sheets.find((s) => s.title === 'Sales')!;
    expect((sales.layout.objects ?? []).map((x) => x.type)).toEqual(['pie', 'column']);
    // And a design through change_sheet does the same.
    const blank = await addSheet(api, DOC_A, { title: 'Blank' }, 'mcp', seeded(3));
    expect(blank.ok).toBe(true);
    await changeSheet(
      api,
      DOC_A,
      {
        sheet: 'Blank',
        changes: [
          {
            op: 'design',
            design: {
              heading: 'B',
              blocks: [
                { kind: 'table', head: ['K', 'V'], rows: [['a', 1]], chart: { type: 'bar' } },
              ],
            },
          },
        ],
      },
      'mcp',
    );
    const read = await readSheet(api, DOC_A, { sheet: 'Blank' });
    expect(read.ok && read.charts!.map((c) => c.type)).toEqual(['bar']);
  });
});

describe('create_spreadsheet, at its edges', () => {
  const api = (create: unknown) => fakeApi({ '/documents': create });

  it('refuses more sheets than a spreadsheet holds, and first cells past the caps', async () => {
    const many = Array.from({ length: CREATE_SPREADSHEET_SHEETS_MAX + 1 }, (_, i) => ({
      name: `S${i}`,
    }));
    expect(await createSpreadsheet(api({}), { name: 'X', sheets: many }, 'mcp')).toMatchObject({
      ok: false,
      code: 'sheets_full',
    });
    expect(
      await createSpreadsheet(
        api({}),
        { name: 'X', sheets: [{ name: 'S', rows: [[LONG]] }] },
        'mcp',
      ),
    ).toMatchObject({ ok: false, code: 'input_too_long' });
  });

  it('answers the api refusing the making, and throws what is no refusal', async () => {
    const refused = api(() => Response.json({ error: 'folder_not_found' }, { status: 404 }));
    expect(
      await createSpreadsheet(refused, { name: 'X', folderId: 'nofolder' }, 'mcp'),
    ).toMatchObject({ ok: false, code: 'folder_not_found' });
    const broken = api(() => Response.json({ error: 'boom' }, { status: 500 }));
    await expect(createSpreadsheet(broken, { name: 'X' }, 'mcp')).rejects.toThrow();
  });

  it('says which sheets were filled when a filling is refused after the making, and throws a fault', async () => {
    const routes = (writes: () => Response) =>
      fakeApi(
        new Proxy(
          {},
          {
            has: () => true,
            get: () => (r: Request) =>
              new URL(r.url).pathname.endsWith('/documents')
                ? Response.json({ document: {} }, { status: 201 })
                : writes(),
          },
        ),
      );
    const sheets = [
      { name: 'A', rows: [['a']] },
      { name: 'B', rows: [['b']] },
    ];
    let n = 0;
    const second = routes(() =>
      n++ === 0
        ? Response.json({ applied: { kind: 'cells', cells: [] }, rev: 1, cells: [] })
        : Response.json({ error: 'sheet_busy' }, { status: 409 }),
    );
    const result = await createSpreadsheet(second, { name: 'X', sheets }, 'mcp', seeded());
    expect(result).toMatchObject({
      ok: true,
      sheets: [{ name: 'A' }],
      refusal: { code: 'sheet_busy' },
    });
    const fault = routes(() => Response.json({ error: 'boom' }, { status: 500 }));
    await expect(createSpreadsheet(fault, { name: 'X', sheets }, 'mcp')).rejects.toThrow();
  });
});
