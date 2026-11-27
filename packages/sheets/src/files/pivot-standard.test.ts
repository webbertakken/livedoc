// docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file" (D608 to D610): other apps' pivot tables read
// from their standard forms. Google Sheets' exports of every evidence case, Excel's own file (Apache POI's) and
// LibreOffice's saves of it read into pivot tables working out what each file says; what the model cannot hold kept.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseXml, type XmlElement } from '@livedoc/office-packages';
import { Workbook } from '../engine/workbook';
import { isError } from '../formula/values';
import type { SheetPivot } from '../objects/sheet-pivot';
import { sheetFromJson } from '../sheet-json';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { readOdsStandard } from './ods-pivot-standard';
import { filePivotOfStandard, pivotHidesResolved, type StandardPivot } from './pivot-standard';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile, type FileValue } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { WorkbookRecord } from '../workbook-record';
import { readXlsxStandard, XLSX_DATA_FIELD } from './xlsx-pivot-standard';

const CORPUS = join(import.meta.dirname, '..', '..', 'corpus');
const ANSWERS = JSON.parse(
  readFileSync(join(CORPUS, 'google', 'pivot-answers.json'), 'utf8'),
) as Record<string, unknown[][]>;
const BY = { id: 'x', name: 'x', color: '#000000' };

