// A spreadsheet's workbook doors (docs/specs/029-sheets/files-and-print.md "Converting", "Download"): the losses asked
// and the conversion sent to the api, or worked out in this browser for a spreadsheet in This Browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord } from '@livedoc/sheets';
import { isOfflineId } from '../offline/offline-store';
import { apiConvertWorkbook, apiDownloadWorkbook, apiWorkbookConversion } from './workbook';

vi.mock('../offline/offline-store', () => ({ isOfflineId: vi.fn(async () => false) }));
vi.mock('../offline/offline-workbook-file', () => ({
  offlineWorkbookFile: vi.fn(async () => ({ blob: new Blob(['x']), fileName: 'Here.ods' })),
}));
vi.mock('../offline/offline-workbook-conversion', () => ({
  offlineWorkbookConversion: vi.fn(async (_: string, to: string) => ({
    from: 'ods',
    to,
    losses: [],
  })),
  offlineConvertWorkbook: vi.fn(async () => ({ workbook: 'offline', rev: 0 })),
}));

const scope = { documentId: 'd 1', ownerId: 'o', shareCode: 'CODE' };
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const reply = (body: unknown, status = 200) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(isOfflineId).mockResolvedValue(false);
});

describe('apiDownloadWorkbook', () => {
  it('reads the file and the name the api gave it, in the format asked', async () => {
    const f = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('bytes', {
          headers: { 'Content-Disposition': 'attachment; filename="Q3.xlsx"' },
        }),
    );
    vi.stubGlobal('fetch', f);
    const { blob, fileName } = await apiDownloadWorkbook(scope, 'xlsx');
    expect(fileName).toBe('Q3.xlsx');
    expect(await blob.text()).toBe('bytes');
    expect(new URL(f.mock.calls[0]![0], 'https://x.test').searchParams.get('format')).toBe('xlsx');
  });

  it('names a file the api did not name after the format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bytes')),
    );
    expect((await apiDownloadWorkbook(scope, 'ods')).fileName).toBe('Untitled spreadsheet.ods');
  });

  it('writes the file in this browser for a spreadsheet in This Browser', async () => {
    vi.mocked(isOfflineId).mockResolvedValue(true);
    expect((await apiDownloadWorkbook(scope, 'ods')).fileName).toBe('Here.ods');
  });
});

describe('apiWorkbookConversion', () => {
  it('asks the conversion door what a file in the other format loses', async () => {
    const answer = { from: 'ods', to: 'xlsx', losses: [{ k: 'text_cut', count: 1 }] };
    const f = reply(answer);
    vi.stubGlobal('fetch', f);
    expect(await apiWorkbookConversion(scope, 'xlsx')).toEqual(answer);
    const url = new URL(f.mock.calls[0]![0], 'https://x.test');
    expect(url.pathname).toBe('/api/documents/d%201/workbook/conversion');
    expect(url.searchParams.get('to')).toBe('xlsx');
  });

  it('works it out in this browser for a spreadsheet in This Browser', async () => {
    vi.mocked(isOfflineId).mockResolvedValue(true);
    expect(await apiWorkbookConversion(scope, 'xlsx')).toEqual({
      from: 'ods',
      to: 'xlsx',
      losses: [],
    });
  });

  it('throws what the api refuses', async () => {
    vi.stubGlobal('fetch', reply({ error: 'file_type_unknown' }, 400));
    await expect(apiWorkbookConversion(scope, 'xlsx')).rejects.toMatchObject({ status: 400 });
  });
});

describe('apiConvertWorkbook', () => {
  it('posts the format to the conversion door and reads the record', async () => {
    const answer = { workbook: WorkbookRecord.withFormat(record, 'xlsx'), rev: 2 };
    const f = reply(answer);
    vi.stubGlobal('fetch', f);
    expect(await apiConvertWorkbook(scope, 'xlsx')).toEqual(answer);
    const [url, init] = f.mock.calls[0]!;
    expect(new URL(url, 'https://x.test').pathname).toBe(
      '/api/documents/d%201/workbook/conversion',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ format: 'xlsx' });
  });

  it('converts in this browser for a spreadsheet in This Browser', async () => {
    vi.mocked(isOfflineId).mockResolvedValue(true);
    expect(await apiConvertWorkbook(scope, 'xlsx')).toEqual({ workbook: 'offline', rev: 0 });
  });
});
