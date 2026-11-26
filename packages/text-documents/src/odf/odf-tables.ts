// Tables in ODF (docs/specs/034-text-documents/tables.md "In the formats"): `table:table` with its columns, header
// rows, rows and cells read into the model, their automatic styles' values mapped and the styles kept; and the model
// written back, a kept style where it still holds and one named by a hash of its values where not.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  keptXmlWithin,
  odfColour,
  odfLengthToPt,
  startTagBindings,
  ptToOdf,
  type KeptXml,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import type { Block } from '../model/blocks';
import { canonical, compact, isEmpty, keptStillHolds, type KeptProperties } from '../model/props';
import {
  CELL_SIDES,
  TABLE_COLUMN_FALLBACK_PT,
  Tables,
  TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
  type CellProps,
  type Table,
  type TableCell,
  type TableRow,
} from '../model/tables';
import type { ReportBuilder } from '../report';
import { NS } from './odf-names';
import type { WholeChange } from './odf-suggestions';
import { borderLine, borderValue } from './odf-props';

/** An automatic style a table's element names: its element, and its XML kept. */
export type OdfTableStyle = { readonly element: XmlElement; readonly kept: KeptXml };

/** What reading a table takes from the document's reader. */
export type OdfTableSource = {
  readonly parsed: XmlParsed;
  readonly style: (name: string | undefined) => OdfTableStyle | undefined;
  /** A cell's content read as blocks, as the body's. */
  readonly cellBlocks: (cell: XmlElement) => Block[];
  readonly kept: (e: XmlElement) => KeptXml;
  readonly report: ReportBuilder;
  /** The paragraph style an empty cell added on read holds. */
  readonly normal: string;
};

const is = (e: XmlElement, local: string) => e.uri === NS.table && e.local === local;

// Attributes the model maps, by element: what is left is the element's kept start tag. A cell's values (its office
// value type and value) stand for its text, which the suite recomputes.
const MAPPED_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  table: new Set(['style-name']),
  'table-row': new Set(['style-name', 'number-rows-repeated']),
  'table-cell': new Set([
    'style-name',
    'number-columns-spanned',
    'number-rows-spanned',
    'number-columns-repeated',
  ]),
};
const isValueAttribute = (uri: string, local: string) =>
  (uri === NS.office || uri.startsWith('urn:org:documentfoundation:names:experimental:calc')) &&
  (local === 'value-type' || local.endsWith('value') || local === 'currency');

/** The element's attributes the model does not map, as an empty element of its own name; undefined when none. */
function tagOf(e: XmlElement): KeptXml | undefined {
  const mapped = MAPPED_ATTRIBUTES[e.local] ?? new Set<string>();
  const own = e.attributes.filter(
    (a) => !(a.uri === NS.table && mapped.has(a.local)) && !isValueAttribute(a.uri, a.local),
  );
  if (own.length === 0) return undefined;
  const qualified = (prefix: string, local: string) => (prefix ? `${prefix}:${local}` : local);
  // The tag is written without the element's own declarations: those it uses come with it.
  const ns: Record<string, string> = { ...startTagBindings(e) };
  for (const prefix of [e.prefix, ...own.map((a) => a.prefix)])
    if (prefix in e.declared) ns[prefix] = e.declared[prefix]!;
  const attributes = own
    .map((a) => ` ${qualified(a.prefix, a.local)}="${escapeXmlAttribute(a.value)}"`)
    .join('');
  return { xml: `<${qualified(e.prefix, e.local)}${attributes}/>`, ns };
}

/** A kept start tag's attributes, with the bindings the root lacks, to go inside the element LiveDoc writes. */
function tagAttributes(tag: KeptXml | undefined, ns: Readonly<Record<string, string>>): string {
  if (!tag) return '';
  const xml = keptXmlWithin(tag, ns);
  return xml.slice(xml.search(/[\s/>]/), xml.lastIndexOf('/>'));
}

const count = (e: XmlElement, local: string, most: number) => {
  const n = Number(attributeOf(e, NS.table, local) ?? '1');
  return Number.isInteger(n) && n > 1 ? Math.min(n, most) : 1;
};

