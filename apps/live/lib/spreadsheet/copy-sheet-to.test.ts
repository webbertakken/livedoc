// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": Copy To, into a new spreadsheet or one picked (D183),
// sent in parts as a file opened is, a refusal undoing the half-made copy.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CellMap,
  NOBODY,
  WorkbookRecord,
  emptyLayout,
  type Sheet,
  type SheetsCtx,
} from '@livedoc/sheets';
import { ApiError, apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import { apiAddWorkbookSheet, apiDeleteWorkbookSheet } from '@/lib/api/workbook-sheets';
import { track } from '@/lib/telemetry';
import { copySheetTo } from './copy-sheet-to';
import { sendFileParts } from './send-file-parts';

vi.mock('@/lib/api-client', async (real) => ({
  ...(await real<typeof import('@/lib/api-client')>()),
  apiCreateDocument: vi.fn(),
  apiDeleteDocument: vi.fn(async () => {}),
}));
vi.mock('@/lib/api/workbook-sheets', () => ({
  apiAddWorkbookSheet: vi.fn(),
  apiDeleteWorkbookSheet: vi.fn(async () => {}),
}));
vi.mock('./send-file-parts', () => ({ sendFileParts: vi.fn(async () => {}) }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let n = 7;
const layout = emptyLayout(() => (n = (n * 16807 + 11) % 2147483647) / 2147483647, 3, 3);
const cells = new CellMap();
cells.setCell(layout.rows[0]!, layout.cols[0]!, { n: 2 }, undefined);
cells.setCell(layout.rows[0]!, layout.cols[1]!, { s: 'rent' }, undefined);
const sheet: Sheet = {
  id: 'budget1',
  tabId: 'tab1',
  title: 'Budget',
  layout,
  cells,
  rev: 0,
  createdAt: 0,
  updatedAt: 0,
  updatedBy: NOBODY,
};
const own = { id: sheet.id, title: sheet.title, layout: sheet.layout };
const ctx: SheetsCtx = { own, byTitle: () => undefined, byId: () => own };
const record = WorkbookRecord.opened(
  WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
  'xlsx',
);
const source = { sheet, ctx, record };
const progress = vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('copySheetTo a new spreadsheet', () => {
  it('makes an untitled spreadsheet in this one’s format holding Copy of <name>, then its parts', async () => {
    const copied = await copySheetTo('owner', source, { kind: 'new' }, progress);
    expect(copied).toMatchObject({ ok: true, name: 'Untitled spreadsheet' });
    const [owner, body] = vi.mocked(apiCreateDocument).mock.calls[0]!;
    expect(owner).toBe('owner');
    expect(body).toMatchObject({
      name: 'Untitled spreadsheet',
      tabs: [{ name: 'Copy of Budget' }],
      sheets: [{ title: 'Copy of Budget' }],
      workbook: { format: 'xlsx' },
    });
    expect(body.sheets![0]!.cells).toHaveLength(2);
    expect(sendFileParts).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'CopySheet');
  });

  it('bins the half-made spreadsheet when a part is refused, and says a create refused', async () => {
    vi.mocked(sendFileParts).mockRejectedValueOnce(new ApiError('write', 413, 'workbook_full'));
    vi.mocked(apiDeleteDocument).mockRejectedValueOnce(new Error('offline'));
    const copied = await copySheetTo('owner', source, { kind: 'new' }, progress);
    expect(copied).toEqual({
      ok: false,
      message: 'This spreadsheet holds up to 1,000,000 rows and 20,000,000 cells',
    });
    expect(apiDeleteDocument).toHaveBeenCalled();
    vi.mocked(apiCreateDocument).mockRejectedValueOnce(new Error('network'));
    expect(await copySheetTo('owner', source, { kind: 'new' }, progress)).toEqual({
      ok: false,
      message: 'The sheet could not be copied. Try again.',
    });
    expect(apiDeleteDocument).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalled();
  });
});

describe('copySheetTo an existing spreadsheet', () => {
  const target = { kind: 'existing' as const, documentId: 'book2', name: 'Plans' };

  it('adds the sheet carried whole, named Copy of <name>, then its parts', async () => {
    expect(await copySheetTo('owner', source, target, progress)).toMatchObject({
      ok: true,
      documentId: 'book2',
      name: 'Plans',
    });
    const [scope, add] = vi.mocked(apiAddWorkbookSheet).mock.calls[0]!;
    expect(scope).toEqual({ ownerId: 'owner', documentId: 'book2', shareCode: null });
    expect(add).toMatchObject({
      name: 'Copy of Budget',
      seed: { layout: { rows: sheet.layout.rows } },
    });
  });

  it('takes the half-made copy back out when a part is refused, and says why', async () => {
    vi.mocked(sendFileParts).mockRejectedValueOnce(new ApiError('write', 400, 'write_invalid'));
    vi.mocked(apiDeleteWorkbookSheet).mockRejectedValueOnce(new Error('offline'));
    expect(await copySheetTo('owner', source, target, progress)).toMatchObject({ ok: false });
    expect(apiDeleteWorkbookSheet).toHaveBeenCalled();
    vi.mocked(apiAddWorkbookSheet).mockRejectedValueOnce(new ApiError('add', 413, 'sheets_full'));
    expect(await copySheetTo('owner', source, target, progress)).toEqual({
      ok: false,
      message: 'A spreadsheet holds up to 200 sheets',
    });
    expect(apiDeleteWorkbookSheet).toHaveBeenCalledTimes(1);
  });
});
