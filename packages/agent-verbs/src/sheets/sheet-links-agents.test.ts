// docs/specs/029-sheets/inserted-objects.md "Links, agents": change_sheet's format op takes a link (an address, a
// range or sheet by name, or null to take it off); read_sheet shows a cell's link, a sheet's by its title.
import { describe, expect, it } from 'vitest';
import { sheetFromJson, WorkbookRecord } from '@livedoc/sheets';
import { DOC_A, fakeApi, library } from '../testing/fake-api';
import { sheetJson, sheetServer } from '../testing/sheets';
import { changeSheet } from './change-sheet';
import { readSheet } from './read-sheet';

const WORKBOOK = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

function book() {
  const server = sheetServer(
    DOC_A,
    [
      sheetJson({ id: 'sheet_models', tabId: 'tab-models', title: 'Models' }, [
        ['Docs', 'Mail', 'Prices', 'Notes'],
      ]),
      sheetJson({ id: 'sheet_prices', tabId: 'tab-prices', title: 'Price list', createdAt: 1 }, [
        ['x'],
      ]),
    ],
    { workbook: WORKBOOK },
  );
  const api = fakeApi(Object.assign(server.routes, library));
  return { api, server };
}

const change = (api: ReturnType<typeof book>['api'], changes: unknown[]) =>
  changeSheet(api, DOC_A, { sheet: 'Models', changes: changes as never }, 'mcp');

describe('change_sheet format link', () => {
  it('links cells to an address, an email, a range and a sheet, each read back by name', async () => {
    const { api, server } = book();
    const out = await change(api, [
      { op: 'format', range: 'A1', format: { link: 'https://docs.nu', bold: true } },
      { op: 'format', range: 'B1', format: { link: 'ada@example.com' } },
      { op: 'format', range: 'C1', format: { link: "'Price list'!A1:B4" } },
      { op: 'format', range: 'D1', format: { link: 'Price list' } },
      { op: 'format', range: 'A2', format: { link: 'C1:C3' } },
    ]);
    expect(out.refusal).toBeUndefined();
    const { rows, cols } = server.sheets[0]!.layout;
    const sheet = sheetFromJson({ ...server.sheets[0]!, rev: 0 });
    expect(sheet.cells.get(`${rows[0]}:${cols[2]}`)?.format).toEqual({
      ln: '#gid=sheet_prices&range=A1:B4',
    });
    const read = await readSheet(api, DOC_A, { sheet: 'Models' });
    expect(read.ok && read.cells.map((c) => [c.at, c.link])).toEqual([
      ['A1', 'https://docs.nu/'],
      ['B1', 'mailto:ada@example.com'],
      ['C1', "'Price list'!A1:B4"],
      ['D1', 'Price list'],
    ]);
    // A link on an empty cell is held, read with no value.
    expect(sheet.cells.get(`${rows[1]}:${cols[0]}`)?.format).toEqual({
      ln: '#gid=sheet_models&range=C1:C3',
    });
  });

  it('takes a link off with null, other formats staying', async () => {
    const { api, server } = book();
    await change(api, [
      { op: 'format', range: 'A1', format: { link: 'https://docs.nu', bold: true } },
    ]);
    await change(api, [{ op: 'format', range: 'A1', format: { link: null } }]);
    const { rows, cols } = server.sheets[0]!.layout;
    const sheet = sheetFromJson({ ...server.sheets[0]!, rev: 0 });
    expect(sheet.cells.get(`${rows[0]}:${cols[0]}`)?.format).toEqual({ b: true });
  });

  it('refuses a link that reads as none', async () => {
    const { api } = book();
    for (const link of ['javascript:alert(1)', 'docs.nu', 'Gone!A1']) {
      const out = await change(api, [{ op: 'format', range: 'A1', format: { link } }]);
      expect(out.refusal?.code, link).toBe('format_invalid');
      expect(out.refusal?.message).toContain('Sheet2!A1:B4');
    }
  });

  it('copies no link to the rows and columns inserted beside a linked cell', async () => {
    const { api, server } = book();
    await change(api, [
      { op: 'format', range: 'A1', format: { link: 'https://docs.nu', bold: true } },
      { op: 'insert_rows', at: 1, count: 1 },
    ]);
    const { rows, cols } = server.sheets[0]!.layout;
    const sheet = sheetFromJson({ ...server.sheets[0]!, rev: 0 });
    const formats = [0, 1].map((r) => sheet.cells.get(`${rows[r]}:${cols[0]}`)?.format);
    expect(formats.filter((f) => f?.ln)).toHaveLength(1);
    expect(formats.every((f) => f?.b)).toBe(true);
  });
});