async function opened(data: Uint8Array) {
  const read = await readWorkbookFile(new Uint8Array(data), 'en-US');
  if (!read.ok) throw new Error(read.rejection);
  let n = 7;
  const made = sheetsFromFile(
    read.file,
    'en-US',
    () => (n = (n * 16807) % 2147483647) / 2147483647,
  );
  const sheets = made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `t${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );
  const wb = new Workbook({
    sheets,
    locale: 'en-US',
    now: () => 46303.5,
    rand: () => 0.5,
    cards: null,
  });
  // A sheet as Google answers it: blank as '', errors by code, each row without its trailing blanks.
  const grid = (title: string) => {
    const sheet = sheets.find((s) => s.title === title)!;
    const { rows, cols } = wb.shownExtent(sheet.id);
    return Array.from({ length: rows }, (_, r) => {
      const row = Array.from({ length: cols }, (_, c) => {
        const v = wb.value(sheet.id, r, c);
        return v === null ? '' : isError(v) ? v.e : v;
      });
      while (row.length && row[row.length - 1] === '') row.pop();
      return row;
    });
  };
  const pivotOf = (title: string) =>
    sheets
      .find((s) => s.title === title)!
      .layout.objects?.find((o): o is SheetPivot => o.kind === 'pivot');
  return { sheets, grid, pivotOf, losses: [...read.losses, ...made.losses], kept: made.kept };
}

// Google's answers compared as the grid shows them: errors by code, as the words are each engine's own.
const asGoogle = (rows: unknown[][]) =>
  rows.map((row) =>
    row.map((v) => (typeof v === 'string' && v.startsWith('#') ? v.split(' ')[0] : v)),
  );

const corpus = (path: string) => new Uint8Array(readFileSync(join(CORPUS, path)));

// The cases each export says whole, so each reads to Google's own answer (D610).
const WHOLE = [
  'Rows',
  'Rows and columns',
  'Two levels',
  'Sort by value',
  'Percent of row',
  'Percent of column',
  'Percent of total',
  'No totals, filtered',
  'Values as rows',
  'Columns only',
  'Two values, columns',
  'Two column levels',
  'Descending labels',
];

describe("Google Sheets' exports read", () => {
  it.each([
    [
      'xlsx',
      // Its groupings by `fieldGroup` read too (D617).
      [
        ...WHOLE,
        'Sort by column item',
        'By quarter',
        'Custom groups',
        'By year',
        'By month name',
        'By day-month',
        'Price intervals',
      ],
      [],
    ],
    // Its groupings are left out of the ODS, but for a custom group's field named on its own.
    ['ods', WHOLE, ['Custom groups']],
  ] as const)(
    'reads every pivot table of its .%s that says a case whole',
    async (ext, whole, kept) => {
      const book = await opened(corpus(`google/pivot-tables.${ext}`));
      const unread = book.losses.flatMap((l) => (l.k === 'pivot_unread' ? [l.sheet] : []));
      expect(unread).toEqual(kept);
      const equal = Object.keys(ANSWERS).filter(
        (title) =>
          book.pivotOf(title) &&
          JSON.stringify(book.grid(title)) === JSON.stringify(asGoogle(ANSWERS[title]!)),
      );
      expect(equal).toEqual([...whole].sort((a, b) => order(a) - order(b)));
      // A case the export says only in part works out what it says: unfiltered, ungrouped, its values summed.
      expect(book.grid('Filter by condition').at(-1)).toEqual(['Grand Total', 258]);
      expect(book.grid('By month')[1]).toEqual([45672, 1]);
      expect(book.grid('Repeat labels')[2]![0]).toBe('');
    },
  );

  it('reads a calculated field as Excel works one out, summing each column first', async () => {
    const book = await opened(corpus('google/pivot-tables.xlsx'));
    expect(book.pivotOf('Calculated field')!.values).toEqual([
      { col: expect.any(String), summary: 'SUM' },
      { formula: '=SUM(Units*Price)', summary: 'SUM', name: 'Revenue' },
      { formula: '=Units*Price', summary: 'SUM', name: 'Revenue per row' },
    ]);
    expect(book.grid('Calculated field')[1]).toEqual(['East', 103, 1751, 1751]);
  });

  it('names what it keeps in the import report', async () => {
    const book = await opened(corpus('google/pivot-tables.ods'));
    const line = importReport(book.losses).find((l) => l.k === 'pivot_unread')!;
    expect(importReportLine(line)).toBe(
      '1 pivot table LiveDoc cannot work out is kept as the file holds it: Custom groups',
    );
  });

  it('reads its groupings by fieldGroup into the model (D617)', async () => {
    const book = await opened(corpus('google/pivot-tables.xlsx'));
    const grouping = (title: string) => book.pivotOf(title)!.rows![0]!.grouping;
    expect(grouping('By quarter')).toEqual({ k: 'date', rule: 'quarter' });
    expect(grouping('By day-month')).toEqual({ k: 'date', rule: 'dayMonth' });
    expect(grouping('Price intervals')).toEqual({ k: 'interval', size: 1, start: 0, end: 4 });
    expect(grouping('Custom groups')).toEqual({
      k: 'custom',
      groups: [{ name: 'Pome', items: ['Apples', 'Pears'] }],
    });
  });

  it('writes a read pivot table with its own record, read back the same', async () => {
    const book = await opened(corpus('google/pivot-tables.xlsx'));
    const record = WorkbookRecord.create({ locale: 'en-US', timeZone: 'UTC' });
    for (const format of ['xlsx', 'ods'] as const) {
      const again = await opened(writeWorkbook(book.sheets, record, 'P', format).data);
      expect(again.losses.filter((l) => l.k.startsWith('pivot'))).toEqual([]);
      for (const title of WHOLE) expect(again.grid(title)).toEqual(book.grid(title));
    }
  });
});

const order = (title: string) => Object.keys(ANSWERS).indexOf(title);

describe("Excel's and LibreOffice's files read", () => {
  // Excel's: a pivot table hiding an item of its rows and a date of its columns, and one over a table, by its name.
  it("reads Excel's pivot table with the items it hides, and keeps one over a table", async () => {
    const book = await opened(corpus('excel/ExcelPivotTableSample.xlsx'));
    expect(book.losses.filter((l) => l.k.startsWith('pivot'))).toEqual([
      { k: 'pivot_unread', sheet: 'Tabelle3' },
    ]);
    expect(book.grid('Tabelle2').slice(2)).toEqual([
      ['Summe von Field2', 'Field3'],
      ['Field1', 44562, 44564, 'Grand Total'],
      ['a', 1, '', 1],
      ['c', '', 3, 3],
      ['Grand Total', 1, 3, 4],
    ]);
    expect(book.pivotOf('Tabelle2')!.filters).toEqual([
      { col: expect.any(String), cond: { values: ['a', 'c'] } },
      { col: expect.any(String), cond: { values: ['1-Jan', '3-Jan'] } },
    ]);
    // Its caches' records go with the cache read; the kept pivot table keeps its own.
    const parts = book.kept!.parts.map((p) => p.name);
    expect(parts).not.toContain('xl/pivotCache/pivotCacheRecords1.xml');
    expect(parts).toContain('xl/pivotCache/pivotCacheRecords2.xml');
  });

  it.each(['ods', 'xlsx'])(
    "reads LibreOffice's .%s of it, the table's range named",
    async (ext) => {
      const book = await opened(corpus(`libreoffice/ExcelPivotTableSample.${ext}`));
      expect(book.losses.filter((l) => l.k.startsWith('pivot'))).toEqual([]);
      expect(book.grid('Tabelle2').slice(4)).toEqual([
        ['a', 1, '', 1],
        ['c', '', 3, 3],
        ['Grand Total', 1, 3, 4],
      ]);
      expect(book.grid('Tabelle3')).toEqual([
        ['Field1', 'Summe von Field2'],
        ['x', 11],
        ['z', 33],
        ['Grand Total', 44],
      ]);
    },
  );
});

// A pivot table part and its cache over Sales!A1:C4 (Region, Units, Price), written as `table` and `cache` say.
const CACHE = (fields = '', source = '<worksheetSource ref="A1:C4" sheet="Sales"/>') =>
  `<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cacheSource type="worksheet">${source}</cacheSource><cacheFields>` +
  '<cacheField name="Region"><sharedItems><s v="East"/><m/><b v="1"/><e v="#N/A"/><d v="2025-01-15T00:00:00Z"/><n v="2"/></sharedItems></cacheField>' +
  '<cacheField name="Units"><sharedItems/></cacheField><cacheField name="Price"/>' +
  `${fields}</cacheFields></pivotCacheDefinition>`;
const TABLE = (inner: string, attrs = '', location = 'C3:D6') =>
  `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${attrs}><location ref="${location}"/>${inner}</pivotTableDefinition>`;
const FIELDS = (region = '<pivotField axis="axisRow"/>') =>
  `<pivotFields>${region}<pivotField dataField="1"/><pivotField/></pivotFields>`;
const ROWS = '<rowFields><field x="0"/></rowFields>';
const DATA = (attrs = '') => `<dataFields><dataField fld="1"${attrs}/></dataFields>`;
const read = (table: string, cache = CACHE(), sheets = ['Sales', 'Report']) =>
  readXlsxStandard(table, cache, 'Report', sheets);

describe('the XLSX standard form read', () => {
  it('reads rows, a value and its place, its source on another sheet', () => {
    const p = read(TABLE(FIELDS() + ROWS + DATA(' name="Sum of Units"')))!;
    expect(p).toMatchObject({
      at: { r: 2, c: 2 },
      output: { rows: 4, cols: 2 },
      source: { sheet: 'Sales', range: { r1: 0, c1: 0, r2: 3, c2: 2 } },
      headers: ['Region', 'Units', 'Price'],
      rows: [{ col: 0, subtotals: true }],
      values: [{ col: 1, summary: 'SUM', label: 'Sum of Units' }],
      grand: { rows: true, cols: true },
      valuesAsRows: false,
    });
    expect(read(TABLE(FIELDS() + ROWS), CACHE(), ['Report'])).toBeNull();
    expect(readXlsxStandard(TABLE(''), CACHE(), 'Sales', ['Sales'])!.source.sheet).toBeNull();
  });

  it('maps every subtotal and Show As back, and keeps one it lacks', () => {
    const fns = [
      'count',
      'countNums',
      'average',
      'max',
      'min',
      'product',
      'stdDev',
      'stdDevp',
      'var',
      'varp',
    ];
    expect(fns.map((fn) => read(TABLE(DATA(` subtotal="${fn}"`)))!.values[0]!.summary)).toEqual([
      'COUNTA',
      'COUNT',
      'AVERAGE',
      'MAX',
      'MIN',
      'PRODUCT',
      'STDEV',
      'STDEVP',
      'VAR',
      'VARP',
    ]);
    expect(
      ['percentOfRow', 'percentOfCol', 'percentOfTotal', 'normal'].map(
        (s) => read(TABLE(DATA(` showDataAs="${s}"`)))!.values[0]!.showAs,
      ),
    ).toEqual(['row', 'column', 'total', undefined]);
    expect(read(TABLE(DATA(' showDataAs="runTotal"')))).toBeNull();
    expect(read(TABLE(DATA(' subtotal="countUnique"')))).toBeNull();
  });

  it('reads a calculated field, and keeps a value on a field it cannot read', () => {
    const calc = '<cacheField name="Revenue" formula="Units*Price" databaseField="0"/>';
    const p = read(
      TABLE('<dataFields><dataField fld="3" name="SUM of Revenue"/></dataFields>'),
      CACHE(calc),
    )!;
    expect(p.values).toEqual([
      { formula: '=Units*Price', name: 'Revenue', summary: 'SUM', label: 'SUM of Revenue' },
    ]);
    const group = '<cacheField name="g" databaseField="0"><fieldGroup base="0"/></cacheField>';
    expect(read(TABLE('<dataFields><dataField fld="3"/></dataFields>'), CACHE(group))).toBeNull();
    expect(read(TABLE('<dataFields><dataField fld="4"/></dataFields>'), CACHE(calc))).toBeNull();
    expect(
      read(
        TABLE('<dataFields><dataField fld="3"/></dataFields>'),
        CACHE('<cacheField name="x" databaseField="0"/>'),
      ),
    ).toBeNull();
  });

  it('keeps a source not a range of the workbook, a grouped field, a calculated item', () => {
    expect(read(TABLE(''), CACHE('', '<worksheetSource name="Table1"/>'))).toBeNull();
    expect(read(TABLE(''), CACHE('', '<worksheetSource ref="A1:C4"/>'))).toBeNull();
    expect(
      read(TABLE(''), CACHE('', '<worksheetSource ref="nonsense" sheet="Sales"/>')),
    ).toBeNull();
    expect(read(TABLE(''), CACHE().replace('type="worksheet"', 'type="external"'))).toBeNull();
    expect(read(TABLE(''), CACHE().replace(/<cacheSource.*<\/cacheSource>/, ''))).toBeNull();
    expect(read(TABLE(''), 'not xml')).toBeNull();
    expect(read('not xml')).toBeNull();
    expect(read(TABLE('<calculatedItems/>'))).toBeNull();
    expect(
      read(
        '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
      ),
    ).toBeNull();
    expect(read(TABLE('', '', 'nonsense'))).toBeNull();
    // Too few fields for its source, or a source column on an axis grouped in a way it does not read.
    expect(read(TABLE(''), CACHE().replace('<cacheField name="Price"/>', ''))).toBeNull();
    expect(
      read(
        TABLE(
          '<pivotFields><pivotField/><pivotField/><pivotField axis="axisRow"/></pivotFields><rowFields><field x="2"/></rowFields>',
        ),
        CACHE().replace(
          '<cacheField name="Price"/>',
          '<cacheField name="Price"><fieldGroup/></cacheField>',
        ),
      ),
    ).toBeNull();
    // An axis field past the source's columns.
    expect(read(TABLE('<rowFields><field x="3"/></rowFields>'))).toBeNull();
    expect(read(TABLE('<pageFields><pageField fld="-1"/></pageFields>'))).toBeNull();
  });

  // standard-mapping.md "Pivot tables in the file", XLSX grouping (D617).
  describe('grouping', () => {
    const DERIVED = (group: string, attrs = '') =>
      `<cacheField name="g" databaseField="0"><fieldGroup base="2"${attrs}>${group}</fieldGroup></cacheField>`;
    const ON_ROWS = (items = '') =>
      `<pivotFields><pivotField/><pivotField dataField="1"/><pivotField/><pivotField axis="axisRow">${items}</pivotField></pivotFields><rowFields><field x="3"/></rowFields>${DATA()}`;
    const groupingOf = (table: string, cache: string) =>
      read(TABLE(table), cache)?.rows[0]?.grouping;

    it('reads each date level of a derived field, its bounds left unread', () => {
      const levels = ['seconds', 'minutes', 'hours', 'days', 'months', 'quarters', 'years'];
      expect(
        levels.map((by) =>
          groupingOf(
            ON_ROWS(),
            CACHE(
              DERIVED(
                `<rangePr groupBy="${by}" startDate="2025-01-01T00:00:00" endDate="2025-02-01T00:00:00"/>`,
              ),
            ),
          ),
        ),
      ).toEqual(
        ['second', 'minute', 'hour', 'dayMonth', 'month', 'quarter', 'year'].map((rule) => ({
          k: 'date',
          rule,
        })),
      );
      expect(
        read(TABLE(ON_ROWS()), CACHE(DERIVED('<rangePr groupBy="months"/>')))!.rows[0]!.col,
      ).toBe(2);
    });

    it('reads number intervals, on a column of its own or in place', () => {
      expect(
        groupingOf(
          ON_ROWS(),
          CACHE(
            DERIVED(
              '<rangePr autoStart="0" autoEnd="0" startNum="1" endNum="9" groupInterval="2"/>',
            ),
          ),
        ),
      ).toEqual({ k: 'interval', size: 2, start: 1, end: 9 });
      expect(groupingOf(ON_ROWS(), CACHE(DERIVED('<rangePr autoEnd="0" endNum="4"/>')))).toEqual({
        k: 'interval',
        size: 1,
        end: 4,
      });
      expect(
        groupingOf(ON_ROWS(), CACHE(DERIVED('<rangePr groupBy="range" autoStart="0"/>'))),
      ).toEqual({
        k: 'interval',
        size: 1,
        start: 0,
      });
      const inPlace = CACHE().replace(
        '<cacheField name="Price"/>',
        '<cacheField name="Price"><fieldGroup><rangePr groupInterval="5"/></fieldGroup></cacheField>',
      );
      const table = `<pivotFields><pivotField/><pivotField dataField="1"/><pivotField axis="axisRow"/></pivotFields><rowFields><field x="2"/></rowFields>${DATA()}`;
      expect(groupingOf(table, inPlace)).toEqual({ k: 'interval', size: 5 });
    });

    it('reads discrete items as custom groups, an item alone in its own name left itself', () => {
      const cache = CACHE(
        '<cacheField name="g" databaseField="0"><fieldGroup base="0"><discretePr><x v="0"/><x v="1"/><x v="0"/><x v="2"/><x v="3"/><x v="2"/></discretePr><groupItems><s v="Mixed"/><s v=""/><s v="Two"/><s v="#N/A"/></groupItems></fieldGroup></cacheField>',
      );
      expect(groupingOf(ON_ROWS(), cache)).toEqual({
        k: 'custom',
        groups: [
          { name: 'Mixed', items: ['East', 'TRUE'] },
          { name: 'Two', items: ['#N/A', '2'] },
          { name: '#N/A', items: ['45672'] },
        ],
      });
      expect(read(TABLE(ON_ROWS()), cache)!.rows[0]!.col).toBe(0);
    });

    it('reads a custom grouping of items each in its own name as no grouping', () => {
      const cache = CACHE(
        '<cacheField name="g" databaseField="0"><fieldGroup base="0"><discretePr><x v="0"/></discretePr><groupItems><s v="East"/></groupItems></fieldGroup></cacheField>',
      );
      expect(read(TABLE(ON_ROWS()), cache)!.rows).toEqual([{ col: 0, subtotals: true }]);
    });

    it('reads a source column whose fieldGroup only names its parent as ungrouped', () => {
      const cache = CACHE(
        DERIVED('<rangePr groupBy="years"/>').replace('base="2"', 'base="2"'),
      ).replace(
        '<cacheField name="Price"/>',
        '<cacheField name="Price"><fieldGroup par="3"/></cacheField>',
      );
      const onPrice = `<pivotFields><pivotField/><pivotField dataField="1"/><pivotField axis="axisRow"/></pivotFields><rowFields><field x="2"/></rowFields>${DATA()}`;
      expect(read(TABLE(onPrice), cache)!.rows).toEqual([{ col: 2, subtotals: true }]);
    });

    it('keeps a grouping it does not read', () => {
      const keeps = [
        [ON_ROWS(), CACHE(DERIVED('<rangePr groupBy="days" groupInterval="7"/>'))],
        [ON_ROWS(), CACHE(DERIVED('<rangePr groupBy="weeks"/>'))],
        [ON_ROWS(), CACHE(DERIVED('<rangePr groupInterval="0"/>'))],
        [ON_ROWS(), CACHE(DERIVED('<rangePr groupBy="years"/>', ' par="4"'))],
        [ON_ROWS(), CACHE(DERIVED('<rangePr groupBy="years"/>').replace('base="2"', 'base="7"'))],
        [ON_ROWS(), CACHE(DERIVED(''))],
        [
          ON_ROWS('<items><item x="0" h="1"/></items>'),
          CACHE(DERIVED('<rangePr groupBy="years"/>')),
        ],
        [
          ON_ROWS(),
          CACHE(
            '<cacheField name="g" databaseField="0"><fieldGroup base="0"><discretePr><x v="9"/></discretePr><groupItems/></fieldGroup></cacheField>',
          ),
        ],
        [
          ON_ROWS(),
          CACHE(
            '<cacheField name="g" databaseField="0"><fieldGroup base="0"><discretePr><x v="0"/></discretePr></fieldGroup></cacheField>',
          ),
        ],
        [
          // Sorted by a value in an item of a grouped column field.
          `<pivotFields><pivotField axis="axisRow"><autoSortScope><pivotArea><references count="2"><reference field="4294967294"><x v="0"/></reference><reference field="3"><x v="0"/></reference></references></pivotArea></autoSortScope></pivotField><pivotField dataField="1"/><pivotField/><pivotField axis="axisCol"/></pivotFields><rowFields><field x="0"/></rowFields><colFields><field x="3"/></colFields>${DATA()}`,
          CACHE(DERIVED('<rangePr groupBy="years"/>')),
        ],
        [
          `<pivotFields><pivotField/><pivotField dataField="1"/><pivotField/><pivotField axis="axisPage"/></pivotFields><pageFields><pageField fld="3"/></pageFields>${DATA()}`,
          CACHE(DERIVED('<rangePr groupBy="years"/>')),
        ],
      ] as const;
      expect(keeps.map(([table, cache]) => read(TABLE(table), cache))).toEqual(
        keeps.map(() => null),
      );
      expect(read(TABLE(ON_ROWS()), CACHE(DERIVED('<rangePr groupBy="years"/>')))).not.toBeNull();
    });
  });

  it('reads order, totals, grand totals, page fields and Values as rows', () => {
    const fields =
      '<pivotFields><pivotField axis="axisRow" sortType="descending" defaultSubtotal="0"/><pivotField axis="axisRow"/><pivotField axis="axisPage"/></pivotFields>';
    const p = read(
      TABLE(
        `${fields}<rowFields><field x="0"/><field x="1"/><field x="-2"/></rowFields><pageFields><pageField fld="2"/></pageFields>${DATA()}`,
        ' rowGrandTotals="0" colGrandTotals="false"',
      ),
    )!;
    expect(p.rows).toEqual([
      { col: 0, desc: true, subtotals: false },
      { col: 1, subtotals: true },
    ]);
    expect(p).toMatchObject({ valuesAsRows: true, grand: { rows: false, cols: false } });
    // Excel lays page fields out above the location, a row between: the place is above them.
    expect(p.at).toEqual({ r: 0, c: 2 });
    expect(p.output).toEqual({ rows: 6, cols: 2 });
    expect(
      read(
        TABLE(
          `${fields}<pageFields><pageField fld="2"/><pageField fld="1"/></pageFields>`,
          '',
          'A2:B3',
        ),
      )!.at,
    ).toEqual({ r: 0, c: 0 });
  });

  it('reads hidden items by their values, and keeps an item it cannot find', () => {
    const items = (h: string) =>
      FIELDS(`<pivotField axis="axisRow"><items>${h}<item t="default"/></items></pivotField>`);
    const hidden = [0, 1, 2, 3, 4, 5].map((x) => `<item x="${x}" h="1"/>`).join('');
    expect(read(TABLE(items(hidden) + ROWS))!.hides).toEqual([
      {
        col: 0,
        hides: [
          { v: { k: 's', v: 'East' } },
          { v: null },
          { v: { k: 'b', v: true } },
          { v: { k: 'e', v: '#N/A' } },
          { v: { k: 'n', v: 45672 } },
          { v: { k: 'n', v: 2 } },
        ],
      },
    ]);
    expect(read(TABLE(items('<item x="9" h="1"/>') + ROWS))).toBeNull();
    const odd = (item: string) => CACHE().replace('<s v="East"/>', item);
    expect(read(TABLE(items('<item x="0" h="1"/>') + ROWS), odd('<n v="x"/>'))).toBeNull();
    expect(read(TABLE(items('<item x="0" h="1"/>') + ROWS), odd('<d v="never"/>'))).toBeNull();
    expect(read(TABLE(items('<item x="0" h="1"/>') + ROWS), odd('<x/>'))).toBeNull();
    // Units lists no items: none of them can be hidden.
    expect(
      read(
        TABLE(
          `<pivotFields><pivotField/><pivotField axis="axisCol"><items><item x="0" h="true"/></items></pivotField></pivotFields><colFields><field x="1"/></colFields>`,
        ),
      ),
    ).toBeNull();
  });

  it('reads a sort by a value, in a column item too', () => {
    const scope = (refs: string) =>
      `<autoSortScope><pivotArea><references>${refs}</references></pivotArea></autoSortScope>`;
    const ref = (field: number, x?: number) =>
      `<reference field="${field}">${x === undefined ? '' : `<x v="${x}"/>`}</reference>`;
    const table = (refs: string) =>
      read(
        TABLE(
          `<pivotFields><pivotField axis="axisCol"><items><item x="0"/><item x="1"/><item x="5"/></items></pivotField><pivotField axis="axisRow" sortType="descending">${scope(refs)}</pivotField><pivotField/></pivotFields><rowFields><field x="1"/></rowFields><colFields><field x="0"/></colFields>${DATA()}`,
        ),
      );
    expect(table(ref(XLSX_DATA_FIELD, 0))!.rows[0]!.sortBy).toEqual({ value: 0 });
    expect(table(ref(-2, 0) + ref(0, 0))!.rows[0]!.sortBy).toEqual({ value: 0, item: ['East'] });
    expect(table(ref(-2, 0) + ref(0, 1))!.rows[0]!.sortBy).toEqual({ value: 0, item: [''] });
    expect(table(ref(-2, 0) + ref(0, 2))!.rows[0]!.sortBy).toEqual({ value: 0, item: ['2'] });
    expect(table(ref(0, 0))!.rows[0]!.sortBy).toBeUndefined();
    expect(table(ref(-2))).toBeNull();
    expect(table(ref(-2, 0) + ref(0, 7))).toBeNull();
    expect(table(ref(-2, 0) + ref(2, 0))).toBeNull();
  });
});

const ODS = (fields: string, attrs = '', source = "'Sales'.A1:'Sales'.C4") =>
  (
    parseXml(
      `<table:data-pilot-table xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" xmlns:tableooo="http://openoffice.org/2009/table" table:target-range-address="Report.B2:Report.C6"${attrs}><table:source-cell-range table:cell-range-address="${source}"/>${fields}</table:data-pilot-table>`,
    ) as { root: XmlElement }
  ).root;
