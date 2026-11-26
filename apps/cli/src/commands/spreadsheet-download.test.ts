import { describe, expect, it } from 'vitest';
import { run } from '../main';
import { fakeIo, NOW, TOKEN, type FakeIo, type Route } from '../testing/fake-io';
import { attachmentName } from './spreadsheet-download';

// `spreadsheet download` (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet", D272): the file
// as the api writes it, to --to or under the name the api gives it.

const DOC = 'aaaa1111-0000-4000-8000-000000000002';
const HOST = 'https://docs.nu';
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const asked: string[] = [];

const host: Route = (_r, url) => {
  const path = url.pathname;
  if (path === '/api/capabilities')
    return Response.json({ apiBase: `${HOST}/api`, authEnabled: true, documentFormat: 2 });
  if (path === '/api/teams') return Response.json({ teams: [] });
  if (path === '/api/documents')
    return Response.json({ documents: [{ id: DOC, name: 'Budget', savedAt: NOW, ownerId: 'u' }] });
  if (path === `/api/documents/${DOC}`)
    return Response.json({
      document: {
        id: DOC,
        name: 'Budget',
        presentation: null,
        tabs: [
          { id: 'costs', name: 'Costs', orderIndex: 0 },
          { id: 'pareto', name: 'Pareto', orderIndex: 1 },
        ],
      },
    });
  if (path === `/api/documents/${DOC}/workbook/file`) {
    asked.push(url.search);
    const format = url.searchParams.get('format');
    if (format === 'ods') return Response.json({ error: 'file_type_unknown' }, { status: 400 });
    if (format === 'tsv') return Response.json({ error: 'workbook_not_found' }, { status: 404 });
    if (format === 'fods') return new Response('nope', { status: 404 });
    return new Response(ZIP, {
      headers: { 'Content-Disposition': 'attachment; filename="Budget.xlsx"' },
    });
  }
  return undefined;
};

async function cli(
  argv: string[],
  io: FakeIo = fakeIo({ env: { LIVEDOC_TOKEN: TOKEN }, routes: [host] }),
) {
  const code = await run(argv, io);
  return { code, io, out: io.out(), err: io.err() };
}

describe('spreadsheet download', () => {
  it('writes the file under the name the api gives it, or --to', async () => {
    const named = await cli(['spreadsheet', 'download', DOC]);
    expect(named.code).toBe(0);
    expect(named.out).toBe('Budget.xlsx  1 KB\n');
    expect([...named.io.byteMap.get('Budget.xlsx')!]).toEqual([...ZIP]);
    const to = await cli(['spreadsheet', 'download', DOC, '--format', 'xlsx', '--to', 'b.xlsx']);
    expect(to.io.byteMap.has('b.xlsx')).toBe(true);
    expect(asked.at(-1)).toBe('?format=xlsx');
  });

  it('names a sheet by its tab for csv, and refuses one it lacks', async () => {
    await cli(['spreadsheet', 'download', DOC, '--format', 'csv', '--sheet', 'pareto']);
    expect(asked.at(-1)).toBe('?format=csv&tab=pareto');
    const missing = await cli(['spreadsheet', 'download', DOC, '--format', 'csv', '--sheet', 'X']);
    expect(missing.code).not.toBe(0);
    expect(missing.err).toContain('No sheet "X". Sheets: "Costs", "Pareto".');
  });

  it('says what the api refused', async () => {
    const refused = await cli(['spreadsheet', 'download', DOC, '--format', 'ods']);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain('The api refused the download (file_type_unknown).');
    const bare = await cli(['spreadsheet', 'download', DOC, '--format', 'fods']);
    expect(bare.err).toContain('(http_404)');
    const none = await cli(['spreadsheet', 'download', DOC, '--format', 'tsv']);
    expect(none.err).toContain('"Budget" is no spreadsheet.');
  });
});

describe('attachmentName', () => {
  it('takes the header’s name, never a path, else the fallback', () => {
    expect(attachmentName('attachment; filename="a.ods"', 'x.ods')).toBe('a.ods');
    expect(attachmentName('attachment; filename="../a.ods"', 'x.ods')).toBe('x.ods');
    expect(attachmentName('attachment; filename=".a"', 'x.ods')).toBe('x.ods');
    expect(attachmentName(null, 'x.ods')).toBe('x.ods');
  });
});
