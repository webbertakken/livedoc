// A spreadsheet's imports through the api (docs/specs/029-sheets/imports.md): the answer a cell shows for each way
// the api answers, a picture IMAGE shows, and Allow Access.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_WORDS, type ImportAsk } from '@livedoc/sheets';
import { allowSheetImports, fetchSheetImage, fetchSheetImport } from './sheet-imports';

const scope = { documentId: 'd 1', ownerId: 'o', shareCode: 'CODE', tabId: 't1' };
const ask: ImportAsk = {
  key: 'k',
  request: { kind: 'data', url: 'https://a.example/x.csv' },
  fresh: true,
};
const reply = (body: unknown, status = 200) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSheetImport', () => {
  it('asks the workbook’s imports door, fresh and on the session’s tab, and reads the answer', async () => {
    const f = reply({ rows: [['1']] });
    vi.stubGlobal('fetch', f);
    expect(await fetchSheetImport(scope, ask)).toEqual({ rows: [['1']] });
    const url = new URL(f.mock.calls[0]![0], 'https://x.test');
    expect(url.pathname).toBe('/api/documents/d%201/workbook/imports');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      kind: 'data',
      url: 'https://a.example/x.csv',
      fresh: '1',
      tabId: 't1',
    });
  });

  it.each([
    [429, {}, 'later'],
    [403, { error: 'imports_not_allowed' }, { error: '#REF!', why: IMPORT_WORDS.blocked }],
    [404, { error: 'not_found' }, { error: '#N/A', why: IMPORT_WORDS.notFetched(ask.request.url) }],
    [500, 'not json', { error: '#N/A', why: IMPORT_WORDS.notFetched(ask.request.url) }],
  ])('reads a %s as %j', async (status, body, answer) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
      ),
    );
    expect(await fetchSheetImport(scope, ask)).toEqual(answer);
  });

  it('reads a failed request as not fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await fetchSheetImport(scope, ask)).toEqual({
      error: '#N/A',
      why: IMPORT_WORDS.notFetched(ask.request.url),
    });
  });
});

describe('allowSheetImports', () => {
  it('posts to the workbook’s door and answers the workbook', async () => {
    const body = { workbook: { format: 'ods', importsAllowed: true }, rev: 3 };
    const f = reply(body);
    vi.stubGlobal('fetch', f);
    expect(await allowSheetImports({ ...scope, tabId: null })).toEqual(body);
    expect(f.mock.calls[0]![0]).toMatch(/\/api\/documents\/d%201\/workbook\/imports$/);
    expect(f.mock.calls[0]![1]!.method).toBe('POST');
  });
});

describe('fetchSheetImage', () => {
  it('asks the imports door for a picture and keeps its bytes', async () => {
    const f = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', f);
    const blob = await fetchSheetImage(scope, 'https://a.example/a.png');
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(2);
    const url = new URL(f.mock.calls[0]![0], 'https://x.test');
    expect(url.pathname).toBe('/api/documents/d%201/workbook/imports');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      kind: 'image',
      url: 'https://a.example/a.png',
      tabId: 't1',
    });
  });

  it('is nothing for a refusal, an answer that is no picture, or no answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'image_refused' }, { status: 422 })),
    );
    expect(await fetchSheetImage(scope, 'https://a.example/a.png')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: '#N/A', why: 'off' })),
    );
    expect(await fetchSheetImage(scope, 'https://a.example/a.png')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await fetchSheetImage(scope, 'https://a.example/a.png')).toBeNull();
  });
});
