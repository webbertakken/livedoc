// docs/specs/029-sheets/standard-mapping.md "Filters in the file" (ODF): the sheet's filter as LibreOffice's anonymous
// database range, its hidden rows `table:visibility="filter"`, LiveDoc's record on the table; LibreOffice's own form
// read back; filter views left out of the file.
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { makeSheets } from '../testing/book';
import { ODF_NAMESPACES } from '../testing/hand-files';
import { sheetFromJson } from '../sheet-json';
import type { FilterCondition, Sheet, SheetLayout } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { readOds } from './ods-read';
import { odsHeld, readOdsFilter } from './ods-filters';
import { sheetsFromFile, type FileRead } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { workbookConversion } from './conversion';
import { conversionLine } from './conversion-copy';

let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const ods = WorkbookRecord.opened(
  WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }),
  'ods',
  undefined,
);
const BY = { id: 'test', name: 'Test', color: '#000000' };
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const encode = (text: string) => new TextEncoder().encode(text);

async function ok(read: Promise<FileRead>) {
  const out = await read;
  if (!out.ok) throw new Error(out.rejection);
  return out;
}

const opened = (made: ReturnType<typeof sheetsFromFile>): Sheet[] =>
  made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );

function itemSheets(conds: Record<string, FilterCondition>): Sheet[] {
  const [sheet] = makeSheets({
    Data: { A1: 'Item', B1: 'N', A2: 'pen', B2: '5', A3: 'ink', B3: '1', A4: 'cap', B4: '9' },
  });
  const layout: SheetLayout = {
    ...sheet!.layout,
    filter: { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1', conds },
    filterViews: [
      { id: 'view01', title: 'Mine', r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1', conds: {} },
    ],
  };
  return [{ ...sheet!, layout }];
}

const byPlace = (layout: SheetLayout, conds: Record<string, FilterCondition> | undefined) =>
  Object.fromEntries(Object.entries(conds ?? {}).map(([c, v]) => [layout.cols.indexOf(c), v]));

describe('filters in ODF', () => {
  it('writes LibreOffice’s anonymous range, its hidden rows as the filter’s, and reads it back exactly', async () => {
    const conds = {
      s0c0: { values: ['pen', 'ink', ''] },
      s0c1: { op: 'notBetween', a: '2', b: '8' } as FilterCondition,
    };
    const out = writeWorkbook(itemSheets(conds), ods, 'Book', 'fods');
    expect(out.losses).toEqual([]);
    const text = decode(out.data);
    expect(text).toContain(
      `<table:database-range table:name="__Anonymous_Sheet_DB__0" table:target-range-address="'Data'.A1:'Data'.B4" table:display-filter-buttons="true"><table:filter><table:filter-condition table:field-number="0" table:operator="=" table:value="pen"><table:filter-set-item table:value="pen"/><table:filter-set-item table:value="ink"/><table:filter-set-item table:value=""/></table:filter-condition></table:filter></table:database-range>`,
    );
    // Is Not Between has no form LibreOffice reads: LiveDoc's record alone keeps it.
    expect(text).toContain('livedoc:filters="');
    // Row 2 (pen's 5 is between 2 and 8) and row 4 (cap is not a kept value) are the filter's; ink's row shows.
    expect(text.match(/<table:table-row[^>]*table:visibility="filter"/g)).toHaveLength(2);
    const read = await ok(readOds(out.data));
    expect(read.losses).toEqual([]);
    const [sheet] = opened(sheetsFromFile(read.file, 'en-GB', rand));
    const layout = sheet!.layout;
    expect(byPlace(layout, layout.filter!.conds)).toEqual({ 0: conds.s0c0, 1: conds.s0c1 });
    expect(layout.hiddenRows ?? []).toEqual([]);
    // ODF holds no filter views.
    expect(layout.filterViews).toBeUndefined();
  });

  it('reads the standard form over a record another app changed, the change logged', async () => {
    const out = writeWorkbook(itemSheets({ s0c1: { op: 'gt', a: '2' } }), ods, 'Book', 'fods');
    const edited = decode(out.data).replace('table:operator="&gt;"', 'table:operator="&lt;"');
    const read = await ok(readOds(encode(edited)));
    expect(read.losses).toEqual([{ k: 'filters_changed', sheet: 'Data' }]);
    const [sheet] = opened(sheetsFromFile(read.file, 'en-GB', rand));
    expect(byPlace(sheet!.layout, sheet!.layout.filter!.conds)).toEqual({
      1: { op: 'lt', a: '2' },
    });
  });

  it('reads LibreOffice’s own filter: an or of an and, kept values with the blank', () => {
    const at = (xml: string) => {
      const parsed = parseXml(`<table:filter ${ODF_NAMESPACES}>${xml}</table:filter>`);
      if (!parsed.ok) throw new Error('xml');
      return readOdsFilter(parsed.root, { r1: 0, c1: 0, r2: 5, c2: 4 });
    };
    expect(
      at(
        '<table:filter-or><table:filter-condition table:value="pen" table:operator="=" table:field-number="0"><table:filter-set-item table:value="pen"/><table:filter-set-item table:value="cap"/></table:filter-condition>' +
          '<table:filter-condition table:data-type="number" table:value="" table:operator="empty" table:field-number="0"/></table:filter-or>',
      ),
    ).toEqual([{ c: 0, std: { values: ['pen', 'cap'], blank: true } }]);
    expect(
      at(
        '<table:filter-and><table:filter-condition table:value="2" table:operator="&gt;=" table:field-number="1"/>' +
          '<table:filter-condition table:value="9" table:operator="&lt;=" table:field-number="1"/>' +
          '<table:filter-condition table:value="ap" table:operator="contains" table:field-number="2"/>' +
          '<table:filter-condition table:value="x" table:operator="!begins" table:field-number="3"/>' +
          '<table:filter-or><table:filter-condition table:value="1" table:operator="=" table:field-number="4"/><table:filter-condition table:value="2" table:operator="=" table:field-number="4"/></table:filter-or>' +
          '<table:filter-condition table:value="1" table:operator="=" table:field-number="9"/></table:filter-and>',
      ),
    ).toEqual([
      {
        c: 1,
        std: {
          tests: [
            { op: 'gte', v: '2' },
            { op: 'lte', v: '9' },
          ],
        },
      },
      { c: 2, std: { tests: [{ op: 'contains', v: 'ap' }] } },
      { c: 3 },
      { c: 4 },
    ]);
  });

  it('says a day as its number and has no form for tests joined by or', () => {
    expect(odsHeld({ day: 'today', at: 46000 })).toEqual({
      tests: [
        { op: 'gte', v: '46000' },
        { op: 'lt', v: '46001' },
      ],
    });
    expect(odsHeld({ day: 'today' })).toBeNull();
    expect(odsHeld({ tests: [{ op: 'lt', v: '1' }], or: true })).toBeNull();
    expect(odsHeld({ values: ['a'] })).toEqual({ values: ['a'] });
  });

  it('keeps a filter row hidden by hand apart from one the filter hides', async () => {
    const [sheet] = itemSheets({ s0c1: { op: 'gt', a: '2' } });
    const hand = [{ ...sheet!, layout: { ...sheet!.layout, hiddenRows: ['s0r1'] } }];
    const text = decode(writeWorkbook(hand, ods, 'Book', 'fods').data);
    expect(text.match(/table:visibility="collapse"/g)).toHaveLength(1);
    expect(text.match(/table:visibility="filter"/g)).toHaveLength(1);
    const read = await ok(readOds(encode(text)));
    const [back] = opened(sheetsFromFile(read.file, 'en-GB', rand));
    expect(back!.layout.hiddenRows).toEqual([back!.layout.rows[1]]);
  });
});

describe('a table’s filter in ODF', () => {
  it('writes it in the table’s own database range and reads it back as the sheet’s filter (D481)', async () => {
    const [sheet] = itemSheets({ s0c1: { op: 'gt', a: '2' } });
    const table = { id: 'tbl001', name: 'Items', r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c1' };
    const sheets = [{ ...sheet!, layout: { ...sheet!.layout, tables: [table], filterViews: [] } }];
    const text = decode(writeWorkbook(sheets, ods, 'Book', 'fods').data);
    expect(text).toContain(
      `<table:database-range table:name="Items" table:target-range-address="'Data'.A1:'Data'.B4" table:contains-header="true" table:display-filter-buttons="true"><table:filter><table:filter-condition table:field-number="1" table:operator="&gt;" table:value="2"/></table:filter></table:database-range>`,
    );
    expect(text).not.toContain('__Anonymous_Sheet_DB__');
    for (const bytes of [text, text.replace(/ livedoc:filters="[^"]*"/, '')]) {
      const read = await ok(readOds(encode(bytes)));
      const [back] = opened(sheetsFromFile(read.file, 'en-GB', rand));
      expect(byPlace(back!.layout, back!.layout.filter!.conds)).toEqual({
        1: { op: 'gt', a: '2' },
      });
      expect(back!.layout.tables?.map((t) => t.name)).toEqual(['Items']);
    }
  });
});

describe('converting a spreadsheet with filter views', () => {
  it('lists the views an OpenDocument file leaves out, and none for Excel', () => {
    const xlsx = WorkbookRecord.opened(ods, 'xlsx', undefined);
    const sheets = itemSheets({});
    const toOds = workbookConversion(sheets, xlsx, 'ods');
    const loss = toOds.losses.find((l) => l.k === 'filter_views_left')!;
    expect(conversionLine(loss, 'ods')).toBe('1 filter view is left out');
    expect(conversionLine({ k: 'filter_views_left', count: 2 }, 'ods')).toBe(
      '2 filter views are left out',
    );
    const toXlsx = workbookConversion(sheets, ods, 'xlsx');
    expect(toXlsx.losses.some((l) => l.k === 'filter_views_left')).toBe(false);
  });
});
