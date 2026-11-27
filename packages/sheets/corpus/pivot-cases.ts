// Google Sheets' pivot tables, as evidence (docs/specs/029-sheets/pivot-tables.md): a source sheet of sales and a
// pivot table per case, each as the Sheets API's `PivotTable` names it, which `CORPUS_SOURCE=google-pivots` has Google
// Sheets make and export (corpus/google/pivot-tables.*). Each case's output is Google's answer for the pivot engine's
// tests; the files are Google's pivot tables in each format, for the readers'.
import type { WorkbookFile } from '../src/files/workbook-file';

const REGIONS = ['East', 'West', 'North'] as const;
const PRODUCTS = ['Apples', 'Pears', 'Plums', 'Figs'] as const;

// Serial day numbers of 2025-01-15 and on, a month or so apart: 1899-12-30 is day 0.
const DAY_2025_01_15 = 45672;

/** The source rows: Region, Product, Date, Units, Price, Rep; a blank Units and a text Units among them. */
export const PIVOT_SOURCE_ROWS: readonly (readonly (string | number | null)[])[] = Array.from(
  { length: 24 },
  (_, i) => [
    REGIONS[i % 3]!,
    PRODUCTS[(i * 7) % 4]!,
    DAY_2025_01_15 + i * 33,
    i === 5 ? null : i === 11 ? 'n/a' : ((i * 37) % 23) + 1,
    [1.25, 2.5, 0.75, 4][(i * 5) % 4]!,
    ['Ada', 'Bo', 'Cy', 'Di', 'Ed'][(i * 3) % 5]!,
  ],
);

export const PIVOT_SOURCE_HEADER = ['Region', 'Product', 'Date', 'Units', 'Price', 'Rep'] as const;

/** The source as a workbook: one sheet, "Sales", the header in row 1 and the dates formatted as dates. */
export const PIVOT_SOURCE: WorkbookFile = {
  sheets: [
    {
      name: 'Sales',
      rows: PIVOT_SOURCE_ROWS.length + 1,
      cols: PIVOT_SOURCE_HEADER.length,
      cells: [
        ...PIVOT_SOURCE_HEADER.map((v, c) => ({ r: 0, c, value: { k: 's' as const, v } })),
        ...PIVOT_SOURCE_ROWS.flatMap((row, i) =>
          row.flatMap((v, c) =>
            v === null
              ? []
              : [
                  {
                    r: i + 1,
                    c,
                    value: typeof v === 'number' ? { k: 'n' as const, v } : { k: 's' as const, v },
                    ...(c === 2 ? { format: 'yyyy-mm-dd' } : {}),
                  },
                ],
          ),
        ),
      ],
    },
  ],
};

// Source column offsets.
const REGION = 0;
const PRODUCT = 1;
const DATE = 2;
const UNITS = 3;
const PRICE = 4;
const REP = 5;

const sum = (offset: number) => ({ summarizeFunction: 'SUM', sourceColumnOffset: offset });
const group = (offset: number, more: Record<string, unknown> = {}) => ({
  sourceColumnOffset: offset,
  showTotals: true,
  sortOrder: 'ASCENDING',
  ...more,
});

