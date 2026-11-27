// Pivot tables in XLSX, written (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D604 to D606):
// per pivot table a cache definition naming its source, without records, and a tabular pivot table part linked from
// its worksheet, shaped as Google Sheets exports one, LiveDoc's record and the standard form's fingerprint in the pivot
// table part's `extLst`.
import {
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  XML_DECLARATION,
  escapeXmlAttribute,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { formatRange, type GridRange } from '../address';
import type { PivotShowAs, PivotSummary } from '../pivot/pivot-spec';
import {
  pageColumns,
  pivotFieldNames,
  pivotFingerprint,
  pivotRecordText,
  pivotSimplified,
  pivotSourceText,
  pivotStandardFields,
  pivotValueLabel,
  standardHasSummary,
  subtotalsOf,
  valueFieldIndex,
  valueFilters,
  type FilePivot,
  type FilePivotValue,
  type PivotItem,
  type PivotStandard,
} from './file-pivots';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileSheet } from './workbook-file';
import { OFFICE_RELATIONSHIPS_NS, SPREADSHEETML_NS } from './xlsx-parts';
import { ownIds, type XlsxKeptWriter } from './xlsx-kept-write';

/** The style a pivot table is drawn in: Excel's own default. */
export const XLSX_PIVOT_STYLE = 'PivotStyleLight16';

// Excel's function for each summary it has; one it lacks is written `sum` (D605).
const SUBTOTAL: Readonly<Partial<Record<PivotSummary, string>>> = {
  SUM: 'sum',
  COUNTA: 'count',
  COUNT: 'countNums',
  AVERAGE: 'average',
  MAX: 'max',
  MIN: 'min',
  PRODUCT: 'product',
  STDEV: 'stdDev',
  STDEVP: 'stdDevp',
  VAR: 'var',
  VARP: 'varp',
};

const SHOW_AS: Readonly<Record<PivotShowAs, string>> = {
  row: 'percentOfRow',
  column: 'percentOfCol',
  total: 'percentOfTotal',
};

/** A value's function in XLSX. */
export const xlsxSubtotal = (v: FilePivotValue): string =>
  v.summary !== 'CUSTOM' && standardHasSummary(v.summary, 'xlsx') ? SUBTOTAL[v.summary]! : 'sum';

const attr = (name: string, value: string | number) =>
  ` ${name}="${escapeXmlAttribute(String(value))}"`;

/** Where Excel lays a pivot table out: its output's size, below its page fields and a row more (D604). */
export function xlsxPivotLocation(p: FilePivot): GridRange {
  const pages = pageColumns(p.fields).length;
  const r1 = p.at.r + (pages ? pages + 1 : 0);
  return { r1, c1: p.at.c, r2: r1 + p.output.rows - 1, c2: p.at.c + p.output.cols - 1 };
}

/** The standard form of a pivot table in XLSX, its source on `sheet` (a name as the workbook writes it). */
export function xlsxPivotStandard(p: FilePivot, sheet: string): PivotStandard {
  const names = pivotFieldNames(p);
  return {
    location: xlsxPivotLocation(p),
    source: pivotSourceText(p.source.sheet ?? sheet, p.source.range),
    fields: pivotStandardFields(p, names, xlsxSubtotal),
  };
}

// A cache field's shared items, with the flags Excel reads them by.
function sharedItemsXml(items: readonly PivotItem[] | undefined): string {
  if (!items) return '<sharedItems/>';
  const kinds = new Set(items.map((i) => i.v?.k ?? 'm'));
  const flags = [
    !kinds.has('s') ? attr('containsSemiMixedTypes', 0) + attr('containsString', 0) : '',
    kinds.has('n') ? attr('containsNumber', 1) : '',
    kinds.has('m') ? attr('containsBlank', 1) : '',
    [...kinds].filter((k) => k !== 'm').length > 1 ? attr('containsMixedTypes', 1) : '',
  ].join('');
  const item = (i: PivotItem) => {
    if (i.v === null) return '<m/>';
    if (i.v.k === 'n') return `<n${attr('v', i.v.v)}/>`;
    if (i.v.k === 'b') return `<b${attr('v', i.v.v ? 1 : 0)}/>`;
    if (i.v.k === 'e') return `<e${attr('v', i.v.v)}/>`;
    return `<s${attr('v', i.v.v)}/>`;
  };
  return `<sharedItems${flags}${attr('count', items.length)}>${items.map(item).join('')}</sharedItems>`;
}