function readCellProps(style: OdfTableStyle | undefined): CellProps {
  const p = style && childElement(style.element, NS.style, 'table-cell-properties');
  if (!p) return {};
  const fo = (local: string) => attributeOf(p, NS.fo, local);
  const named = (local: string) =>
    CELL_SIDES.some((s) => fo(`${local}-${s}`) !== undefined) || !!fo(local);
  const borders = named('border')
    ? Object.fromEntries(
        CELL_SIDES.flatMap((side) => {
          const line = borderLine(fo(`border-${side}`) ?? fo('border'), undefined);
          return line ? [[side, line]] : [];
        }),
      )
    : undefined;
  const padding = named('padding')
    ? Object.fromEntries(
        CELL_SIDES.flatMap((side) => {
          const pt = odfLengthToPt(fo(`padding-${side}`) ?? fo('padding'));
          return pt === undefined ? [] : [[side, pt]];
        }),
      )
    : undefined;
  const align = attributeOf(p, NS.style, 'vertical-align');
  return compact({
    background: odfColour(fo('background-color')),
    borders,
    padding,
    verticalAlign: align === 'top' || align === 'middle' || align === 'bottom' ? align : undefined,
  });
}

function readRowValues(style: OdfTableStyle | undefined): Omit<TableRow, 'cells'> {
  const p = style && childElement(style.element, NS.style, 'table-row-properties');
  if (!p) return {};
  const exact = odfLengthToPt(attributeOf(p, NS.style, 'row-height'));
  const least = odfLengthToPt(attributeOf(p, NS.style, 'min-row-height'));
  return compact({
    height: exact ?? least,
    heightRule: exact !== undefined ? ('exact' as const) : undefined,
    breaks: attributeOf(p, NS.fo, 'keep-together') === 'always' ? (false as const) : undefined,
  });
}

const keptOf = (
  style: OdfTableStyle | undefined,
  name: string | undefined,
  values: unknown,
  residue: readonly KeptXml[] = [],
): KeptProperties | undefined =>
  style && name ? { xml: style.kept, read: canonical(values), residue, name } : undefined;

/**
 * A `table:table` as the model's table; a table past the limits as a kept block; null for one with no rows (dropped,
 * reported).
 */
