// docs/specs/029-sheets/files-and-print.md "Import", "A file sent in parts": File › Open reads the file by its bytes,
// makes the spreadsheet in its format, sends the rest in parts with their progress, and leaves nothing half-made.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeXlsx } from '@livedoc/sheets/files';
import { ApiError, apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import { writeSheet } from '@/lib/api/sheets';
import { nameFromFile, openingNotice, openSpreadsheetFile } from './open-spreadsheet-file';

vi.mock('@/lib/api-client', async (real) => ({
  ...(await real<typeof import('@/lib/api-client')>()),
  apiCreateDocument: vi.fn(),
  apiDeleteDocument: vi.fn(),
}));
vi.mock('@/lib/api/sheets', () => ({ writeSheet: vi.fn() }));

afterEach(() => vi.clearAllMocks());

function xlsxFile(name: string, rows: number): File {
  const cells = Array.from({ length: rows }, (_, r) => ({
    r,
    c: 0,
    value: { k: 'n' as const, v: r },
  }));
  const bytes = writeXlsx({ sheets: [{ name: 'Data', rows, cols: 1, cells }] }, '').data;
  return new File([bytes], name);
}

describe('openSpreadsheetFile', () => {
  it('makes an XLSX spreadsheet, then sends its other rows and cells with their progress', async () => {
    vi.mocked(apiCreateDocument).mockResolvedValue({} as never);
    vi.mocked(writeSheet).mockResolvedValue({} as never);
    const progress: number[] = [];
    const opened = await openSpreadsheetFile('me', xlsxFile('Q3.xlsx', 1200), (s) =>
      progress.push(s),
    );
    expect(opened).toMatchObject({ ok: true, format: 'xlsx' });
    const created = vi.mocked(apiCreateDocument).mock.calls[0]![1];
    expect(created).toMatchObject({ name: 'Q3', workbook: { format: 'xlsx' } });
    expect(created.sheets![0]!.layout!.rows).toHaveLength(1000);
    expect(created.sheets![0]!.cells).toHaveLength(1000);
    expect(vi.mocked(writeSheet).mock.calls.map(([, , req]) => req.write.kind)).toEqual([
      'layout',
      'cells',
    ]);
    expect(vi.mocked(writeSheet).mock.calls.every(([, , req]) => req.unchecked)).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(progress[0]).toBeLessThan(1);
  });

  it('moves the half-made spreadsheet to the Bin when a part is refused', async () => {
    vi.mocked(apiCreateDocument).mockResolvedValue({} as never);
    vi.mocked(writeSheet).mockRejectedValue(new ApiError('sheet write', 413, 'workbook_full'));
    vi.mocked(apiDeleteDocument).mockRejectedValue(new Error('offline'));
    const opened = await openSpreadsheetFile('me', xlsxFile('Big.xlsx', 1200));
    expect(opened).toEqual({ ok: false, message: 'The file could not be opened. Try again.' });
    const id = vi.mocked(apiCreateDocument).mock.calls[0]![1].id;
    expect(apiDeleteDocument).toHaveBeenCalledWith('me', id);
  });

  it('refuses a file of no sheets, and opens one whose sheet is renamed', async () => {
    const none = new File([writeXlsx({ sheets: [] }, '').data], 'None.xlsx');
    expect(await openSpreadsheetFile('me', none)).toEqual({
      ok: false,
      message: 'This file holds no sheets to open.',
    });
    vi.mocked(apiCreateDocument).mockResolvedValue({} as never);
    const blank = new File(
      [writeXlsx({ sheets: [{ name: '', rows: 0, cols: 0, cells: [] }] }, '').data],
      'B.xlsx',
    );
    expect(await openSpreadsheetFile('me', blank)).toMatchObject({ ok: true });
    expect(vi.mocked(apiCreateDocument).mock.calls[0]![1].sheets![0]!.title).toBe('Sheet1');
  });

  it('bins nothing when the create itself is refused, and says why a file is refused', async () => {
    vi.mocked(apiCreateDocument).mockRejectedValue(new Error('down'));
    expect(await openSpreadsheetFile('me', xlsxFile('A.xlsx', 1))).toMatchObject({ ok: false });
    expect(apiDeleteDocument).not.toHaveBeenCalled();
    expect(await openSpreadsheetFile('me', new File([new Uint8Array([1, 2])], 'x.ods'))).toEqual({
      ok: false,
      message: 'This file is damaged and could not be opened.',
    });
  });
});

describe('the words', () => {
  it('names the spreadsheet after the file and says how far it is sent', () => {
    expect(nameFromFile('Q3 budget.xlsx')).toBe('Q3 budget');
    expect(nameFromFile('.xlsx')).toBe('Untitled spreadsheet');
    expect(openingNotice('Q3', 0.456)).toBe('Opening “Q3”… 45%');
    expect(openingNotice('Q3', 2)).toBe('Opening “Q3”… 100%');
  });
});
