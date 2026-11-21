import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentResponse,
  WorkbookConversionResponse,
  WorkbookSettingsResponse,
} from '@livedoc/api-schema';
import { WorkbookRecord } from '@livedoc/sheets';
import { readXlsx } from '@livedoc/sheets/files';
import { workbookKit, type KitCall, type WorkbookKit } from './workbook-test-kit';

// docs/specs/029-sheets/files-and-print.md "Converting" and "Download": the losses listed (read access), the format
// changed (Editors), sent live, guarded against a second conversion; a download in the other format is a copy.

// The next reads of the record, as read before another Editor's conversion (or the document's going) landed.
const stale = vi.hoisted(() => ({ reads: [] as ('xlsx' | 'ods')[] }));

vi.mock('../db/workbook', async (actual) => {
  const real = await actual<typeof import('../db/workbook')>();
  return {
    ...real,
    readWorkbook: async (...args: Parameters<typeof real.readWorkbook>) => {
      const read = stale.reads.shift();
      if (!read) return real.readWorkbook(...args);
      const made = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });
      return WorkbookRecord.converted(made, read);
    },
  };
});

let kit: WorkbookKit;

const listed = (to: string, extra: Partial<KitCall> = {}) =>
  kit.call({ method: 'GET', path: `/book1/workbook/conversion?to=${to}`, ...extra });
const convert = (body: unknown, extra: Partial<KitCall> = {}) =>
  kit.call({ path: '/book1/workbook/conversion', body, ...extra });
const format = async () =>
  (await (await kit.call({ method: 'GET', path: '/book1' })).json<DocumentResponse>()).document
    .workbook?.format;

beforeEach(async () => {
  stale.reads = [];
  kit = workbookKit();
  const cells = [
    { r: kit.layout.rows[0], c: kit.layout.cols[0], i: { f: { t: 'EASTERSUNDAY(2024)', r: [] } } },
    { r: kit.layout.rows[0], c: kit.layout.cols[1], i: { n: 3 } },
  ];
  const made = kit.document('book1', true, cells as never);
  expect((await kit.call({ path: '', body: made })).status).toBe(201);
  kit.sql.sql.exec(
    "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('EDIT', 'book1', 'edit', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('VIEW', 'book1', 'view', NULL, 1);" +
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'edit', 'book1t', 1);",
  );
  kit.relayed.length = 0;
});

