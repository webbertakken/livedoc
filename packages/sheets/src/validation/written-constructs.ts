// One workbook per construct group of the mapping (docs/specs/029-sheets/standard-mapping.md), as a file holds it:
// what the schema validation writes in every format (written-files.validate.ts).
import type { NumberFormatKind } from '../sheet';
import { formatCodeOf } from '../files/number-format-code';
import type { FileChart, FileChartSeries } from '../files/file-charts';
import type { FileCell, FileSheet, WorkbookFile } from '../files/workbook-file';
import type { FileValidationRule } from '../files/file-validation';

const sheet = (name: string, cells: FileCell[], rows = 10, cols = 6) => ({
  name,
  rows,
  cols,
  cells,
});

const KINDS: readonly NumberFormatKind[] = [
  'auto',
  'number',
  'percent',
  'currency',
  'accounting',
  'financial',
  'scientific',
  'date',
  'time',
  'datetime',
  'duration',
  'text',
];

const CUSTOM_CODES = [
  '0.000',
  '#,##0.00;[Red]-#,##0.00',
  'dddd d mmmm yyyy',
  '"km "0.0',
  '# ?/?',
  '0.0,,',
];

// Every criterion of a validation rule (standard-mapping.md "Validation in the file"), one a column or cell.
export const VALIDATIONS: FileValidationRule[] = [
  {
    ranges: [{ r1: 1, c1: 0, r2: 5, c2: 0 }],
    is: 'list',
    opts: [{ v: 'To Do', c: '#e6f4ea' }, { v: 'Done' }],
    multi: true,
    help: 'Pick a status',
  },
  { ranges: [{ r1: 1, c1: 1, r2: 5, c2: 1 }], is: 'range', src: "'My Lists'!A1:A2", show: 'arrow' },
  { ranges: [{ r1: 1, c1: 2, r2: 2, c2: 2 }], is: 'check' },
  { ranges: [{ r1: 3, c1: 2, r2: 3, c2: 2 }], is: 'check', on: 'Yes', off: 'No' },
  { ranges: [{ r1: 1, c1: 3, r2: 1, c2: 3 }], is: 'num', op: 'between', a: 1, b: 10 },
  { ranges: [{ r1: 2, c1: 3, r2: 2, c2: 3 }], is: 'num', op: 'gt', a: 5, warn: true },
  { ranges: [{ r1: 1, c1: 4, r2: 1, c2: 4 }], is: 'date', op: 'after', a: 46296 },
  { ranges: [{ r1: 2, c1: 4, r2: 2, c2: 4 }], is: 'date', op: 'valid' },
  { ranges: [{ r1: 1, c1: 5, r2: 1, c2: 5 }], is: 'text', op: 'exactly', a: 'Yes' },
  { ranges: [{ r1: 2, c1: 5, r2: 2, c2: 5 }], is: 'text', op: 'contains', a: 'ref' },
  { ranges: [{ r1: 3, c1: 5, r2: 3, c2: 5 }], is: 'text', op: 'email' },
  { ranges: [{ r1: 1, c1: 6, r2: 4, c2: 6 }], is: 'formula', fx: '=G2>D2' },
];