const FIELD = (name: string, orientation: string, inner = '', attrs = '') =>
  `<table:data-pilot-field table:source-field-name="${name}" table:orientation="${orientation}"${attrs}>${inner}</table:data-pilot-field>`;
const LEVEL = (inner: string, attrs = '') =>
  `<table:data-pilot-level${attrs}>${inner}</table:data-pilot-level>`;
const readOds = (table: XmlElement, sheets = ['Sales', 'Report']) =>
  readOdsStandard(table, sheets, () => ['Region', 'Units', 'Units']);

describe('the ODF standard form read', () => {
  it('reads fields by their names, values and their place', () => {
    const p = readOds(
      ODS(
        FIELD('Region', 'row') +
          FIELD('Units', 'hidden') +
          FIELD('Units2', 'data', '', ' table:function="countnums" tableooo:display-name="Count"') +
          FIELD('', 'row', '', ' table:is-data-layout-field="true"') +
          FIELD('Units', 'data'),
      ),
    )!;
    expect(p).toMatchObject({
      sheet: 'Report',
      at: { r: 1, c: 1 },
      output: { rows: 5, cols: 2 },
      source: { sheet: 'Sales' },
      rows: [{ col: 0, subtotals: true }],
      values: [
        { col: 2, summary: 'COUNT', label: 'Count' },
        { col: 1, summary: 'SUM' },
      ],
      valuesAsRows: true,
      grand: { rows: true, cols: true },
    });
    expect(readOds(ODS('', '', "'Report'.A1:'Report'.C4"))!.source.sheet).toBeNull();
  });

  it('maps every function and Show As back, and keeps what it lacks', () => {
    const fns = [
      'auto',
      'sum',
      'count',
      'average',
      'max',
      'min',
      'product',
      'stdev',
      'stdevp',
      'var',
      'varp',
      'median',
    ];
    expect(
      fns.map(
        (fn) =>
          readOds(ODS(FIELD('Units', 'data', '', ` table:function="${fn}"`)))!.values[0]!.summary,
      ),
    ).toEqual([
      'SUM',
      'SUM',
      'COUNTA',
      'AVERAGE',
      'MAX',
      'MIN',
      'PRODUCT',
      'STDEV',
      'STDEVP',
      'VAR',
      'VARP',
      'MEDIAN',
    ]);
    const ref = (type: string) =>
      readOds(
        ODS(FIELD('Units', 'data', `<table:data-pilot-field-reference table:type="${type}"/>`)),
      );
    expect(
      ['row-percentage', 'column-percentage', 'total-percentage', 'none'].map(
        (t) => ref(t)!.values[0]!.showAs,
      ),
    ).toEqual(['row', 'column', 'total', undefined]);
    expect(ref('running-total')).toBeNull();
    expect(readOds(ODS(FIELD('Units', 'data', '', ' table:function="countunique"')))).toBeNull();
  });

  it('keeps a source or target not of the workbook, a field it cannot find, a grouping', () => {
    expect(readOds(ODS(''), ['Report'])).toBeNull();
    expect(readOds(ODS(''), ['Sales'])).toBeNull();
    expect(readOds(ODS('', '', 'nonsense'))).toBeNull();
    expect(readOds(ODS(FIELD('Product2', 'row')))).toBeNull();
    expect(readOds(ODS(FIELD('Region', 'row', '<table:data-pilot-groups/>')))).toBeNull();
    const bare = (
      parseXml(
        '<table:data-pilot-table xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" table:target-range-address="Report.A1:Report.B2"/>',
      ) as { root: XmlElement }
    ).root;
    expect(readOds(bare)).toBeNull();
  });

  it('reads order, a sort by a value, subtotals, repeated labels, grand totals and hidden members', () => {
    const sort = (mode: string, order = 'descending', more = '') =>
      `<table:data-pilot-sort-info table:sort-mode="${mode}" table:order="${order}"${more}/>`;
    const p = readOds(
      ODS(
        FIELD(
          'Region',
          'row',
          LEVEL(
            `<table:data-pilot-subtotals/>${sort('name')}`,
            ' calcext:repeat-item-labels="true"',
          ),
        ) +
          FIELD('Units', 'row', LEVEL(sort('data', 'descending', ' table:data-field="Units2"'))) +
          FIELD(
            'Units2',
            'column',
            LEVEL(
              `${sort('manual')}<table:data-pilot-members><table:data-pilot-member table:name="3" table:display="false"/><table:data-pilot-member table:name="4"/><table:data-pilot-sort-info/></table:data-pilot-members>`,
              ' calcext:repeat-item-labels="true"',
            ),
          ) +
          FIELD('Units', 'page', LEVEL('<table:data-pilot-members/>')) +
          FIELD('Units2', 'data'),
        ' table:grand-total="row"',
      ),
    )!;
    expect(p.rows).toEqual([
      { col: 0, desc: true, subtotals: false, repeat: true },
      { col: 1, desc: true, subtotals: true, sortBy: { value: 0 } },
    ]);
    expect(p.columns).toEqual([{ col: 2, subtotals: true }]);
    expect(p.hides).toEqual([
      { col: 2, hides: [{ shown: '3' }] },
      { col: 1, hides: [] },
    ]);
    expect(p.grand).toEqual({ rows: true, cols: false });
    expect(readOds(ODS('', ' table:grand-total="none"'))!.grand).toEqual({
      rows: false,
      cols: false,
    });
    expect(readOds(ODS('', ' table:grand-total="column"'))!.grand).toEqual({
      rows: false,
      cols: true,
    });
    expect(
      readOds(
        ODS(
          FIELD('Region', 'column', LEVEL(sort('data', 'ascending', ' table:data-field="Price"'))),
        ),
      ),
    ).toBeNull();
    expect(readOds(ODS(FIELD('Region', 'row', LEVEL(sort('data')))))).toBeNull();
    // A field with no level, and no orientation: hidden.
    expect(
      readOds(
        ODS(
          FIELD('Region', 'row') +
            '<table:data-pilot-field table:source-field-name="Units"/><other/>',
        ),
      )!.rows,
    ).toEqual([{ col: 0, subtotals: true }]);
  });
});

