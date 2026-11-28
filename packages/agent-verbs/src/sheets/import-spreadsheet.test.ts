// `livedoc spreadsheet import` (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet", D274): the
// editor's File › Open flow over the agents' api: made in the agents' locale as create_spreadsheet makes one, its parts
// stored unchecked, its kept content sent, the import report in the editor's words, a refusal named, nothing half-made.
import { describe, expect, it } from 'vitest';
import { emptyLayout, emptySheet, WorkbookRecord } from '@livedoc/sheets';
import { writeWorkbook, writeXlsx } from '@livedoc/sheets/files';
import { fakeApi } from '../testing/fake-api';
import { fileTooLarge, importSpreadsheet, SPREADSHEET_FILE_BYTES_MAX } from './import-spreadsheet';

type Seen = { method: string; path: string; body: unknown; client: string | null };

// Every path answered by `answer`, each request seen.
function server(answer: (seen: Seen) => Response = () => Response.json({})) {
  const seen: Seen[] = [];
  const api = fakeApi(
    new Proxy(
      {},
      {
        has: () => true,
        get: () => async (r: Request) => {
          const text = await r.text();
          const one: Seen = {
            method: r.method,
            path: new URL(r.url).pathname.replace(/^\/api/, ''),
            // A picture's upload is its bytes, not JSON.
            body:
              text && r.headers.get('Content-Type')?.startsWith('image/') !== true
                ? JSON.parse(text)
                : null,
            client: r.headers.get('X-Livedoc-Client'),
          };
          seen.push(one);
          return answer(one);
        },
      },
    ),
  );
  return { api, seen };
}

const bytesOf = (data: Uint8Array) => new Uint8Array(data);

function xlsx(rows: number, kept = false) {
  const cells = Array.from({ length: rows }, (_, r) => ({
    r,
    c: 0,
    value: { k: 'n' as const, v: r },
  }));
  return bytesOf(
    writeXlsx(
      {
        sheets: [{ name: 'Models', rows, cols: 1, cells }],
        ...(kept
          ? {
              kept: {
                standard: 'ooxml' as const,
                items: [
                  { place: 'workbook' as const, xml: '<calcPr calcId="1"/>', ns: {}, at: {} },
                ],
                parts: [],
                relationships: [],
              },
            }
          : {}),
      },
      '',
    ).data,
  );
}

describe('importSpreadsheet pictures', () => {
  it('uploads a picture over the cells to the caller’s gallery and places it (D628)', async () => {
    let n = 7;
    const layout = emptyLayout(() => (n = (n * 16807) % 2147483647) / 2147483647, 2, 2);
    const at = { r: layout.rows[0]!, c: layout.cols[0]!, dx: 0, dy: 0 };
    const sheet = emptySheet({
      id: 'sheetOne1',
      tabId: 't1',
      title: 'Pics',
      layout: {
        ...layout,
        objects: [{ id: 'i1', kind: 'image', at, width: 30, height: 30, imageId: 'a' }],
      },
    });
    // A PNG's signature and header, 3 × 3 pixels: what a read takes a picture by.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0,
      0, 3, 8, 2,
    ]);
    const bytes = new Map([['a', { data: png, type: 'image/png' as const }]]);
    const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
    const data = writeWorkbook([sheet], record, 'Pics', 'xlsx', undefined, bytes).data;
    const { api, seen } = server((s) =>
      Response.json(s.path === '/images' ? { image: { id: 'g-up' }, deduped: false } : {}),
    );
    const opened = await importSpreadsheet(
      api,
      { fileName: 'Pics.xlsx', bytes: bytesOf(data) },
      'cli',
      () => {},
    );
    expect(opened).toMatchObject({ ok: true, report: [] });
    expect(seen.map((s) => `${s.method} ${s.path}`).slice(0, 2)).toEqual([
      'POST /images',
      'POST /documents',
    ]);
    expect(JSON.stringify(seen.map((s) => s.body))).toContain('"imageId":"g-up"');
  });
});

