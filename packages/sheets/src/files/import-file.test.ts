// docs/specs/029-sheets/files-and-print.md "Import", "A file sent in parts", "The import report", "Import security";
// sheet-store.md "Built for agents in a spreadsheet" (D274): the one flow File › Open and `livedoc spreadsheet import`
// share reads a file by its bytes, makes the spreadsheet in its format, sends the rest in parts, keeps what the model
// does not hold, and leaves nothing half-made.
import { PACKAGE_MAX_BYTES } from '@livedoc/office-packages';
import { describe, expect, it, vi } from 'vitest';
import type { SheetWrite } from '../store';
import { WorkbookRecord } from '../workbook-record';
import { fileOpenRefusalWords, importReportLine } from './import-report-copy';
import {
  importSpreadsheetFile,
  nameFromFile,
  type ImportedSpreadsheet,
  type SpreadsheetFile,
  type SpreadsheetFilePort,
} from './import-file';
import type { KeptContent, StoredAt } from './kept-content';
import { writeXlsx } from './xlsx-write';
import { solidPng } from '@livedoc/office-packages/testing';
import { emptyLayout, emptySheet } from '../sheet';
import { writeWorkbook } from './write-workbook';

const made = () => WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

type Fake = SpreadsheetFilePort & {
  created: ImportedSpreadsheet[];
  writes: { sheetId: string; write: SheetWrite }[];
  kept: KeptContent<StoredAt>[];
  binned: string[];
  events: string[];
};

function fakePort(overrides: Partial<SpreadsheetFilePort> = {}): Fake {
  const fake: Fake = {
    created: [],
    writes: [],
    kept: [],
    binned: [],
    events: [],
    create: async (m) => void fake.created.push(m),
    write: async (sheetId, write) => void fake.writes.push({ sheetId, write }),
    keep: async (k) => {
      fake.kept.push(k);
      return 0;
    },
    bin: async (id) => void fake.binned.push(id),
    storePicture: async () => ({ ok: true, imageId: 'g-stored' }),
    log: (event) => void fake.events.push(event),
  };
  return Object.assign(fake, overrides);
}

const bytesOf = (data: Uint8Array) => new Uint8Array(data);

function xlsx(rows: number, name = 'Q3.xlsx'): SpreadsheetFile {
  const cells = Array.from({ length: rows }, (_, r) => ({
    r,
    c: 0,
    value: { k: 'n' as const, v: r },
  }));
  const data = writeXlsx({ sheets: [{ name: 'Data', rows, cols: 1, cells }] }, '').data;
  return { fileName: name, name: nameFromFile(name), bytes: bytesOf(data) };
}

const text = (fileName: string, body: string): SpreadsheetFile => ({
  fileName,
  name: nameFromFile(fileName),
  bytes: bytesOf(new TextEncoder().encode(body)),
});

// docs/specs/029-sheets/standard-mapping.md "Pictures in the file", "Stored on opening" (D628).
function withPictures(): SpreadsheetFile {
  let n = 5;
  const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
  const layout = emptyLayout(rand, 4, 4);
  const at = { r: layout.rows[1]!, c: layout.cols[1]!, dx: 0, dy: 0 };
  const image = (id: string, imageId: string) => ({
    id,
    kind: 'image' as const,
    at,
    width: 50,
    height: 40,
    imageId,
  });
  const sheet = emptySheet({
    id: 'sheetOne1',
    tabId: 't1',
    title: 'Pics',
    layout: { ...layout, objects: [image('i1', 'a'), image('i2', 'b'), image('i3', 'a')] },
  });
  const bytes = new Map([
    ['a', { data: solidPng(4, 4, [1, 2, 3]), type: 'image/png' as const }],
    ['b', { data: solidPng(5, 5, [3, 2, 1]), type: 'image/png' as const }],
  ]);
  const data = writeWorkbook([sheet], made(), 'Pics', 'xlsx', undefined, bytes).data;
  return { fileName: 'Pics.xlsx', name: 'Pics', bytes: bytesOf(data) };
}

