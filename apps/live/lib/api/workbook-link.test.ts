// docs/specs/029-sheets/plan-links.md "Reading a sheet from another document": a dashboard's read of a spreadsheet's
// sheet, its version asked with, a refusal read as no access or too large, anything else thrown.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkbookLink } from './workbook-link';

const reply = (body: unknown, status = 200) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('fetchWorkbookLink', () => {
  it('asks for the sheet with the version held, and answers the read', async () => {
    const body = { version: 'v2', name: 'Money', locale: 'en-GB', sheets: [], sheet: null };
    const f = reply(body);
    vi.stubGlobal('fetch', f);
    await expect(fetchWorkbookLink('o', 'doc 1', 'sheet1', 'v1')).resolves.toEqual({
      kind: 'read',
      body,
    });
    expect(f.mock.calls[0]![0]).toMatch(
      /\/documents\/doc%201\/workbook\/link\?sheet=sheet1&since=v1$/,
    );
  });

  it('asks for the sheets alone with no sheet named, and no version with none held', async () => {
    const f = reply({ unchanged: true, version: 'v1' });
    vi.stubGlobal('fetch', f);
    await fetchWorkbookLink('o', 'd', '', null);
    expect(f.mock.calls[0]![0]).toMatch(/\/documents\/d\/workbook\/link$/);
  });

  it('reads a refusal as no access, or as too large', async () => {
    vi.stubGlobal('fetch', reply({ error: 'workbook_not_found' }, 404));
    await expect(fetchWorkbookLink('o', 'd', 's', null)).resolves.toEqual({ kind: 'denied' });
    vi.stubGlobal('fetch', reply({ error: 'forbidden' }, 403));
    await expect(fetchWorkbookLink('o', 'd', 's', null)).resolves.toEqual({ kind: 'denied' });
    // A trashed spreadsheet reads as one not there.
    vi.stubGlobal('fetch', reply({ error: 'gone' }, 410));
    await expect(fetchWorkbookLink('o', 'd', 's', null)).resolves.toEqual({ kind: 'denied' });
    vi.stubGlobal('fetch', reply({ error: 'link_too_large' }, 413));
    await expect(fetchWorkbookLink('o', 'd', 's', null)).resolves.toEqual({ kind: 'too-large' });
  });

  it('throws anything else', async () => {
    vi.stubGlobal('fetch', reply({ error: 'internal' }, 500));
    await expect(fetchWorkbookLink('o', 'd', 's', null)).rejects.toMatchObject({ status: 500 });
  });
});
