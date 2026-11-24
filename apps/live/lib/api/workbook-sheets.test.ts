// docs/specs/029-sheets/sheet-store.md "Changing the workbook": the sheet bar's doors to the workbook routes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiAddWorkbookSheet,
  apiDeleteWorkbookSheet,
  apiMoveWorkbookSheet,
} from './workbook-sheets';

const scope = { documentId: 'd 1', ownerId: 'o', shareCode: 'CODE' };
const reply = (body: unknown, status = 200) =>
  vi.fn(async (_url: string, _init?: RequestInit) =>
    body === null ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('apiAddWorkbookSheet', () => {
  it('posts the add and answers the tab and sheet that landed', async () => {
    const answer = {
      tab: { id: 't2', name: 'Copy of Sheet1', orderIndex: 1 },
      sheet: { id: 's2' },
    };
    const f = reply(answer, 201);
    vi.stubGlobal('fetch', f);
    await expect(apiAddWorkbookSheet(scope, { copyOf: 'sheetOne1', tabId: 't2' })).resolves.toEqual(
      answer,
    );
    const [url, init] = f.mock.calls[0]!;
    expect(url).toMatch(/\/documents\/d%201\/workbook\/sheets$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ copyOf: 'sheetOne1', tabId: 't2' });
  });

  it('throws the refusal it is given', async () => {
    vi.stubGlobal('fetch', reply({ error: 'sheets_full' }, 413));
    await expect(apiAddWorkbookSheet(scope, {})).rejects.toMatchObject({ code: 'sheets_full' });
  });
});

describe('apiMoveWorkbookSheet', () => {
  it('posts the tab it goes after', async () => {
    const f = reply({ tabId: 't', sheetId: 's', orderIndex: 0 });
    vi.stubGlobal('fetch', f);
    await apiMoveWorkbookSheet(scope, 'sheet 2', '');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toMatch(/\/workbook\/sheets\/sheet%202\/move$/);
    expect(JSON.parse(init?.body as string)).toEqual({ after: '' });
  });
});

describe('apiDeleteWorkbookSheet', () => {
  it('deletes the sheet by its id', async () => {
    const f = reply(null, 204);
    vi.stubGlobal('fetch', f);
    await apiDeleteWorkbookSheet(scope, 'sheet 2');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toMatch(/\/workbook\/sheets\/sheet%202$/);
    expect(init?.method).toBe('DELETE');
  });

  it('throws the refusal it is given', async () => {
    vi.stubGlobal('fetch', reply({ error: 'sheet_last_visible' }, 409));
    await expect(apiDeleteWorkbookSheet(scope, 's')).rejects.toMatchObject({
      code: 'sheet_last_visible',
    });
  });
});