describe('importSpreadsheetFile pictures', () => {
  it('stores each picture once before the spreadsheet is made, placing those the gallery took', async () => {
    const stored: number[] = [];
    const port = fakePort({
      storePicture: async ({ data }) => {
        stored.push(data.length);
        return stored.length === 1
          ? { ok: true, imageId: 'g-a' }
          : { ok: false, why: 'gallery_full' };
      },
    });
    const opened = await importSpreadsheetFile(withPictures(), made(), port);
    if (!opened.ok) throw new Error('not opened');
    expect(stored).toHaveLength(2);
    // A sheet's objects follow its rows and columns, as a part of their own.
    const objects = port.writes.flatMap(({ write }) =>
      write.kind === 'layout'
        ? write.changes.flatMap((c) => (c.k === 'object' ? [c.object] : []))
        : [],
    );
    expect(objects.map((o) => o?.kind === 'image' && o.imageId)).toEqual(['g-a', 'g-a']);
    expect(opened.report.map(importReportLine)).toEqual([
      '1 picture over the cells is left out, as the image gallery did not take it or its sheet was full: Pics',
    ]);
    expect(port.events).toContain('[workbook] pictures stored');
  });

  it('leaves out a picture whose store throws, as failed', async () => {
    const port = fakePort({ storePicture: () => Promise.reject(new Error('down')) });
    const opened = await importSpreadsheetFile(withPictures(), made(), port);
    if (!opened.ok) throw new Error('not opened');
    expect(port.writes).toEqual([]);
    expect(opened.report.map((l) => l.k)).toEqual(['picture_unread']);
  });
});

describe('importSpreadsheetFile', () => {
  it('makes an XLSX spreadsheet, then sends its other rows and cells with their progress', async () => {
    const port = fakePort();
    const progress: number[] = [];
    const opened = await importSpreadsheetFile(xlsx(1200), made(), port, (s) => progress.push(s));
    expect(opened).toMatchObject({
      ok: true,
      name: 'Q3',
      format: 'xlsx',
      imported: 'xlsx',
      cells: 1200,
    });
    const [created] = port.created;
    expect(created!.record).toMatchObject({ format: 'xlsx', meaning: 'ooxml' });
    expect(created!.sheets[0]!.layout.rows).toHaveLength(1000);
    expect(created!.sheets[0]!.cells).toHaveLength(1000);
    expect(created!.sheets[0]!.tabId).toMatch(/^[0-9a-f-]{36}$/);
    expect(port.writes.map((w) => w.write.kind)).toEqual(['layout', 'cells']);
    expect(progress[0]).toBeLessThan(1);
    expect(progress.at(-1)).toBe(1);
    expect(port.kept).toEqual([]);
    if (!opened.ok) throw new Error('not opened');
    expect(opened.report).toEqual([]);
    expect(opened.sheets).toEqual([
      { id: created!.sheets[0]!.id, tabId: created!.sheets[0]!.tabId, title: 'Data' },
    ]);
    expect(port.events).toContain('[workbook] file read');
  });

  it('moves the half-made spreadsheet to the Bin when a part is refused, and says so when that fails too', async () => {
    const refused = new Error('workbook_full');
    const port = fakePort({
      write: async () => {
        throw refused;
      },
      bin: async () => {
        throw new Error('offline');
      },
    });
    const opened = await importSpreadsheetFile(xlsx(1200, 'Big.xlsx'), made(), port);
    expect(opened).toEqual({ ok: false, rejection: 'import_refused', cause: refused });
    expect(port.events).toContain('[workbook] half-made spreadsheet not binned');
    const binned = fakePort({ write: async () => Promise.reject(refused) });
    await importSpreadsheetFile(xlsx(1200), made(), binned);
    expect(binned.binned).toEqual([binned.created[0]!.documentId]);
  });

  it('bins nothing when the create itself is refused', async () => {
    const port = fakePort({ create: async () => Promise.reject(new Error('down')) });
    expect(await importSpreadsheetFile(xlsx(1), made(), port)).toMatchObject({
      ok: false,
      rejection: 'import_refused',
    });
    expect(port.binned).toEqual([]);
  });

  it('refuses a file of no sheets, a damaged one, and one past the budget before reading it', async () => {
    const none = { ...xlsx(0), bytes: bytesOf(writeXlsx({ sheets: [] }, '').data) };
    expect(await importSpreadsheetFile(none, made(), fakePort())).toEqual({
      ok: false,
      rejection: 'no_sheets',
    });
    const damaged = { ...xlsx(0, 'x.ods'), bytes: new Uint8Array([1, 2]) };
    expect(await importSpreadsheetFile(damaged, made(), fakePort())).toEqual({
      ok: false,
      rejection: 'package_damaged',
    });
    const huge = {
      ...xlsx(0),
      bytes: { length: PACKAGE_MAX_BYTES + 1 } as Uint8Array<ArrayBuffer>,
    };
    const port = fakePort();
    expect(await importSpreadsheetFile(huge, made(), port)).toEqual({
      ok: false,
      rejection: 'package_too_large',
    });
    expect(port.events).toEqual(['[workbook] refused']);
  });

  it('opens a file whose sheet is renamed, the rename in its report', async () => {
    const blank = {
      ...xlsx(0, 'B.xlsx'),
      bytes: bytesOf(writeXlsx({ sheets: [{ name: '', rows: 0, cols: 0, cells: [] }] }, '').data),
    };
    const port = fakePort();
    const opened = await importSpreadsheetFile(blank, made(), port);
    if (!opened.ok) throw new Error('not opened');
    expect(port.created[0]!.sheets[0]!.title).toBe('Sheet1');
    expect(opened.report.map(importReportLine)).toEqual([
      '1 sheet name is changed to fit: “” becomes “Sheet1”',
    ]);
    expect(port.events).toContain('[workbook] file read losses');
  });
});