/** A pivot table's cache definition: its source, its fields by name, and the items its axes list. */
export function xlsxCacheXml(p: FilePivot, sheet: string): string {
  const names = pivotFieldNames(p);
  const whole = pivotSimplified(p.fields, 'xlsx').length === 0;
  const calc = (p.fields.values ?? []).flatMap((v) => (v.formula === undefined ? [] : [v]));
  const fields = [
    ...p.headers.map(
      (_, c) =>
        `<cacheField${attr('name', names[c]!)}${attr('numFmtId', 0)}>${sharedItemsXml(p.items[c])}</cacheField>`,
    ),
    ...calc.map(
      (v, i) =>
        `<cacheField${attr('name', names[p.headers.length + i]!)}${attr('numFmtId', 0)}${attr('formula', v.formula.replace(/^=/, ''))}${attr('databaseField', 0)}/>`,
    ),
  ];
  return [
    `<pivotCacheDefinition xmlns="${SPREADSHEETML_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}"${whole ? attr('refreshOnLoad', 1) : ''}>`,
    `<cacheSource type="worksheet"><worksheetSource${attr('ref', formatRange(p.source.range))}${attr('sheet', p.source.sheet ?? sheet)}/></cacheSource>`,
    `<cacheFields${attr('count', fields.length)}>${fields.join('')}</cacheFields>`,
    '</pivotCacheDefinition>',
  ].join('');
}

// A field on an axis: its items in cache order, a filtered one hidden, the default subtotal's when totals show.
function axisItemsXml(
  items: readonly PivotItem[],
  shown: ReadonlySet<string> | undefined,
  totals: boolean,
): string {
  const list = items.map(
    (it, i) => `<item${shown && !shown.has(it.shown) ? attr('h', 1) : ''}${attr('x', i)}/>`,
  );
  if (totals) list.push('<item t="default"/>');
  return `<items${attr('count', list.length)}>${list.join('')}</items>`;
}

/** A pivot table part: its place, its fields on their axes, its values, and LiveDoc's record beside them. */
export function xlsxPivotTableXml(
  p: FilePivot,
  name: string,
  cacheId: number,
  sheet: string,
): string {
  const names = pivotFieldNames(p);
  const { rows = [], columns = [], values = [] } = p.fields;
  const pages = pageColumns(p.fields);
  const filtered = valueFilters(p.fields);
  const axisOf = new Map<number, { axis: string; desc: boolean; totals: boolean }>();
  rows.forEach((g, i) =>
    axisOf.set(g.col, { axis: 'axisRow', desc: !!g.desc, totals: subtotalsOf(rows, i) }),
  );
  columns.forEach((g, i) => {
    if (!axisOf.has(g.col))
      axisOf.set(g.col, { axis: 'axisCol', desc: !!g.desc, totals: subtotalsOf(columns, i) });
  });
  for (const c of pages) axisOf.set(c, { axis: 'axisPage', desc: false, totals: true });
  const data = new Set(values.map((_, i) => valueFieldIndex(p, i)));
  const common = attr('compact', 0) + attr('outline', 0) + attr('showAll', 0);
  const fields = names.map((_, i) => {
    const on = axisOf.get(i);
    const dataField = data.has(i) ? attr('dataField', 1) : '';
    if (i >= p.headers.length)
      return `<pivotField${dataField}${common}${attr('dragToRow', 0)}${attr('dragToCol', 0)}${attr('dragToPage', 0)}${attr('defaultSubtotal', 0)}/>`;
    if (!on) return `<pivotField${dataField}${common}/>`;
    const sort =
      on.axis === 'axisPage' ? '' : attr('sortType', on.desc ? 'descending' : 'ascending');
    const subtotal = on.totals ? '' : attr('defaultSubtotal', 0);
    return `<pivotField${attr('axis', on.axis)}${dataField}${common}${sort}${subtotal}>${axisItemsXml(p.items[i]!, filtered.get(i), on.totals)}</pivotField>`;
  });
  const many = values.length > 1;
  const rowFields = [...rows.map((g) => g.col), ...(many && p.fields.valuesAsRows ? [-2] : [])];
  const colFields = [...columns.map((g) => g.col), ...(many && !p.fields.valuesAsRows ? [-2] : [])];
  const list = (tag: string, cols: readonly number[]) =>
    cols.length
      ? `<${tag}${attr('count', cols.length)}>${cols.map((x) => `<field${attr('x', x)}/>`).join('')}</${tag}>`
      : '';
  const location = xlsxPivotLocation(p);
  const dataFields = values.map((v, i) => {
    const fld = valueFieldIndex(p, i);
    const subtotal = xlsxSubtotal(v);
    const showAs = v.showAs ? attr('showDataAs', SHOW_AS[v.showAs]) + attr('numFmtId', 10) : '';
    return `<dataField${attr('name', pivotValueLabel(v, names, fld))}${attr('fld', fld)}${subtotal === 'sum' ? '' : attr('subtotal', subtotal)}${attr('baseField', 0)}${attr('baseItem', 0)}${showAs}/>`;
  });
  const outerRows = rows[0]?.totals === false;
  const outerCols = columns[0]?.totals === false;
  const standard = xlsxPivotStandard(p, sheet);
  return [
    `<pivotTableDefinition xmlns="${SPREADSHEETML_NS}"${attr('name', name)}${attr('cacheId', cacheId)}${attr('dataCaption', 'Values')}${outerRows ? attr('rowGrandTotals', 0) : ''}${outerCols ? attr('colGrandTotals', 0) : ''}${attr('compact', 0)}${attr('compactData', 0)}${attr('outline', 0)}>`,
    `<location${attr('ref', formatRange(location))}${attr('firstHeaderRow', 1)}${attr('firstDataRow', 1 + colFields.length)}${attr('firstDataCol', rowFields.length)}${pages.length ? attr('rowPageCount', pages.length) + attr('colPageCount', 1) : ''}/>`,
    `<pivotFields${attr('count', fields.length)}>${fields.join('')}</pivotFields>`,
    list('rowFields', rowFields),
    list('colFields', colFields),
    pages.length
      ? `<pageFields${attr('count', pages.length)}>${pages.map((c) => `<pageField${attr('fld', c)}${attr('hier', -1)}/>`).join('')}</pageFields>`
      : '',
    values.length
      ? `<dataFields${attr('count', values.length)}>${dataFields.join('')}</dataFields>`
      : '',
    `<pivotTableStyleInfo${attr('name', XLSX_PIVOT_STYLE)}${attr('showRowHeaders', 1)}${attr('showColHeaders', 1)}${attr('showRowStripes', 0)}${attr('showColStripes', 0)}${attr('showLastColumn', 1)}/>`,
    `<extLst><ext${attr('uri', LIVEDOC_SPREADSHEET_NS)} xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"><livedoc:pivot${attr('record', pivotRecordText(p))}${attr('fingerprint', pivotFingerprint(standard))}/></ext></extLst>`,
    '</pivotTableDefinition>',
  ].join('');
}

