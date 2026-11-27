// docs/specs/029-sheets/standard-mapping.md "Tables in the file" (ODF): a sheet's tables written as database ranges,
// formulas reading them as the plain ranges they read, LiveDoc's record restoring the table references while its
// fingerprint holds; another app's database ranges read as tables, an autofilter's kept as it came.
import { describe, expect, it } from 'vitest';
import { makeSheets } from '../testing/book';
import { ODF_NAMESPACES } from '../testing/hand-files';
import { sheetFromJson } from '../sheet-json';
import type { Sheet } from '../sheet';
import type { SheetTable } from '../tables/table';
import { WorkbookRecord } from '../workbook-record';
import { readOds } from './ods-read';
import { withDatabaseRanges } from './ods-tables';
import { sheetsFromFile, type FileRead } from './workbook-file';
import { workbookFileFor, writeWorkbook } from './write-workbook';
import { workbookConversion } from './conversion';

let n = 9;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const BY = { id: 'test', name: 'Test', color: '#000000' };
const encode = (text: string) => new TextEncoder().encode(text);

async function ok(read: Promise<FileRead>) {
  const out = await read;
  if (!out.ok) throw new Error(out.rejection);
  return out;
}

const SALES: SheetTable = {
  id: 'tbl001',
  name: 'My Sales',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r4',
  c2: 's0c1',
  total: true,
  types: { s0c1: 'number' },
};
const sheetsWithSales = () =>
  makeSheets(
    {
      "Sales' sheet": {
        A1: 'Item',
        B1: 'Amount',
        A2: 'pen',
        B2: '3',
        A3: 'ink',
        B3: '1',
        A4: 'cap',
        B4: '2',
        A5: 'Total',
        B5: '=SUBTOTAL(109,My_Sales[Amount])',
        E1: '=SUM(My_Sales[Amount])',
        E2: '=My_Sales[@Amount]*2',
        E3: '=ROWS(My_Sales)',
      },
    },
    { tables: { "Sales' sheet": [SALES] } },
  );

const opened = (made: ReturnType<typeof sheetsFromFile>): Sheet[] =>
  made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );

const formulas = (sheets: readonly Sheet[]) =>
  workbookFileFor(sheets, record)
    .sheets[0]!.cells.filter((c) => c.formula)
    .map((c) => [c.r, c.c, c.formula, c.value]);