// standard-mapping.md "Unknown content": what the file holds that the model does not is sent after its parts.
describe('a file’s kept content', () => {
  const CALC = '<calcPr calcId="191029"/>';
  const withKept = (): SpreadsheetFile => ({
    fileName: 'K.xlsx',
    name: 'K',
    bytes: bytesOf(
      writeXlsx(
        {
          sheets: [{ name: 'Data', rows: 1, cols: 1, cells: [] }],
          kept: {
            standard: 'ooxml',
            items: [{ place: 'workbook', xml: CALC, ns: {}, at: {} }],
            parts: [],
            relationships: [],
          },
        },
        '',
      ).data,
    ),
  });

  it('is sent after the create, and what could not be stored is in the report', async () => {
    const port = fakePort({ keep: async () => 1 });
    const keep = vi.spyOn(port, 'keep');
    const opened = await importSpreadsheetFile(withKept(), made(), port);
    if (!opened.ok) throw new Error('not opened');
    expect(keep.mock.calls[0]![0].items.map((item) => item.xml)).toContain(CALC);
    expect(opened.report.map(importReportLine)).toEqual([
      '1 thing the file holds could not be kept',
    ]);
  });

  it('bins the half-made spreadsheet when it is refused', async () => {
    const port = fakePort({ keep: async () => Promise.reject(new Error('kept_item_invalid')) });
    expect(await importSpreadsheetFile(withKept(), made(), port)).toMatchObject({ ok: false });
    expect(port.binned).toHaveLength(1);
  });
});

// files-and-print.md "Import" (D117): a CSV or TSV opens as one sheet of a new spreadsheet, values read as typed.
describe('a CSV or TSV opened', () => {
  it.each([
    ['Prices.csv', 'Tea;3,50\nCake;=1+1\n', 'csv'],
    ['Prices.tsv', 'Tea\t3,50\nCake\t=1+1\n', 'tsv'],
    ['Prices.txt', 'Tea\t3,50\nCake\t=1+1\n', 'tsv'],
  ])(
    'makes %s one sheet named after it, in a new spreadsheet’s format',
    async (name, body, imported) => {
      const port = fakePort();
      const opened = await importSpreadsheetFile(text(name, body), made(), port);
      expect(opened).toMatchObject({ ok: true, format: 'ods', imported });
      const [created] = port.created;
      expect(created!.record.meaning).toBeUndefined();
      expect(created!.sheets[0]!.title).toBe('Prices');
      expect(created!.sheets[0]!.cells.map((c) => c.i)).toEqual([
        { s: 'Tea' },
        { s: '3,50' },
        { s: 'Cake' },
        expect.objectContaining({ f: expect.anything() }),
      ]);
      expect(port.kept).toEqual([]);
      expect(port.events).toContain('[workbook] text file read');
    },
  );
});

describe('the words', () => {
  it('names the spreadsheet after the file, and says why a file did not open', () => {
    expect(nameFromFile('Q3 budget.xlsx')).toBe('Q3 budget');
    expect(nameFromFile('.xlsx')).toBe('');
    expect(fileOpenRefusalWords('no_sheets')).toBe('This file holds no sheets to open.');
    expect(fileOpenRefusalWords('import_refused')).toBe('The file could not be opened. Try again.');
    expect(fileOpenRefusalWords('package_encrypted')).toBe(
      'This file is protected by a password. Remove the password, then open it again.',
    );
  });
});