describe('listing what a conversion loses', () => {
  it('lists what the other format cannot hold, worked out from the sheets', async () => {
    const res = await listed('xlsx');
    expect(res.status).toBe(200);
    expect(await res.json<WorkbookConversionResponse>()).toEqual({
      from: 'ods',
      to: 'xlsx',
      losses: [{ k: 'formula_uncalculated', count: 1, functions: ['EASTERSUNDAY'] }],
    });
  });

  it('lists nothing within one standard', async () => {
    expect(await (await listed('fods')).json()).toEqual({ from: 'ods', to: 'fods', losses: [] });
  });

  it('is anyone’s who reads, never a tab-scoped link’s or a stranger’s', async () => {
    expect((await listed('xlsx', { owner: 'v', code: 'VIEW' })).status).toBe(200);
    expect((await listed('xlsx', { owner: 'e', code: 'TAB1' })).status).toBe(404);
    expect((await listed('xlsx&tabId=book1t', { owner: 'e', code: 'TAB1' })).status).toBe(403);
    expect((await listed('xlsx', { owner: 'stranger' })).status).toBe(403);
  });

  it.each([
    ['a format that is none', 'pdf', 400, 'file_type_unknown'],
    ['no format', '', 400, 'file_type_unknown'],
  ])('refuses %s', async (_, to, status, error) => {
    const res = await listed(to);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it('refuses a document that is no spreadsheet', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await kit.call({ method: 'GET', path: '/plan1/workbook/conversion?to=xlsx' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'workbook_not_found' });
  });
});

describe('converting', () => {
  it('changes the file format alone, answers the record, and sends it live', async () => {
    const res = await convert({ format: 'xlsx' });
    expect(res.status).toBe(200);
    const body = await res.json<WorkbookSettingsResponse>();
    expect(body.workbook.format).toBe('xlsx');
    expect(body.rev).toBe(1);
    expect(await format()).toBe('xlsx');
    expect(kit.relayed).toEqual([{ kind: 'workbook', workbook: body.workbook, rev: 1 }]);
    const sheets = await kit.sheets('book1');
    expect(sheets.map((s) => s.title)).toEqual(['Sheet1']);
    expect(sheets[0]!.cells).toHaveLength(2);
  });

  it('converts back to either ODF form, as an undo does', async () => {
    await convert({ format: 'xlsx' });
    const res = await convert({ format: 'fods' });
    expect(res.status).toBe(200);
    expect(await format()).toBe('fods');
  });

  it.each([
    ['the standard it is in', { format: 'fods' }, 409, 'format_same_standard'],
    ['a format that is none', { format: 'pdf' }, 400, 'file_type_unknown'],
    ['no body', undefined, 400, 'file_type_unknown'],
  ])('refuses %s, and changes nothing', async (_, body, status, error) => {
    const res = await convert(body);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(await format()).toBe('ods');
    expect(kit.relayed).toEqual([]);
  });

  it('refuses a second conversion that lost the race to the first', async () => {
    await convert({ format: 'xlsx' });
    kit.relayed.length = 0;
    stale.reads = ['ods'];
    const res = await convert({ format: 'xlsx' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'format_same_standard' });
    expect(kit.relayed).toEqual([]);
  });

  it('refuses a conversion whose spreadsheet went before it landed', async () => {
    stale.reads = ['xlsx'];
    kit.sql.sql.exec("DELETE FROM workbook WHERE document_id = 'book1'");
    const res = await convert({ format: 'ods' });
    expect(res.status).toBe(404);
  });

  it("is an Editor's, never a tab-scoped link's", async () => {
    expect((await convert({ format: 'xlsx' }, { owner: 'v', code: 'VIEW' })).status).toBe(403);
    expect((await convert({ format: 'xlsx' }, { owner: 'e', code: 'TAB1' })).status).toBe(404);
    const scoped = await kit.call({
      path: '/book1/workbook/conversion?tabId=book1t',
      body: { format: 'xlsx' },
      owner: 'e',
      code: 'TAB1',
    });
    expect(scoped.status).toBe(403);
    expect((await convert({ format: 'xlsx' }, { owner: 'e', code: 'EDIT' })).status).toBe(200);
  });

  it('refuses a document that is no spreadsheet', async () => {
    await kit.call({ path: '', body: kit.document('plan1', false) });
    const res = await kit.call({ path: '/plan1/workbook/conversion', body: { format: 'xlsx' } });
    expect(res.status).toBe(404);
  });

  it('answers another method as not allowed', async () => {
    const res = await kit.call({ method: 'PUT', path: '/book1/workbook/conversion' });
    expect(res.status).toBe(405);
  });
});

// formulas.md, the file's meaning (D100): a spreadsheet opened from a file keeps its meaning, made, copied and stored;
// converting gives it the new format's, converting back the old one's; the formulas answering otherwise are listed.
describe('a spreadsheet opened from a file', () => {
  beforeEach(async () => {
    const cells = [
      { r: kit.layout.rows[0], c: kit.layout.cols[0], i: { f: { t: 'CEILING(-2.5,-1)', r: [] } } },
    ];
    const made = kit.document('opened', true, cells as never);
    const created = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });
    const workbook = WorkbookRecord.opened(created, 'ods');
    expect((await kit.call({ path: '', body: { ...made, workbook } })).status).toBe(201);
  });

  const meaning = async () =>
    (await (await kit.call({ method: 'GET', path: '/opened' })).json<DocumentResponse>()).document
      .workbook?.meaning;

  it('keeps the file’s meaning, lists what the new format answers otherwise, and converts it both ways', async () => {
    expect(await meaning()).toBe('openformula');
    const list = await kit.call({ method: 'GET', path: '/opened/workbook/conversion?to=xlsx' });
    expect((await list.json<WorkbookConversionResponse>()).losses).toEqual([
      { k: 'answers_differ', count: 1, functions: ['CEILING'] },
    ]);
    const res = await kit.call({ path: '/opened/workbook/conversion', body: { format: 'xlsx' } });
    expect((await res.json<WorkbookSettingsResponse>()).workbook.meaning).toBe('ooxml');
    expect(await meaning()).toBe('ooxml');
    await kit.call({ path: '/opened/workbook/conversion', body: { format: 'ods' } });
    expect(await meaning()).toBe('openformula');
  });

  it('leaves a spreadsheet made in LiveDoc Google’s when it converts', async () => {
    await convert({ format: 'xlsx' });
    const book = await kit.call({ method: 'GET', path: '/book1' });
    expect((await book.json<DocumentResponse>()).document.workbook?.meaning).toBeUndefined();
  });

  it('reads a meaning it cannot as Google’s, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    kit.sql.sql.exec("UPDATE workbook SET meaning = 'lotus' WHERE document_id = 'opened'");
    expect(await meaning()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[workbook] unreadable meaning', { documentId: 'opened' });
    warn.mockRestore();
  });
});

describe('downloading in the other format', () => {
  it('writes a converted copy and leaves the workbook in its own format', async () => {
    const res = await kit.call({ method: 'GET', path: '/book1/workbook/file?format=xlsx' });
    expect(res.status).toBe(200);
    const read = await readXlsx(new Uint8Array(await res.arrayBuffer()));
    expect(read.ok && read.file.sheets[0]!.cells[0]!.formula).toBe('=EASTERSUNDAY(2024)');
    expect(await format()).toBe('ods');
  });
});
