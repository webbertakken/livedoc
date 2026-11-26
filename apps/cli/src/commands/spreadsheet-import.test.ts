import { describe, expect, it } from 'vitest';
import { run } from '../main';
import { fakeIo, TOKEN, type FakeIo, type Route } from '../testing/fake-io';

// `spreadsheet import` (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet", D274): a file here
// opened as a new spreadsheet, its size checked before its bytes are read, the import report after the answer.

const HOST = 'https://docs.nu';
const made: { name: string; workbook: { format: string } }[] = [];

const host: Route = async (r, url) => {
  const path = url.pathname;
  if (path === '/api/capabilities')
    return Response.json({ apiBase: `${HOST}/api`, authEnabled: true, documentFormat: 2 });
  if (path === '/api/teams') return Response.json({ teams: [] });
  if (path === '/api/documents' && r.method === 'POST') {
    const body = (await r.json()) as (typeof made)[number];
    if (body.name === 'Refused') return Response.json({ error: 'documents_full' }, { status: 403 });
    made.push(body);
    return Response.json({});
  }
  return undefined;
};

// A CSV whose one cell is past what a cell holds, so its report has a line.
const CSV = new TextEncoder().encode(`name,cost\n${'x'.repeat(60_000)},1\n`);

async function cli(argv: string[], bytes: Record<string, Uint8Array> = {}) {
  const io: FakeIo = fakeIo({ env: { LIVEDOC_TOKEN: TOKEN }, routes: [host], bytes });
  const code = await run(argv, io);
  return { code, out: io.out(), err: io.err() };
}

describe('spreadsheet import', () => {
  it('opens the file as a spreadsheet in its format, then prints its report', async () => {
    const opened = await cli(['spreadsheet', 'import', 'Q3 budget.csv'], {
      '/work/Q3 budget.csv': CSV,
    });
    expect(opened.code).toBe(0);
    const [answer, ...report] = opened.out.trimEnd().split('\n');
    expect(answer).toMatch(
      /^\+ spreadsheet [0-9a-f]{8} "Q3 budget" · ods · Q3 budget · https:\/\/docs\.nu\/document\/[0-9a-f-]{36}$/,
    );
    expect(report).toEqual(['1 cell’s text is cut to 50,000 characters']);
    expect(made.at(-1)).toMatchObject({ name: 'Q3 budget', workbook: { format: 'ods' } });
    const named = await cli(['spreadsheet', 'import', '/data/m.csv', '--name', 'Models'], {
      '/data/m.csv': CSV,
    });
    expect(named.code).toBe(0);
    expect(made.at(-1)!.name).toBe('Models');
  });

  it('refuses a missing file, one too large, a damaged one and one the api refuses', async () => {
    const missing = await cli(['spreadsheet', 'import', 'none.xlsx']);
    expect(missing.code).not.toBe(0);
    expect(missing.err).toContain('No file none.xlsx.');
    const huge = await cli(['spreadsheet', 'import', 'huge.xlsx'], {
      // Only its size is read: a length past the budget stands in for the bytes.
      '/work/huge.xlsx': { length: 101 * 1024 * 1024 } as Uint8Array,
    });
    expect(huge.err).toContain('This file is too large to open.');
    const damaged = await cli(['spreadsheet', 'import', 'x.ods'], {
      '/work/x.ods': new Uint8Array([1]),
    });
    expect(damaged.err).toContain('This file is damaged and could not be opened.');
    const refused = await cli(['spreadsheet', 'import', 'Refused.csv'], {
      '/work/Refused.csv': CSV,
    });
    expect(refused.err).toContain('Nothing was made:');
  });
});