export const WRITTEN_CONSTRUCTS: Readonly<Record<string, WorkbookFile>> = {
  values: {
    sheets: [
      sheet('Values', [
        { r: 0, c: 0, value: { k: 'n', v: 1.5 } },
        { r: 0, c: 1, value: { k: 'n', v: -1e-12 } },
        { r: 0, c: 2, value: { k: 's', v: ' two\nlines ' } },
        { r: 0, c: 3, value: { k: 'b', v: true } },
        { r: 0, c: 4, value: { k: 'b', v: false } },
        { r: 1, c: 0, value: { k: 's', v: 'tab\there & <there> "quoted"' } },
        { r: 9, c: 5, value: { k: 'n', v: 9 } },
      ]),
    ],
  },
  formulas: {
    sheets: [
      sheet('Sums', [
        { r: 0, c: 0, value: { k: 'n', v: 2 } },
        { r: 0, c: 1, formula: '=A1*2', value: { k: 'n', v: 4 } },
        { r: 1, c: 0, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
        { r: 1, c: 1, formula: '=IF(A1>1,"big","small")', value: { k: 's', v: 'big' } },
        { r: 2, c: 0, formula: "='Other sheet'!A1+1", value: { k: 'n', v: 8 } },
        { r: 2, c: 1, formula: '=GOOGLEFINANCE("GOOG")', value: { k: 'n', v: 100 } },
        { r: 3, c: 0, formula: '=XLOOKUP(2,A1:A2,B1:B2)', value: { k: 'n', v: 4 } },
        { r: 3, c: 1, formula: '=ISBLANK(C9)', value: { k: 'b', v: true } },
      ]),
      sheet('Other sheet', [{ r: 0, c: 0, value: { k: 'n', v: 7 } }]),
    ],
  },
  arrays: {
    sheets: [
      sheet('Arrays', [
        {
          r: 0,
          c: 0,
          formula: '=SEQUENCE(2,3)',
          value: { k: 'n', v: 1 },
          spans: { rows: 2, cols: 3 },
        },
        { r: 0, c: 1, value: { k: 'n', v: 2 } },
        { r: 0, c: 2, value: { k: 'n', v: 3 } },
        { r: 1, c: 0, value: { k: 'n', v: 4 } },
        { r: 1, c: 1, value: { k: 'n', v: 5 } },
        { r: 1, c: 2, value: { k: 'n', v: 6 } },
        { r: 3, c: 0, formula: '={1,2;3,4}', value: { k: 'n', v: 1 }, spans: { rows: 2, cols: 2 } },
        { r: 3, c: 1, value: { k: 'n', v: 2 } },
        { r: 4, c: 0, value: { k: 'n', v: 3 } },
        { r: 4, c: 1, value: { k: 'n', v: 4 } },
      ]),
    ],
  },
  formats: {
    sheets: [
      sheet(
        'Formats',
        [
          ...KINDS.flatMap((nf, r): FileCell[] => {
            const code = formatCodeOf({ nf, dp: 3 }, 'en-GB');
            return code === null
              ? []
              : [{ r, c: 0, value: { k: 'n', v: 45_000.25 }, format: code }];
          }),
          ...CUSTOM_CODES.map((format, r): FileCell => ({
            r,
            c: 1,
            value: { k: 'n', v: 1234.5 },
            format,
          })),
          { r: 0, c: 2, format: '0.00' },
        ],
        20,
      ),
    ],
  },
  bounds: {
    sheets: [
      sheet(
        'A sheet name of more than thirty-one characters',
        [
          { r: 0, c: 0, value: { k: 's', v: 'x'.repeat(40_000) } },
          { r: 0, c: 1, formula: `=LEN("${'y'.repeat(9_000)}")`, value: { k: 'n', v: 9_000 } },
          { r: 0, c: 16_384, value: { k: 'n', v: 1 } },
        ],
        2,
        16_390,
      ),
      sheet('Empty', []),
    ],
  },
  charts: { sheets: [chartSheet()] },
  validation: {
    sheets: [
      {
        ...sheet('Rules', [{ r: 0, c: 0, value: { k: 's', v: 'Status' } }], 10, 10),
        validations: VALIDATIONS,
      },
      sheet('My Lists', [
        { r: 0, c: 0, value: { k: 's', v: 'Red' } },
        { r: 1, c: 0, value: { k: 's', v: 'Blue' } },
      ]),
    ],
  },
};

// A table of costs and an index with a gap, and a chart of every type over it, each with its own look (standard-mapping.md
// "Charts in the file").
function chartSheet(): FileSheet {
  const rows: [string, number, number | null][] = [
    ['Opus', 15, 60],
    ['Sonnet', 3, null],
    ["O'Neil", 1, 40],
  ];
  const cells: FileCell[] = [
    { r: 0, c: 0, value: { k: 's', v: 'Model' } },
    { r: 0, c: 1, value: { k: 's', v: 'Cost' } },
    { r: 0, c: 2, value: { k: 's', v: 'Index' } },
    ...rows.flatMap(([name, cost, index], i): FileCell[] => [
      { r: i + 1, c: 0, value: { k: 's', v: name } },
      { r: i + 1, c: 1, value: { k: 'n', v: cost } },
      ...(index === null ? [] : [{ r: i + 1, c: 2, value: { k: 'n' as const, v: index } }]),
    ]),
  ];
  const values = (c: number) => ({ r1: 1, c1: c, r2: 3, c2: c });
  const series = (
    c: number,
    name: string,
    extra: Partial<FileChartSeries> = {},
  ): FileChartSeries => ({
    name,
    nameAt: { r: 0, c },
    values: values(c),
    cached: rows.map((row) => row[c] as number | null),
    ...extra,
  });
  const base = (i: number, type: FileChart['type']): FileChart => ({
    id: `chart_${type}`,
    type,
    legend: 'bottom',
    values: false,
    axis: true,
    at: { r: 5 + i * 15, c: 4, dx: 4, dy: 2 },
    width: 420,
    height: 280,
    labels: { range: values(0), cached: rows.map((row) => row[0]) },
    x: null,
    series: [series(1, 'Cost', { color: '#1a73e8' }), series(2, 'Index')],
  });
  const types: FileChart['type'][] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut'];
  const charts = types.map((type, i) => base(i, type));
  charts[0] = {
    ...charts[0]!,
    title: 'Cost & "index"',
    xTitle: 'Model',
    yTitle: 'Dollars',
    values: true,
  };
  charts[1] = { ...charts[1]!, legend: 'none', axis: false, alt: 'Costs by model' };
  charts.push({
    ...base(types.length, 'scatter'),
    title: 'Cost against index',
    legend: 'right',
    labels: null,
    x: { range: values(1), cached: rows.map((row) => row[1]) },
    series: [series(2, 'Index', { line: true, color: '#e8710a' })],
  });
  charts.push({ ...base(types.length + 1, 'column'), id: 'chart_none', labels: null, series: [] });
  // Stacking (D283): stacked columns, 100% bars, a stacked area.
  charts.push(
    { ...base(types.length + 2, 'column'), id: 'chart_stacked', stack: 'stacked' },
    { ...base(types.length + 3, 'bar'), id: 'chart_percent', stack: 'percent' },
    { ...base(types.length + 4, 'area'), id: 'chart_area_stacked', stack: 'stacked' },
    // Smooth Line (D285).
    { ...base(types.length + 5, 'line'), id: 'chart_smooth', smooth: true },
    // Combo (D287): columns and a smooth line, then an area and a line.
    {
      ...base(types.length + 6, 'combo'),
      id: 'chart_combo',
      smooth: true,
      series: [
        series(1, 'Cost', { color: '#1a73e8', type: 'column' }),
        series(2, 'Index', { type: 'line' }),
      ],
    },
    {
      ...base(types.length + 7, 'combo'),
      id: 'chart_combo_area',
      series: [series(1, 'Cost', { type: 'area' }), series(2, 'Index', { type: 'line' })],
    },
    // The right-hand axis (D288): a line chart's and a combo's, the value axes hidden on the second.
    {
      ...base(types.length + 8, 'line'),
      id: 'chart_right',
      series: [series(1, 'Cost'), series(2, 'Index', { right: true })],
    },
    {
      ...base(types.length + 9, 'combo'),
      id: 'chart_combo_right',
      axis: false,
      series: [
        series(1, 'Cost', { type: 'column' }),
        series(2, 'Index', { type: 'line', right: true }),
      ],
    },
    // Written as the nearest type, the original kept (D290): a stacked Stepped Area, a Combo's stepped area series.
    { ...base(types.length + 10, 'stepped-area'), id: 'chart_stepped', stack: 'stacked' },
    {
      ...base(types.length + 11, 'combo'),
      id: 'chart_combo_stepped',
      series: [series(1, 'Cost', { type: 'column' }), series(2, 'Index', { type: 'stepped-area' })],
    },
    // Radar (D292): lines with markers round a web.
    { ...base(types.length + 12, 'radar'), id: 'chart_radar', values: true },
    // Bubble (D321): x the costs, y the index, sized by the index.
    {
      ...base(types.length + 13, 'bubble'),
      id: 'chart_bubble',
      labels: null,
      x: { range: values(1), cached: rows.map((row) => row[1]) },
      series: [series(2, 'Index', { color: '#e8710a' })],
      sizes: { range: values(2), cached: rows.map((row) => row[2]) },
    },
    // Candlestick and OHLC (D323): stock charts of four price series (the two columns, twice).
    {
      ...base(types.length + 14, 'candlestick'),
      id: 'chart_candlestick',
      series: [
        series(1, 'Cost', { color: '#1a73e8' }),
        series(2, 'Index'),
        series(1, 'Cost'),
        series(2, 'Index'),
      ],
    },
    {
      ...base(types.length + 15, 'ohlc'),
      id: 'chart_ohlc',
      series: [series(1, 'Cost'), series(2, 'Index'), series(1, 'Cost'), series(2, 'Index')],
    },
    // Histogram (D325): written as a column chart of the values it counts, its original kept.
    { ...base(types.length + 16, 'histogram'), id: 'chart_histogram' },
    // Waterfall (D327): written as a column chart of its changes, its original kept.
    { ...base(types.length + 17, 'waterfall'), id: 'chart_waterfall' },
    // Treemap (D329): written as a pie chart of its first series, its original kept.
    { ...base(types.length + 18, 'treemap'), id: 'chart_treemap' },
    // Gauge (D331): written as a bar chart of its values, its original kept.
    { ...base(types.length + 19, 'gauge'), id: 'chart_gauge' },
    // Scorecard (D371): written as a column chart of its series, its original kept.
    { ...base(types.length + 20, 'scorecard'), id: 'chart_scorecard' },
    // Timeline (D373): written as a line chart of its series, its original kept.
    { ...base(types.length + 21, 'timeline'), id: 'chart_timeline' },
  );
  return { ...sheet("Costs' sheet", cells, 140, 8), charts };
}