export function readOdfTable(e: XmlElement, source: OdfTableSource): Block | null {
  const keptBlock = (): Block => {
    source.report.keep(e.local);
    return { type: 'kept', name: e.local, xml: source.kept(e) };
  };
  const styleName = attributeOf(e, NS.table, 'style-name');
  const tableStyle = source.style(styleName);
  const tableProps = tableStyle && childElement(tableStyle.element, NS.style, 'table-properties');
  const width = tableProps && odfLengthToPt(attributeOf(tableProps, NS.style, 'width'));
  const alignIn = tableProps && attributeOf(tableProps, NS.table, 'align');
  const indent = tableProps && odfLengthToPt(attributeOf(tableProps, NS.fo, 'margin-left'));
  const align = alignIn === 'center' ? 'center' : alignIn === 'right' ? 'end' : undefined;

  const columnElements: XmlElement[] = [];
  const rowElements: { e: XmlElement; header: boolean }[] = [];
  let tooLarge = false;
  const walk = (parent: XmlElement, header: boolean) => {
    for (const c of childElements(parent)) {
      if (c.uri !== NS.table) source.report.drop('table-content', c.local);
      else if (c.local === 'table-column') columnElements.push(c);
      else if (c.local === 'table-row') rowElements.push({ e: c, header });
      else if (c.local === 'table-header-rows') walk(c, true);
      else if (/^table-(columns|header-columns|column-group|rows|row-group)$/.test(c.local))
        walk(c, header);
      else source.report.drop('table-content', c.local);
    }
  };
  walk(e, false);

  const columnWidths: (number | undefined)[] = [];
  const relative: (number | undefined)[] = [];
  for (const c of columnElements) {
    const n = count(c, 'number-columns-repeated', TEXT_DOCUMENT_TABLE_MAX_COLUMNS + 1);
    const style = source.style(attributeOf(c, NS.table, 'style-name'));
    const p = style && childElement(style.element, NS.style, 'table-column-properties');
    const own = p && odfLengthToPt(attributeOf(p, NS.style, 'column-width'));
    const rel = p && Number(attributeOf(p, NS.style, 'rel-column-width')?.replace(/\*$/, ''));
    for (let i = 0; i < n; i += 1) {
      columnWidths.push(own);
      relative.push(rel && rel > 0 ? rel : undefined);
    }
    if (columnWidths.length > TEXT_DOCUMENT_TABLE_MAX_COLUMNS) tooLarge = true;
  }
  if (tooLarge) return keptBlock();
  const relativeSum = relative.reduce<number>((a, b) => a + (b ?? 0), 0);
  const columns = columnWidths.map((own, i) => {
    if (own !== undefined) return own;
    const rel = relative[i];
    if (rel && width && relativeSum > 0)
      return Math.round((width * rel * 1000) / relativeSum) / 1000;
    return width && columnWidths.length > 0
      ? width / columnWidths.length
      : TABLE_COLUMN_FALLBACK_PT;
  });

  const rows: TableRow[] = [];
  let headerRows = 0;
  let leading = true;
  for (const { e: row, header } of rowElements) {
    const repeat = count(row, 'number-rows-repeated', TEXT_DOCUMENT_TABLE_MAX_ROWS + 1);
    if (rows.length + repeat > TEXT_DOCUMENT_TABLE_MAX_ROWS) return keptBlock();
    const rowStyleName = attributeOf(row, NS.table, 'style-name');
    const rowStyle = source.style(rowStyleName);
    const values = readRowValues(rowStyle);
    const cells: TableCell[] = [];
    for (const cell of childElements(row)) {
      if (is(cell, 'covered-table-cell')) continue;
      if (!is(cell, 'table-cell')) {
        source.report.drop('table-content', cell.local);
        continue;
      }
      const cellStyleName = attributeOf(cell, NS.table, 'style-name');
      const cellStyle = source.style(cellStyleName);
      const props = readCellProps(cellStyle);
      const colSpan = count(cell, 'number-columns-spanned', TEXT_DOCUMENT_TABLE_MAX_COLUMNS);
      const rowSpan = count(cell, 'number-rows-spanned', TEXT_DOCUMENT_TABLE_MAX_ROWS);
      const blocks = source.cellBlocks(cell);
      const repeated = count(cell, 'number-columns-repeated', TEXT_DOCUMENT_TABLE_MAX_COLUMNS + 1);
      const read: TableCell = {
        blocks,
        props,
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
        ...compact({
          kept: keptOf(cellStyle, cellStyleName, { props }),
          tag: tagOf(cell),
        }),
      };
      for (let i = 0; i < repeated; i += 1) cells.push(read);
    }
    const built: TableRow = {
      cells,
      ...values,
      ...compact({ kept: keptOf(rowStyle, rowStyleName, values), tag: tagOf(row) }),
    };
    for (let i = 0; i < repeat; i += 1) rows.push(built);
    if (header && leading) headerRows += repeat;
    else leading = false;
  }

  const raw: Table = {
    type: 'table',
    columns,
    rows,
    headerRows,
    ...compact({ align, indent: indent || undefined }),
  };
  const table = Tables.normalised(raw, source.normal, (repair) =>
    source.report.drop('table-repaired', repair),
  );
  if (!table) {
    source.report.drop('table-repaired', 'empty table');
    return null;
  }
  if (!Tables.fits(table)) return keptBlock();
  // What the table style and its columns were read with: the columns as the file gave them.
  const residue = columnElements.map((c) => source.kept(c));
  return {
    ...table,
    ...compact({
      kept: keptOf(
        tableStyle,
        styleName,
        { columns, align: table.align, indent: table.indent },
        residue,
      ),
      tag: tagOf(e),
    }),
  };
}

/** What writing a table takes from the document's writer. */
export type OdfTableHost = {
  readonly ns: Readonly<Record<string, string>>;
  /** An automatic style named by a hash of what it holds. */
  generated(prefix: string, body: (name: string) => string): string;
  /** The kept automatic style's name, when it is free or the same. */
  keptName(kept: KeptProperties | undefined): string | undefined;
  kept(xml: KeptXml): string;
  /** A cell's blocks as ODF content; `whole`: a suggested table's change every paragraph of it is whole in. */
  cellXml(blocks: readonly Block[], whole?: WholeChange): string;
  /** A suggested table's change, where its writing is tracked. */
  whole?(table: Table): WholeChange | undefined;
  /** A name no other table of the document holds. */
  tableName(): string;
};

const attr = (name: string, value: string | undefined) =>
  value === undefined ? '' : ` ${name}="${escapeXmlAttribute(value)}"`;

const ALIGN_OUT = { start: 'left', center: 'center', end: 'right' } as const;

function cellPropsXml(props: CellProps): string {
  const borders = props.borders
    ? CELL_SIDES.map((side) => {
        const line = props.borders![side];
        return attr(`fo:border-${side}`, line ? borderValue(line) : 'none');
      }).join('')
    : '';
  const padding = CELL_SIDES.map((side) => {
    const pt = props.padding?.[side];
    return attr(`fo:padding-${side}`, pt === undefined ? undefined : ptToOdf(pt));
  }).join('');
  return `<style:table-cell-properties${attr('fo:background-color', props.background)}${borders}${padding}${attr('style:vertical-align', props.verticalAlign)}/>`;
}