describe('importSpreadsheet', () => {
  it('makes the spreadsheet in the file’s format, then its parts and kept content, as the CLI', async () => {
    const { api, seen } = server();
    const opened = await importSpreadsheet(
      api,
      { fileName: 'Coding value.xlsx', bytes: xlsx(1200, true) },
      'cli',
    );
    expect(opened).toMatchObject({
      ok: true,
      name: 'Coding value',
      format: 'xlsx',
      imported: 'xlsx',
      cells: 1200,
      report: [],
    });
    const [create, ...rest] = seen;
    expect(create).toMatchObject({ method: 'POST', path: '/documents', client: 'cli' });
    const body = create!.body as {
      source: string;
      tabs: { kind: string; name: string }[];
      workbook: { format: string; settings: { locale: string; timeZone: string } };
    };
    expect(body.source).toBe('cli');
    expect(body.tabs).toEqual([expect.objectContaining({ kind: 'sheet', name: 'Models' })]);
    expect(body.workbook).toMatchObject({
      format: 'xlsx',
      settings: { locale: 'en-GB', timeZone: 'UTC' },
    });
    const writes = rest.filter((s) => s.path.endsWith('/writes'));
    expect(writes.map((w) => (w.body as { unchecked: boolean }).unchecked)).toEqual([true, true]);
    expect(rest.at(-1)!.path).toMatch(/\/workbook\/kept$/);
    if (!opened.ok) throw new Error('not opened');
    expect(opened.sheets).toEqual([
      { name: 'Models', sheetId: expect.any(String), tabId: expect.any(String) },
    ]);
  });

  it('takes the name given, and the report in the editor’s words', async () => {
    const { api } = server();
    const blank = bytesOf(
      writeXlsx({ sheets: [{ name: '', rows: 0, cols: 0, cells: [] }] }, '').data,
    );
    expect(
      await importSpreadsheet(api, { fileName: '.xlsx', bytes: blank, name: ' Budget ' }, 'mcp'),
    ).toMatchObject({
      ok: true,
      name: 'Budget',
      report: ['1 sheet name is changed to fit: “” becomes “Sheet1”'],
    });
    expect(
      await importSpreadsheet(
        api,
        { fileName: '.csv', bytes: bytesOf(new Uint8Array([65])) },
        'cli',
      ),
    ).toMatchObject({ ok: true, name: '.csv', imported: 'csv', format: 'ods' });
  });

  it('refuses a damaged file in the editor’s words, sending nothing', async () => {
    const { api, seen } = server();
    const logged: string[] = [];
    expect(
      await importSpreadsheet(
        api,
        { fileName: 'x.ods', bytes: bytesOf(new Uint8Array([1])) },
        'cli',
        (line) => logged.push(line),
      ),
    ).toEqual({
      ok: false,
      code: 'package_damaged',
      message: 'This file is damaged and could not be opened.',
    });
    expect(seen).toEqual([]);
    expect(logged).toEqual([expect.stringMatching(/^\[workbook\] refused \{/)]);
    expect(fileTooLarge()).toEqual({
      code: 'package_too_large',
      message: 'This file is too large to open.',
    });
    expect(SPREADSHEET_FILE_BYTES_MAX).toBeGreaterThan(1024 * 1024);
  });

  it('names the api’s refusal of a part, and bins the half-made spreadsheet', async () => {
    const { api, seen } = server((s) =>
      s.path.endsWith('/writes')
        ? Response.json({ error: 'workbook_full' }, { status: 413 })
        : s.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : Response.json({}),
    );
    const opened = await importSpreadsheet(api, { fileName: 'Big.xlsx', bytes: xlsx(1200) }, 'cli');
    expect(opened).toMatchObject({ ok: false, code: 'workbook_full' });
    expect(!opened.ok && opened.message).toMatch(/^Nothing was made: /);
    const { id } = seen[0]!.body as { id: string };
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE', path: `/documents/${id}` });
  });

  it('throws what is no refusal, and logs a bin that failed', async () => {
    const { api, seen } = server((s) =>
      s.path.endsWith('/writes')
        ? Response.json({ error: 'boom' }, { status: 500 })
        : s.method === 'DELETE'
          ? Response.json({ error: 'gone' }, { status: 404 })
          : Response.json({}),
    );
    await expect(
      importSpreadsheet(api, { fileName: 'Big.xlsx', bytes: xlsx(1200) }, 'cli'),
    ).rejects.toThrow();
    expect(seen.at(-1)!.method).toBe('DELETE');
  });
});

describe('spreadsheet import', () => {
  it('is run by the CLI, which reads the file, and prints its lines', async () => {
    const { spreadsheetImport } = await import('../verbs/spreadsheet');
    expect(spreadsheetImport.local).toBe(true);
    expect(spreadsheetImport.text!({ lines: ['+ spreadsheet a'] })).toEqual(['+ spreadsheet a']);
    expect(spreadsheetImport.input.parse({ file: 'a.xlsx' }).file).toBe('a.xlsx');
  });
});