const standard = (over: Partial<StandardPivot>): StandardPivot => ({
  at: { r: 0, c: 4 },
  output: { rows: 3, cols: 2 },
  source: { sheet: null, range: { r1: 0, c1: 0, r2: 4, c2: 1 } },
  headers: ['Region', 'Units'],
  rows: [],
  columns: [],
  values: [],
  hides: [],
  valuesAsRows: false,
  grand: { rows: true, cols: true },
  ...over,
});

describe('a standard form in the model', () => {
  it('turns subtotals into the next group’s Show Totals, the grand totals into the outermost’s', () => {
    const p = filePivotOfStandard(
      standard({
        rows: [
          { col: 0, subtotals: false, repeat: true, sortBy: { value: 0 } },
          { col: 1, subtotals: true, desc: true },
        ],
        columns: [{ col: 1, subtotals: true }],
        values: [
          { col: 1, summary: 'SUM', label: 'SUM of Units' },
          { col: 1, summary: 'COUNTA', label: 'Count', showAs: 'row' },
          { formula: '=Units*2', name: 'Twice', summary: 'SUM', showAs: 'total' },
        ],
        valuesAsRows: true,
        grand: { rows: false, cols: true },
      }),
    );
    expect(p.fields).toEqual({
      rows: [
        { col: 0, sortBy: { value: 0 }, totals: false, repeat: true },
        { col: 1, desc: true, totals: false },
      ],
      columns: [{ col: 1 }],
      values: [
        { col: 1, summary: 'SUM' },
        { col: 1, summary: 'COUNTA', showAs: 'row', name: 'Count' },
        { formula: '=Units*2', summary: 'SUM', name: 'Twice', showAs: 'total' },
      ],
      valuesAsRows: true,
    });
    expect(
      filePivotOfStandard(standard({ values: [{ col: 5, summary: 'SUM', label: 'SUM of ' }] }))
        .fields.values![0],
    ).toEqual({ col: 5, summary: 'SUM' });
    expect(
      filePivotOfStandard(standard({ values: [{ col: 0, summary: 'SUM' }], valuesAsRows: true }))
        .fields,
    ).toEqual({ values: [{ col: 0, summary: 'SUM' }] });
    expect(filePivotOfStandard(standard({ hides: [{ col: 0, hides: [] }] })).hides).toBeUndefined();
  });

  it('matches hidden items to the source by value or by text as shown', () => {
    const values: (FileValue | null)[] = [
      { k: 's', v: 'East' },
      { k: 'n', v: 2.5 },
      null,
      { k: 'b', v: true },
    ];
    const p = (hides: StandardPivot['hides']) =>
      pivotHidesResolved(
        filePivotOfStandard(standard({ hides })),
        (r) => values[r - 1]!,
        (r) => ['East', '2.50', '', 'TRUE'][r - 1]!,
      );
    expect(
      p([{ col: 0, hides: [{ v: { k: 's', v: 'East' } }, { v: null }] }]).fields.filters,
    ).toEqual([{ col: 0, cond: { values: ['2.50', 'TRUE'] } }]);
    expect(
      p([{ col: 1, hides: [{ shown: '2.5' }, { shown: 'TRUE' }, { v: { k: 'n', v: 3 } }] }]).fields
        .filters,
    ).toEqual([{ col: 1, cond: { values: ['East', ''] } }]);
    expect(p([{ col: 0, hides: [{ shown: 'West' }] }]).fields.filters).toBeUndefined();
    expect(
      p([{ col: 0, hides: [{ v: { k: 'n', v: 2.5 } }, { v: { k: 'n', v: 2.5 } }] }]).hides,
    ).toBeUndefined();
    const plain = filePivotOfStandard(standard({}));
    expect(
      pivotHidesResolved(
        plain,
        () => null,
        () => '',
      ),
    ).toBe(plain);
  });
});