export type XlsxPivotParts = {
  // By sheet: the worksheet's relationships to its pivot tables.
  sheets: Relationship[][];
  parts: OoxmlPart[];
  // Each pivot table part's relationship to its cache.
  relationships: [string, Relationship[]][];
  // The workbook's `pivotCache` entries and its relationships to the caches.
  caches: { entries: string[]; rels: Relationship[] };
};

const encode = (xml: string) => new TextEncoder().encode(`${XML_DECLARATION}\n${xml}\n`);

/**
 * The parts a workbook's pivot tables add to its XLSX, named past the parts the file kept, each cache's id past the
 * kept caches', the workbook's relationship ids from `workbookId`.
 */
export function xlsxPivotParts(
  sheets: readonly FileSheet[],
  kept: XlsxKeptWriter,
  keptParts: readonly OoxmlPart[],
  renamed: ReadonlyMap<string, string>,
  workbookId: () => string,
  // The relationships a sheet already holds (its kept ones and its drawing's), whose ids are taken.
  sheetRels: (sheet: number) => readonly Relationship[],
): XlsxPivotParts {
  const out: XlsxPivotParts = {
    sheets: [],
    parts: [],
    relationships: [],
    caches: { entries: [], rels: [] },
  };
  const taken = new Set(keptParts.map((p) => p.name));
  const next = (dir: string, stem: string, from: number) => {
    let n = from;
    while (taken.has(`xl/${dir}/${stem}${n}.xml`)) n++;
    taken.add(`xl/${dir}/${stem}${n}.xml`);
    return n;
  };
  let cacheId = kept.pivotCacheIdMax() + 1;
  let named = 1;
  sheets.forEach((sheet, i) => {
    const own = renamed.get(sheet.name) ?? sheet.name;
    const linked: Relationship[] = [];
    const sheetId = ownIds(sheetRels(i));
    for (const p of sheet.pivots ?? []) {
      const written: FilePivot =
        p.source.sheet === null
          ? p
          : { ...p, source: { ...p.source, sheet: renamed.get(p.source.sheet) ?? p.source.sheet } };
      const cache = `xl/pivotCache/pivotCacheDefinition${next('pivotCache', 'pivotCacheDefinition', 1)}.xml`;
      const table = `xl/pivotTables/pivotTable${next('pivotTables', 'pivotTable', 1)}.xml`;
      out.parts.push({
        name: cache,
        contentType: OOXML_CONTENT_TYPES.pivotCacheDefinition,
        data: encode(xlsxCacheXml(written, own)),
      });
      out.parts.push({
        name: table,
        contentType: OOXML_CONTENT_TYPES.pivotTable,
        data: encode(xlsxPivotTableXml(written, `LiveDocPivot${named++}`, cacheId, own)),
      });
      out.relationships.push([
        table,
        [
          {
            id: 'rId1',
            type: RELATIONSHIP_TYPES.pivotCacheDefinition,
            target: `../${cache.slice('xl/'.length)}`,
          },
        ],
      ]);
      const relId = workbookId();
      out.caches.rels.push({
        id: relId,
        type: RELATIONSHIP_TYPES.pivotCacheDefinition,
        target: cache.slice('xl/'.length),
      });
      out.caches.entries.push(`<pivotCache${attr('cacheId', cacheId)} r:id="${relId}"/>`);
      cacheId++;
      linked.push({
        id: sheetId(),
        type: RELATIONSHIP_TYPES.pivotTable,
        target: `../${table.slice('xl/'.length)}`,
      });
    }
    out.sheets.push(linked);
  });
  return out;
}