function styleName(
  host: OdfTableHost,
  kept: KeptProperties | undefined,
  values: unknown,
  prefix: string,
  family: string,
  inner: string,
): string {
  if (keptStillHolds(kept, values)) {
    const name = host.keptName(kept);
    if (name) return name;
  }
  return host.generated(
    prefix,
    (name) =>
      `<style:style${attr('style:name', name)}${attr('style:family', family)}>${inner}</style:style>`,
  );
}

function rowXml(
  host: OdfTableHost,
  row: TableRow,
  places: ReturnType<typeof Tables.grid>[number],
  whole?: WholeChange,
): string {
  const values = compact({ height: row.height, heightRule: row.heightRule, breaks: row.breaks });
  const hasStyle = !isEmpty(values);
  const name = hasStyle
    ? styleName(
        host,
        row.kept,
        values,
        'LDRow',
        'table-row',
        `<style:table-row-properties${attr(row.heightRule === 'exact' ? 'style:row-height' : 'style:min-row-height', row.height === undefined ? undefined : ptToOdf(row.height))}${attr('fo:keep-together', row.breaks === false ? 'always' : undefined)}/>`,
      )
    : keptStillHolds(row.kept, values)
      ? host.keptName(row.kept)
      : undefined;
  const cells = places.map((place) => {
    if (!place || !place.origin) return '<table:covered-table-cell/>';
    const cell = place.cell;
    const style = isEmpty(cell.props)
      ? keptStillHolds(cell.kept, { props: cell.props })
        ? host.keptName(cell.kept)
        : undefined
      : styleName(
          host,
          cell.kept,
          { props: cell.props },
          'LDCell',
          'table-cell',
          cellPropsXml(cell.props),
        );
    const spans =
      attr(
        'table:number-columns-spanned',
        cell.colSpan && cell.colSpan > 1 ? String(cell.colSpan) : undefined,
      ) +
      attr(
        'table:number-rows-spanned',
        cell.rowSpan && cell.rowSpan > 1 ? String(cell.rowSpan) : undefined,
      );
    return `<table:table-cell${attr('table:style-name', style)}${spans}${tagAttributes(cell.tag, host.ns)}>${host.cellXml(cell.blocks, whole)}</table:table-cell>`;
  });
  return `<table:table-row${attr('table:style-name', name)}${tagAttributes(row.tag, host.ns)}>${cells.join('')}</table:table-row>`;
}

/** The table as a `table:table`, its styles added to the host's automatic styles. */
export function odfTableXml(host: OdfTableHost, table: Table): string {
  const values = { columns: table.columns, align: table.align, indent: table.indent };
  const holds = keptStillHolds(table.kept, values);
  const keptName = holds ? host.keptName(table.kept) : undefined;
  const name =
    keptName ??
    host.generated(
      'LDTable',
      (n) =>
        `<style:style${attr('style:name', n)} style:family="table"><style:table-properties${attr('style:width', ptToOdf(Tables.width(table)))}${attr('table:align', ALIGN_OUT[table.align ?? 'start'])}${attr('fo:margin-left', table.indent === undefined ? undefined : ptToOdf(table.indent))}/></style:style>`,
    );
  const columns =
    keptName && table.kept
      ? table.kept.residue.map((c) => host.kept(c)).join('')
      : table.columns
          .map((width) => {
            const column = host.generated(
              'LDColumn',
              (n) =>
                `<style:style${attr('style:name', n)} style:family="table-column"><style:table-column-properties${attr('style:column-width', ptToOdf(width))}/></style:style>`,
            );
            return `<table:table-column${attr('table:style-name', column)}/>`;
          })
          .join('');
  const grid = Tables.grid(table);
  // A suggested table: every paragraph of its cells whole in its change, as LibreOffice writes one (standard-mapping.md).
  const whole = host.whole?.(table);
  const rows = table.rows.map((row, r) => rowXml(host, row, grid[r]!, whole));
  const header =
    table.headerRows > 0
      ? `<table:table-header-rows>${rows.slice(0, table.headerRows).join('')}</table:table-header-rows>`
      : '';
  const ownName = /\s[\w.-]+:name="/.test(tagAttributes(table.tag, host.ns))
    ? ''
    : attr('table:name', host.tableName());
  return `<table:table${ownName}${attr('table:style-name', name)}${tagAttributes(table.tag, host.ns)}>${columns}${header}${rows.slice(table.headerRows).join('')}</table:table>`;
}