describe('a standard form missing what it may leave out', () => {
  it('reads XLSX defaults: a worksheet source, unnamed fields, fields with no options', () => {
    const p = read(
      TABLE(`${ROWS}<pageFields><pageField fld="2"/></pageFields>`),
      CACHE()
        .replace(' type="worksheet"', '')
        .replace('<cacheField name="Price"/>', '<cacheField/>'),
    )!;
    expect(p.headers).toEqual(['Region', 'Units', '']);
    expect(p.rows).toEqual([{ col: 0, subtotals: true }]);
    expect(p.hides).toEqual([
      { col: 0, hides: [] },
      { col: 2, hides: [] },
    ]);
    expect(read(TABLE('').replace(' ref="C3:D6"', ''))).toBeNull();
    const scoped = read(
      TABLE(
        `<pivotFields><pivotField axis="axisRow"><autoSortScope><pivotArea><references><reference field="-2"><x/></reference></references></pivotArea></autoSortScope></pivotField></pivotFields>${ROWS}${DATA()}`,
      ),
    )!;
    expect(scoped.rows[0]!.sortBy).toEqual({ value: 0 });
  });

  it('reads ODF defaults, and keeps a field with no name', () => {
    const noAddress = (
      parseXml(
        '<table:data-pilot-table xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" table:target-range-address="Report.A1:Report.B2"><table:source-cell-range/></table:data-pilot-table>',
      ) as { root: XmlElement }
    ).root;
    expect(readOds(noAddress)).toBeNull();
    expect(readOds(ODS('<table:data-pilot-field table:orientation="row"/>'))).toBeNull();
    const p = readOds(
      ODS(
        FIELD('Units', 'data', '<table:data-pilot-field-reference/>') +
          FIELD(
            'Region',
            'page',
            LEVEL(
              '<table:data-pilot-members><table:data-pilot-member table:display="false"/></table:data-pilot-members>',
            ),
          ),
      ),
    )!;
    expect(p.values).toEqual([{ col: 1, summary: 'SUM' }]);
    expect(p.hides).toEqual([{ col: 0, hides: [{ shown: '' }] }]);
  });

  it('names a true or false item as LibreOffice does', () => {
    const p = pivotHidesResolved(
      filePivotOfStandard(standard({ hides: [{ col: 0, hides: [{ shown: 'FALSE' }] }] })),
      (r) => ({ k: 'b', v: r === 1 }),
      (r) => (r === 1 ? 'yes' : 'no'),
    );
    expect(p.fields.filters).toEqual([{ col: 0, cond: { values: ['yes'] } }]);
  });
});