describe('tables in ODF', () => {
  it('writes each as a database range, formulas as the plain ranges they read, the record beside', () => {
    const flat = new TextDecoder().decode(
      writeWorkbook(sheetsWithSales(), record, 'Book', 'fods').data,
    );
    expect(flat).toContain(
      `<table:database-ranges><table:database-range table:name="My_Sales" table:target-range-address="'Sales'' sheet'.A1:'Sales'' sheet'.B5" table:contains-header="true" table:display-filter-buttons="true"/></table:database-ranges>`,
    );
    expect(flat).toContain('table:formula="of:=SUM([.$B$2:.$B$4])"');
    expect(flat).toContain('table:formula="of:=[.$B$2]*2"');
    expect(flat).toContain('table:formula="of:=ROWS([.$A$2:.$B$4])"');
    expect(flat).toContain(
      'livedoc:tables="{&quot;tables&quot;:[{&quot;name&quot;:&quot;My Sales&quot;',
    );
    expect(flat).toContain('&quot;E2&quot;:&quot;=My_Sales[@Amount]*2&quot;');
  });

  it('reads back each table and every formula reading it as made, from .ods and .fods', async () => {
    const sheets = sheetsWithSales();
    for (const format of ['ods', 'fods'] as const) {
      const read = await ok(readOds(writeWorkbook(sheets, record, 'Book', format).data));
      expect(read.losses, format).toEqual([]);
      expect(read.file.kept?.items.filter((i) => i.xml.includes('database-range')) ?? []).toEqual(
        [],
      );
      const made = sheetsFromFile(read.file, 'en-GB', rand);
      expect(made.losses, format).toEqual([]);
      const back = opened(made);
      expect(workbookFileFor(back, record).sheets[0]!.tables).toEqual(
        workbookFileFor(sheets, record).sheets[0]!.tables,
      );
      expect(formulas(back), format).toEqual(formulas(sheets));
    }
  });

  it('keeps the plain range of a formula another app changed, the record dropped and named', async () => {
    const flat = new TextDecoder()
      .decode(writeWorkbook(sheetsWithSales(), record, 'Book', 'fods').data)
      .replace('of:=[.$B$2]*2', 'of:=[.$B$2]*3');
    const read = await ok(readOds(encode(flat)));
    expect(read.losses).toEqual([{ k: 'tables_changed', sheet: "Sales' sheet" }]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const back = formulas(opened(made));
    expect(back).toContainEqual([1, 4, '=$B$2*3', { k: 'n', v: 9 }]);
    // The whole record is dropped: every formula keeps the plain range it was written with.
    expect(back).toContainEqual([0, 4, '=SUM($B$2:$B$4)', { k: 'n', v: 6 }]);
    expect(made.sheets[0]!.layout.tables?.[0]).toMatchObject({ name: 'My_Sales' });
    expect(made.sheets[0]!.layout.tables?.[0]?.types).toBeUndefined();
  });

  it('reads another app’s database range as a table, keeps a headless one and an autofilter’s', async () => {
    const read = await ok(
      readOds(
        encode(
          `<?xml version="1.0"?><office:document ${ODF_NAMESPACES} office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>` +
            '<table:table table:name="S"><table:table-row><table:table-cell office:value-type="string"><text:p>Item</text:p></table:table-cell></table:table-row>' +
            '<table:table-row><table:table-cell office:value-type="string"><text:p>pen</text:p></table:table-cell></table:table-row></table:table>' +
            '<table:database-ranges>' +
            '<table:database-range table:name="Items" table:target-range-address="S.A1:S.A2"/>' +
            '<table:database-range table:name="Raw" table:target-range-address="S.C1:S.C2" table:contains-header="false"/>' +
            '<table:database-range table:name="__Anonymous_Sheet_DB__0" table:target-range-address="S.E1:S.E2" table:display-filter-buttons="true"/>' +
            '</table:database-ranges></office:spreadsheet></office:body></office:document>',
        ),
      ),
    );
    expect(read.losses).toEqual([{ k: 'table_unread', sheet: 'S', name: 'Raw' }]);
    expect(read.file.sheets[0]!.tables).toEqual([
      { name: 'Items', range: { r1: 0, c1: 0, r2: 1, c2: 0 }, columns: [] },
    ]);
    const kept = read.file.kept!.items.find((i) => i.xml.includes('database-ranges'))!.xml;
    expect(kept).toContain('table:name="Raw"');
    expect(kept).toContain('__Anonymous_Sheet_DB__0');
    expect(kept).not.toContain('table:name="Items"');
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.sheets[0]!.layout.tables?.map((t) => t.name)).toEqual(['Items']);
  });

  it('writes an autofilter’s anonymous range back with its filter conditions, beside its own tables', async () => {
    const autofilter =
      '<table:database-range table:name="__Anonymous_Sheet_DB__0" table:target-range-address="S.A1:S.A3" table:display-filter-buttons="true">' +
      '<table:filter><table:filter-condition table:field-number="0" table:value="pen" table:operator="="/></table:filter>' +
      '</table:database-range>';
    const read = await ok(
      readOds(
        encode(
          `<?xml version="1.0"?><office:document ${ODF_NAMESPACES} office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>` +
            '<table:table table:name="S"><table:table-row><table:table-cell office:value-type="string"><text:p>Item</text:p></table:table-cell></table:table-row>' +
            '<table:table-row><table:table-cell office:value-type="string"><text:p>pen</text:p></table:table-cell></table:table-row>' +
            '<table:table-row><table:table-cell office:value-type="string"><text:p>ink</text:p></table:table-cell></table:table-row></table:table>' +
            `<table:database-ranges>${autofilter}</table:database-ranges></office:spreadsheet></office:body></office:document>`,
        ),
      ),
    );
    // Not a loss: the filter stays the file's own.
    expect(read.losses).toEqual([]);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const [sheet] = opened(made);
    const layout = sheet!.layout;
    const own: SheetTable = {
      id: 'tbl123',
      name: 'Mine',
      r1: layout.rows[0]!,
      c1: layout.cols[3]!,
      r2: layout.rows[2]!,
      c2: layout.cols[3]!,
    };
    const odsRecord = WorkbookRecord.opened(record, 'ods', undefined);
    for (const format of ['ods', 'fods'] as const) {
      const out = writeWorkbook(
        [{ ...sheet!, layout: { ...layout, tables: [own] } }],
        odsRecord,
        'Book',
        format,
        made.kept,
      );
      expect(out.losses, format).toEqual([]);
      const again = await ok(readOds(out.data));
      const kept = again.file.kept!.items.find((i) => i.xml.includes('database-ranges'))!.xml;
      expect(kept, format).toContain('table:name="__Anonymous_Sheet_DB__0"');
      expect(kept, format).toContain(
        '<table:filter><table:filter-condition table:field-number="0" table:value="pen" table:operator="="/></table:filter>',
      );
      expect(
        again.file.sheets[0]!.tables?.map((t) => t.name),
        format,
      ).toEqual(['Mine']);
    }
  });

  it('places its own database ranges in the kept holder, else after the names', () => {
    const own = ['<table:database-range table:name="T"/>'];
    expect(withDatabaseRanges(['<x:named-expressions/>', '<x:other/>'], own)).toEqual([
      '<x:named-expressions/>',
      '<table:database-ranges><table:database-range table:name="T"/></table:database-ranges>',
      '<x:other/>',
    ]);
    expect(withDatabaseRanges(['<t:database-ranges><a/></t:database-ranges>'], own)).toEqual([
      '<t:database-ranges><a/><table:database-range table:name="T"/></t:database-ranges>',
    ]);
    expect(withDatabaseRanges(['<t:database-ranges/>'], own)).toEqual([
      '<t:database-ranges><table:database-range table:name="T"/></t:database-ranges>',
    ]);
    expect(withDatabaseRanges([], own)).toEqual([
      '<table:database-ranges><table:database-range table:name="T"/></table:database-ranges>',
    ]);
    expect(withDatabaseRanges(['<a/>'], [])).toEqual(['<a/>']);
  });

  it('converts between the standards without losing a table formula', () => {
    const sheets = sheetsWithSales();
    expect(
      workbookConversion(sheets, WorkbookRecord.opened(record, 'xlsx', undefined), 'ods').losses,
    ).toEqual([]);
  });
});