/** Each case: its sheet's title and the Sheets API's `PivotTable` less its source, which is the whole of Sales. */
export const PIVOT_CASES: readonly { title: string; pivot: Record<string, unknown> }[] = [
  { title: 'Rows', pivot: { rows: [group(REGION)], values: [sum(UNITS)] } },
  {
    title: 'Rows and columns',
    pivot: { rows: [group(REGION)], columns: [group(PRODUCT)], values: [sum(UNITS)] },
  },
  {
    title: 'Two levels',
    pivot: {
      rows: [group(REGION), group(PRODUCT)],
      values: [sum(UNITS), { summarizeFunction: 'AVERAGE', sourceColumnOffset: PRICE }],
    },
  },
  {
    title: 'Repeat labels',
    pivot: {
      rows: [group(REGION, { repeatHeadings: true }), group(PRODUCT, { showTotals: false })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'Sort by value',
    pivot: {
      rows: [
        group(PRODUCT, { sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0, buckets: [] } }),
      ],
      values: [sum(UNITS), { summarizeFunction: 'COUNTA', sourceColumnOffset: UNITS }],
    },
  },
  {
    title: 'Percent of row',
    pivot: {
      rows: [group(REGION)],
      columns: [group(PRODUCT)],
      values: [{ ...sum(UNITS), calculatedDisplayType: 'PERCENT_OF_ROW_TOTAL' }],
    },
  },
  {
    title: 'Percent of column',
    pivot: {
      rows: [group(REGION)],
      columns: [group(PRODUCT)],
      values: [{ ...sum(UNITS), calculatedDisplayType: 'PERCENT_OF_COLUMN_TOTAL' }],
    },
  },
  {
    title: 'Percent of total',
    pivot: {
      rows: [group(REGION)],
      columns: [group(PRODUCT)],
      values: [{ ...sum(UNITS), calculatedDisplayType: 'PERCENT_OF_GRAND_TOTAL' }],
    },
  },
  {
    title: 'No totals, filtered',
    pivot: {
      rows: [group(REGION, { showTotals: false })],
      values: [sum(UNITS)],
      filterSpecs: [
        {
          columnOffsetIndex: PRODUCT,
          filterCriteria: { visibleValues: ['Apples', 'Plums'] },
        },
      ],
    },
  },
  {
    title: 'Filter by condition',
    pivot: {
      rows: [group(PRODUCT)],
      values: [sum(UNITS)],
      filterSpecs: [
        {
          columnOffsetIndex: UNITS,
          filterCriteria: {
            visibleByDefault: true,
            condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '8' }] },
          },
        },
      ],
    },
  },
  {
    title: 'By month',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'YEAR_MONTH' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By quarter',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'QUARTER' } } })],
      columns: [group(REGION)],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By interval',
    pivot: {
      rows: [group(UNITS, { groupRule: { histogramRule: { interval: 5, start: 0, end: 20 } } })],
      values: [{ summarizeFunction: 'COUNTA', sourceColumnOffset: UNITS }],
    },
  },
  {
    title: 'Custom groups',
    pivot: {
      rows: [
        group(PRODUCT, {
          groupRule: {
            manualRule: {
              groups: [
                {
                  groupName: { stringValue: 'Pome' },
                  items: [{ stringValue: 'Apples' }, { stringValue: 'Pears' }],
                },
              ],
            },
          },
        }),
      ],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'Calculated field',
    pivot: {
      rows: [group(REGION)],
      values: [
        sum(UNITS),
        { summarizeFunction: 'CUSTOM', name: 'Revenue', formula: '=SUM(Units*Price)' },
        { summarizeFunction: 'SUM', name: 'Revenue per row', formula: "='Units'*'Price'" },
      ],
    },
  },
  {
    title: 'Values as rows',
    pivot: {
      rows: [group(REGION)],
      columns: [group(PRODUCT)],
      values: [sum(UNITS), sum(PRICE)],
      valueLayout: 'VERTICAL',
    },
  },
  {
    title: 'Summaries',
    pivot: {
      rows: [group(REP)],
      values: [
        'COUNT',
        'COUNTUNIQUE',
        'MEDIAN',
        'MAX',
        'MIN',
        'PRODUCT',
        'STDEV',
        'STDEVP',
        'VAR',
        'VARP',
      ].map((summarizeFunction) => ({ summarizeFunction, sourceColumnOffset: UNITS })),
    },
  },
  { title: 'Columns only', pivot: { columns: [group(REGION)], values: [sum(UNITS)] } },
  {
    title: 'Two values, columns',
    pivot: {
      rows: [group(REGION)],
      columns: [group(PRODUCT)],
      values: [sum(UNITS), { summarizeFunction: 'COUNTA', sourceColumnOffset: PRODUCT }],
    },
  },
  {
    title: 'Filter by text',
    pivot: {
      rows: [group(PRODUCT)],
      values: [sum(UNITS)],
      filterSpecs: [
        {
          columnOffsetIndex: PRODUCT,
          filterCriteria: {
            visibleByDefault: true,
            condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'P' }] },
          },
        },
      ],
    },
  },
  {
    title: 'Filter by formula',
    pivot: {
      rows: [group(PRODUCT)],
      values: [sum(UNITS)],
      filterSpecs: [
        {
          columnOffsetIndex: UNITS,
          filterCriteria: {
            visibleByDefault: true,
            condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=Units>8' }] },
          },
        },
      ],
    },
  },
  {
    title: 'Custom summary',
    pivot: {
      rows: [group(REGION)],
      values: [
        {
          summarizeFunction: 'CUSTOM',
          name: 'Revenue',
          formula: "=SUM(ARRAYFORMULA('Units'*'Price'))",
        },
        { summarizeFunction: 'CUSTOM', name: 'Counted', formula: "=COUNT('Units')" },
      ],
    },
  },
  {
    title: 'By weekday',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'DAY_OF_WEEK' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By year',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'YEAR' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By month name',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'MONTH' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By year-quarter',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'YEAR_QUARTER' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By day',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'YEAR_MONTH_DAY' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By day-month',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'DAY_MONTH' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By day of month',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'DAY_OF_MONTH' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'By time',
    pivot: {
      rows: [group(DATE, { groupRule: { dateTimeRule: { type: 'HOUR_MINUTE_AMPM' } } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'Price intervals',
    pivot: {
      rows: [group(PRICE, { groupRule: { histogramRule: { interval: 1, start: 0, end: 4 } } })],
      values: [{ summarizeFunction: 'COUNTA', sourceColumnOffset: PRICE }],
    },
  },
  {
    title: 'Open intervals',
    pivot: {
      rows: [group(UNITS, { groupRule: { histogramRule: { interval: 10 } } })],
      values: [{ summarizeFunction: 'COUNTA', sourceColumnOffset: UNITS }],
    },
  },
  {
    title: 'Two column levels',
    pivot: {
      rows: [group(REP)],
      columns: [group(REGION), group(PRODUCT)],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'Sort by column item',
    pivot: {
      rows: [
        group(PRODUCT, {
          sortOrder: 'DESCENDING',
          valueBucket: { valuesIndex: 0, buckets: [{ stringValue: 'East' }] },
        }),
      ],
      columns: [group(REGION)],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'Group limit',
    pivot: {
      rows: [group(PRODUCT, { groupLimit: { countLimit: 2 } })],
      values: [sum(UNITS)],
    },
  },
  {
    title: 'Descending labels',
    pivot: {
      rows: [
        group(REGION, { sortOrder: 'DESCENDING' }),
        group(PRODUCT, { sortOrder: 'DESCENDING' }),
      ],
      values: [sum(UNITS)],
    },
  },
];
