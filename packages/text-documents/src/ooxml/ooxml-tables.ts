// Tables in WordprocessingML (docs/specs/034-text-documents/tables.md "In the formats"): `w:tbl` read into the model,
// vertical merges into row spans and the table's (and its table style's) lines and cell margins into the cells they
// reach; and the model written back, each properties element kept while the values read from it are unchanged.
import {
  attributeOf,
  childElement,
  childElements,
  colourToOoxml,
  ptToTwips,
  twipsToPt,
  type KeptXml,
  type XmlElement,
} from '@livedoc/office-packages';
import type { Block } from '../model/blocks';
import { compact, keptStillHolds, type BorderLine, type KeptProperties } from '../model/props';
import {
  CELL_SIDES,
  Tables,
  TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
  type CellBorders,
  type CellPadding,
  type CellProps,
  type CellSide,
  type Table,
  type TableCell,
  type TableRow,
} from '../model/tables';
import type { ReportBuilder } from '../report';
import {
  Suggestions,
  type BlockSuggestionKind,
  type FileSuggestionMark,
} from '../model/suggestions';
import { ooxmlSuggestionMark } from './ooxml-suggestions';
import { borderSize, lineOf, OOXML_DASH, readShading, shadingXml } from './ooxml-borders';
import { W_NS } from './ooxml-names';
import { ordered } from './ooxml-props';

const isW = (e: XmlElement, local: string) => e.uri === W_NS && e.local === local;
const child = (e: XmlElement | undefined, local: string) =>
  e ? childElement(e, W_NS, local) : undefined;
const wVal = (e: XmlElement | undefined, local = 'val') =>
  e ? attributeOf(e, W_NS, local) : undefined;
const OFF = new Set(['0', 'false', 'off']);
const isOn = (e: XmlElement | undefined) => e !== undefined && !OFF.has(wVal(e) ?? 'true');

// Child order inside the table's properties elements: the schema's sequences (CT_TblPr, CT_TrPr, CT_TcPr).
const TBLPR_ORDER =
  'tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription tblPrChange'.split(
    ' ',
  );
const TRPR_ORDER =
  'cnfStyle divId gridBefore gridAfter wBefore wAfter cantSplit trHeight tblHeader tblCellSpacing jc hidden ins del trPrChange'.split(
    ' ',
  );
const TCPR_ORDER =
  'cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark headers cellIns cellDel cellMerge tcPrChange'.split(
    ' ',
  );

// CT_TcMar's and CT_TcBorders' order.
const TCMAR_SIDES: readonly CellSide[] = ['top', 'left', 'bottom', 'right'];

/** The properties children the model maps: a rebuilt element writes them from the model, the rest kept. */
export const MAPPED_TBLPR: ReadonlySet<string> = new Set(['tblW', 'jc', 'tblInd', 'tblLayout']);
export const MAPPED_TRPR: ReadonlySet<string> = new Set([
  'trHeight',
  'cantSplit',
  'tblHeader',
  'gridBefore',
  'gridAfter',
  'wBefore',
  'wAfter',
  // A row's tracked change is its suggestion (standard-mapping.md "Suggested blocks"), never kept.
  'ins',
  'del',
]);
const ROW_REVISION = /<w:(?:ins|del)\b[^>]*\/>/g;
const CELL_REVISION = /<w:cell(?:Ins|Del)\b[^>]*\/>/g;
export const MAPPED_TCPR: ReadonlySet<string> = new Set([
  'tcW',
  'gridSpan',
  'hMerge',
  'vMerge',
  'tcBorders',
  'shd',
  'tcMar',
  'vAlign',
  // A cell's tracked change is its suggestion (a column's), never kept.
  'cellIns',
  'cellDel',
]);

/** A table's lines by side, `null` where a side is named with none; and its cell margins. */
export type TableLines = {
  readonly borders: Partial<Record<TableSide, BorderLine | null>>;
  readonly margins: Partial<Record<CellSide, number>>;
};
type TableSide = CellSide | 'insideH' | 'insideV';

// Each side's element names, Transitional's first and the logical ones Word also writes.
const SIDE_NAMES: Record<TableSide, readonly string[]> = {
  top: ['top'],
  bottom: ['bottom'],
  left: ['left', 'start'],
  right: ['right', 'end'],
  insideH: ['insideH'],
  insideV: ['insideV'],
};

const sideElement = (parent: XmlElement | undefined, side: TableSide) =>
  SIDE_NAMES[side].map((n) => child(parent, n)).find((e) => e !== undefined);

/** The lines a `w:tblBorders` or `w:tcBorders` names, `null` for a side named with none. */
function namedLines(parent: XmlElement | undefined, sides: readonly TableSide[]) {
  const out: Partial<Record<TableSide, BorderLine | null>> = {};
  for (const side of sides) {
    const e = sideElement(parent, side);
    if (e) out[side] = lineOf(e) ? { ...lineOf(e)!, space: 0 } : null;
  }
  return out;
}

/** The margins a `w:tblCellMar` or `w:tcMar` names, in points (`dxa` widths only). */
function namedMargins(parent: XmlElement | undefined): Partial<Record<CellSide, number>> {
  const out: Partial<Record<CellSide, number>> = {};
  for (const side of CELL_SIDES) {
    const e = sideElement(parent, side);
    const type = wVal(e, 'type');
    const pt = e && (type === undefined || type === 'dxa') ? twipsToPt(wVal(e, 'w')) : undefined;
    if (pt !== undefined) out[side] = pt;
  }
  return out;
}

/** A `w:tblPr`'s own lines and margins. */
export const tableLinesOf = (tblPr: XmlElement | undefined): TableLines => ({
  borders: namedLines(child(tblPr, 'tblBorders'), [...CELL_SIDES, 'insideH', 'insideV']),
  margins: namedMargins(child(tblPr, 'tblCellMar')),
});

/** Lines and margins of `over` laid over `under`'s, side by side. */
export const overLines = (under: TableLines, over: TableLines): TableLines => ({
  borders: { ...under.borders, ...over.borders },
  margins: { ...under.margins, ...over.margins },
});

/** What reading a table takes from the document's reader. */
export type OoxmlTableSource = {
  /** A cell's content read as blocks, as the body's. */
  readonly cellBlocks: (tc: XmlElement, within?: BlockSuggestionKind) => Block[];
  readonly kept: (e: XmlElement) => KeptXml;
  readonly propsKept: (
    e: XmlElement | undefined,
    values: unknown,
    mapped: ReadonlySet<string>,
  ) => KeptProperties | undefined;
  /** The lines and margins of a table style, down its `w:basedOn`; the default table style's for none. */
  readonly styleLines: (id: string | undefined) => TableLines;
  readonly report: ReportBuilder;
  readonly normal: string;
};

type CellBuild = {
  tc: XmlElement | undefined;
  column: number;
  colSpan: number;
  rowSpan: number;
};

/** The rows a table holds, those a content control or custom XML wraps included (the wrapper dropped). */
function rowElementsOf(tbl: XmlElement, report: ReportBuilder): XmlElement[] {
  return childElements(tbl).flatMap((e): XmlElement[] => {
    if (isW(e, 'tr')) return [e];
    if (isW(e, 'tblPr') || isW(e, 'tblGrid')) return [];
    if (isW(e, 'sdt') || isW(e, 'customXml')) {
      report.drop('table-content', e.local);
      const content = child(e, 'sdtContent') ?? e;
      return rowElementsOf(content, report);
    }
    report.drop('table-content', e.local);
    return [];
  });
}

function cellElementsOf(tr: XmlElement, report: ReportBuilder): XmlElement[] {
  return childElements(tr).flatMap((e): XmlElement[] => {
    if (isW(e, 'tc')) return [e];
    if (isW(e, 'trPr') || isW(e, 'tblPrEx')) return [];
    if (isW(e, 'sdt') || isW(e, 'customXml')) {
      report.drop('table-content', e.local);
      return cellElementsOf(child(e, 'sdtContent') ?? e, report);
    }
    report.drop('table-content', e.local);
    return [];
  });
}

const count = (value: string | undefined, most: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, most) : 0;
};

/**
 * A `w:tbl` as the model's table; a table past the limits as a kept block; null for one with no rows (dropped,
 * reported).
 */
export function readOoxmlTable(tbl: XmlElement, source: OoxmlTableSource): Block | null {
  const report = source.report;
  const keptBlock = (): Block => {
    report.keep(tbl.local);
    return { type: 'kept', name: tbl.local, xml: source.kept(tbl) };
  };
  const tblPr = child(tbl, 'tblPr');
  const gridCols = childElements(child(tbl, 'tblGrid') ?? tbl).filter((e) => isW(e, 'gridCol'));
  if (gridCols.length > TEXT_DOCUMENT_TABLE_MAX_COLUMNS) return keptBlock();
  const columns = gridCols.map((g) => twipsToPt(wVal(g, 'w')) ?? 0);
  const rowElements = rowElementsOf(tbl, report);
  if (rowElements.length > TEXT_DOCUMENT_TABLE_MAX_ROWS) return keptBlock();

  const jc = wVal(child(tblPr, 'jc'));
  const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'end' : undefined;
  const indType = wVal(child(tblPr, 'tblInd'), 'type');
  const indent =
    indType === undefined || indType === 'dxa'
      ? twipsToPt(wVal(child(tblPr, 'tblInd'), 'w'))
      : undefined;
  const lines = overLines(source.styleLines(wVal(child(tblPr, 'tblStyle'))), tableLinesOf(tblPr));

  // A row's or a cell's own tracked change (standard-mapping.md "Suggested blocks").
  const changeOf = (
    props: XmlElement | undefined,
    ins: string,
    del: string,
  ): { kind: BlockSuggestionKind; mark: FileSuggestionMark } | undefined => {
    const change = props && childElements(props).find((e) => isW(e, ins) || isW(e, del));
    return change
      ? {
          kind: change.local === ins ? 'insertion' : 'deletion',
          mark: ooxmlSuggestionMark(change),
        }
      : undefined;
  };
  const suggestedOf = (change: ReturnType<typeof changeOf>) =>
    change ? { suggested: { [change.kind]: change.mark } } : {};

  // Place every cell on the grid: gridBefore's places as empty cells, vertical merges into their first cell.
  const builds: CellBuild[][] = [];
  const open = new Map<number, CellBuild>();
  let horizontal = false;
  rowElements.forEach((tr) => {
    const trPr = child(tr, 'trPr');
    const row: CellBuild[] = [];
    let column = 0;
    const before = count(wVal(child(trPr, 'gridBefore')), TEXT_DOCUMENT_TABLE_MAX_COLUMNS);
    for (let i = 0; i < before; i += 1)
      row.push({ tc: undefined, column: column++, colSpan: 1, rowSpan: 1 });
    for (const tc of cellElementsOf(tr, report)) {
      const tcPr = child(tc, 'tcPr');
      const span = count(wVal(child(tcPr, 'gridSpan')), TEXT_DOCUMENT_TABLE_MAX_COLUMNS) || 1;
      const hMerge = child(tcPr, 'hMerge');
      if (hMerge && wVal(hMerge) !== 'restart' && row.length > 0) {
        horizontal = true;
        row[row.length - 1]!.colSpan += span;
        column += span;
        continue;
      }
      const vMerge = child(tcPr, 'vMerge');
      const continues = vMerge !== undefined && wVal(vMerge) !== 'restart';
      const above = open.get(column);
      if (continues && above) {
        above.rowSpan += 1;
        column += span;
        continue;
      }
      const build: CellBuild = { tc, column, colSpan: span, rowSpan: 1 };
      for (let c = column; c < column + span; c += 1) open.delete(c);
      if (vMerge) open.set(column, build);
      row.push(build);
      column += span;
    }
    builds.push(row);
  });
  if (horizontal) report.drop('table-repaired', 'horizontal merge');

  const width = Math.max(
    columns.length,
    ...builds.map((row) => row.reduce((n, b) => n + b.colSpan, 0)),
  );
  const headerRows = rowElements.findIndex((tr) => !isOn(child(child(tr, 'trPr'), 'tblHeader')));
  const rows: TableRow[] = rowElements.map((tr, r) => {
    const trPr = child(tr, 'trPr');
    const trHeight = child(trPr, 'trHeight');
    const rule = wVal(trHeight, 'hRule');
    const height = rule === 'auto' ? undefined : twipsToPt(wVal(trHeight));
    const values = compact({
      height: height || undefined,
      heightRule: height && rule === 'exact' ? ('exact' as const) : undefined,
      breaks: isOn(child(trPr, 'cantSplit')) ? (false as const) : undefined,
    });
    const header = isOn(child(trPr, 'tblHeader'));
    const offGrid = ['gridBefore', 'gridAfter', 'wBefore', 'wAfter'].some((n) => child(trPr, n));
    const rowChange = changeOf(trPr, 'ins', 'del');
    const cells = builds[r]!.map((b): TableCell => {
      const props = cellProps(b, r, rowElements.length, width, lines);
      const tcPr = b.tc && child(b.tc, 'tcPr');
      const cellChange = changeOf(tcPr, 'cellIns', 'cellDel');
      // The cell's paragraph marks Word tracks with its row's or its own change are part of it.
      const blocks = b.tc ? source.cellBlocks(b.tc, (cellChange ?? rowChange)?.kind) : [];
      const held = source.propsKept(
        tcPr,
        {
          props,
          colSpan: b.colSpan,
          rowSpan: b.rowSpan,
          width: columns.slice(b.column, b.column + b.colSpan).reduce((a, c) => a + c, 0),
        },
        MAPPED_TCPR,
      );
      return {
        blocks,
        props,
        ...(b.colSpan > 1 ? { colSpan: b.colSpan } : {}),
        ...(b.rowSpan > 1 ? { rowSpan: b.rowSpan } : {}),
        ...compact({ kept: withoutRevision(held, CELL_REVISION) }),
        ...suggestedOf(cellChange),
      };
    });
    const held = source.propsKept(
      trPr,
      { ...values, header, ...(offGrid ? { offGrid } : {}) },
      MAPPED_TRPR,
    );
    return {
      cells,
      ...values,
      ...compact({ kept: withoutRevision(held, ROW_REVISION) }),
      ...suggestedOf(rowChange),
    };
  });

  const raw: Table = {
    type: 'table',
    columns,
    rows,
    headerRows: headerRows === -1 ? rows.length : headerRows,
    ...compact({ align, indent: indent || undefined }),
  };
  const table = Tables.normalised(raw, source.normal, (repair) =>
    report.drop('table-repaired', repair),
  );
  if (!table) {
    report.drop('table-repaired', 'empty table');
    return null;
  }
  if (!Tables.fits(table)) return keptBlock();
  const kept = source.propsKept(
    tblPr,
    { columns, align: table.align, indent: table.indent },
    MAPPED_TBLPR,
  );
  // What is inside a suggested row, cell or table carries only its own suggestions.
  return { ...Suggestions.foldedRows(table), ...compact({ kept }) };
}

/** Kept properties with their tracked change taken out: the change is the model's suggestion, never kept. */
const withoutRevision = (
  kept: KeptProperties | undefined,
  revision: RegExp,
): KeptProperties | undefined =>
  kept && { ...kept, xml: { ...kept.xml, xml: kept.xml.xml.replace(revision, '') } };

/** A cell's formatting: the table's lines on the edges it reaches, its own over them; shading, margins, alignment. */
function cellProps(
  b: CellBuild,
  row: number,
  rows: number,
  width: number,
  lines: TableLines,
): CellProps {
  const tcPr = b.tc && child(b.tc, 'tcPr');
  const ownLines = namedLines(child(tcPr, 'tcBorders'), CELL_SIDES);
  const reach: Record<CellSide, TableSide> = {
    top: row === 0 ? 'top' : 'insideH',
    bottom: row + b.rowSpan >= rows ? 'bottom' : 'insideH',
    left: b.column === 0 ? 'left' : 'insideV',
    right: b.column + b.colSpan >= width ? 'right' : 'insideV',
  };
  const named = Object.keys(lines.borders).length > 0 || child(tcPr, 'tcBorders') !== undefined;
  let borders: CellBorders | undefined;
  if (named) {
    const out: Partial<Record<CellSide, BorderLine>> = {};
    for (const side of CELL_SIDES) {
      const line = side in ownLines ? ownLines[side] : lines.borders[reach[side]];
      if (line) out[side] = line;
    }
    borders = out;
  }
  const margins = { ...lines.margins, ...namedMargins(child(tcPr, 'tcMar')) };
  const padding: CellPadding | undefined = Object.keys(margins).length > 0 ? margins : undefined;
  const vAlign = wVal(child(tcPr, 'vAlign'));
  return compact({
    background: tcPr && readShading(tcPr),
    borders,
    padding,
    verticalAlign:
      vAlign === 'center' ? 'middle' : vAlign === 'top' || vAlign === 'bottom' ? vAlign : undefined,
  });
}

/** What writing a table takes from the document's writer. */
export type OoxmlTableHost = {
  kept(xml: KeptXml): string;
  /** A cell's blocks as WordprocessingML, laid over with its effective suggestion where it has one. */
  blocksXml(blocks: readonly Block[], suggested?: BlockSuggestion): string;
  /**
   * A suggested row's or cell's revision (standard-mapping.md "Suggested blocks"): a `w:ins` or `w:del` for a row's
   * `w:trPr`, a `w:cellIns` or `w:cellDel` for a cell's `w:tcPr`.
   */
  revision(suggested: BlockSuggestion, of: 'row' | 'cell'): string;
};

/** A whole block's, row's or cell's suggestion: its kind and mark. */
type BlockSuggestion = NonNullable<ReturnType<typeof Suggestions.ofBlock>>;

const twips = (pt: number) => ptToTwips(pt);

function lineXml(local: string, line: BorderLine | undefined): string {
  if (!line) return `<w:${local} w:val="nil"/>`;
  return `<w:${local} w:val="${OOXML_DASH[line.dash]}" w:sz="${borderSize(line.width)}" w:space="0" w:color="${colourToOoxml(line.color)}"/>`;
}

function tcPrXml(
  cell: TableCell,
  width: number,
  vMerge: 'restart' | 'continue' | undefined,
  residue: readonly string[],
  revision?: string,
): string {
  const p = cell.props;
  // CT_TcMar's and CT_TcBorders' order: top, left, bottom, right.
  const margins = TCMAR_SIDES.flatMap((side) => {
    const pt = p.padding?.[side];
    return pt === undefined ? [] : [`<w:${side} w:w="${twips(pt)}" w:type="dxa"/>`];
  });
  const children = ordered(
    TCPR_ORDER,
    {
      tcW: `<w:tcW w:w="${twips(width)}" w:type="dxa"/>`,
      gridSpan:
        cell.colSpan && cell.colSpan > 1 ? `<w:gridSpan w:val="${cell.colSpan}"/>` : undefined,
      vMerge:
        vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : vMerge ? '<w:vMerge/>' : undefined,
      tcBorders: p.borders
        ? `<w:tcBorders>${TCMAR_SIDES.map((side) => lineXml(side, p.borders![side])).join(
            '',
          )}</w:tcBorders>`
        : undefined,
      shd: shadingXml(p.background),
      tcMar: margins.length > 0 ? `<w:tcMar>${margins.join('')}</w:tcMar>` : undefined,
      vAlign: p.verticalAlign
        ? `<w:vAlign w:val="${p.verticalAlign === 'middle' ? 'center' : p.verticalAlign}"/>`
        : undefined,
      [revision?.startsWith('<w:cellDel') ? 'cellDel' : 'cellIns']: revision,
    },
    residue,
  );
  return `<w:tcPr>${children}</w:tcPr>`;
}

const JC_OUT = { start: 'left', center: 'center', end: 'right' } as const;

/** The table as a `w:tbl`. */
export function ooxmlTableXml(host: OoxmlTableHost, table: Table): string {
  const tableValues = { columns: table.columns, align: table.align, indent: table.indent };
  const tblPr = keptStillHolds(table.kept, tableValues)
    ? host.kept(table.kept!.xml)
    : `<w:tblPr>${ordered(
        TBLPR_ORDER,
        {
          tblW: `<w:tblW w:w="${twips(Tables.width(table))}" w:type="dxa"/>`,
          jc: `<w:jc w:val="${JC_OUT[table.align ?? 'start']}"/>`,
          tblInd:
            table.indent === undefined
              ? undefined
              : `<w:tblInd w:w="${twips(table.indent)}" w:type="dxa"/>`,
          tblLayout: '<w:tblLayout w:type="fixed"/>',
        },
        (table.kept?.residue ?? []).map((r) => host.kept(r)),
      )}</w:tblPr>`;
  const grid = `<w:tblGrid>${table.columns.map((w) => `<w:gridCol w:w="${twips(w)}"/>`).join('')}</w:tblGrid>`;
  const places = Tables.grid(table);
  const rows = table.rows.map((row, r) => {
    const header = r < table.headerRows;
    const values = compact({ height: row.height, heightRule: row.heightRule, breaks: row.breaks });
    // A row's change: its own, else its table's, every row of a suggested table tracked.
    const rowSuggested = Suggestions.ofBlock(row.suggested) ?? Suggestions.ofBlock(table.suggested);
    const revision = rowSuggested && host.revision(rowSuggested, 'row');
    const trPr =
      !revision && keptStillHolds(row.kept, { ...values, header })
        ? host.kept(row.kept!.xml)
        : (() => {
            const children = ordered(
              TRPR_ORDER,
              {
                cantSplit: row.breaks === false ? '<w:cantSplit/>' : undefined,
                trHeight:
                  row.height === undefined
                    ? undefined
                    : `<w:trHeight w:val="${twips(row.height)}" w:hRule="${row.heightRule === 'exact' ? 'exact' : 'atLeast'}"/>`,
                tblHeader: header ? '<w:tblHeader/>' : undefined,
                [revision?.startsWith('<w:del') ? 'del' : 'ins']: revision,
              },
              (row.kept?.residue ?? []).map((k) => host.kept(k)),
            );
            return children ? `<w:trPr>${children}</w:trPr>` : '';
          })();
    // Each cell once, at its first column: where it starts, or a place of a row span it continues.
    const cells = places[r]!.flatMap((place, column) => {
      if (!place || place.column !== column) return [];
      const cell = place.cell;
      const width = Tables.cellWidth(table, place.column, cell);
      const spans = (cell.rowSpan ?? 1) > 1;
      if (!place.origin) return [`<w:tc>${tcPrXml(cell, width, 'continue', [])}<w:p/></w:tc>`];
      const cellSuggested = Suggestions.ofBlock(cell.suggested);
      const holds =
        !cellSuggested &&
        keptStillHolds(cell.kept, {
          props: cell.props,
          colSpan: cell.colSpan ?? 1,
          rowSpan: cell.rowSpan ?? 1,
          width,
        });
      const tcPr = holds
        ? host.kept(cell.kept!.xml)
        : tcPrXml(
            cell,
            width,
            spans ? 'restart' : undefined,
            (cell.kept?.residue ?? []).map((k) => host.kept(k)),
            cellSuggested && host.revision(cellSuggested, 'cell'),
          );
      const content = host.blocksXml(cell.blocks, Suggestions.ofCell(table, row, cell));
      const last = cell.blocks.at(-1);
      return [`<w:tc>${tcPr}${content}${last?.type === 'paragraph' ? '' : '<w:p/>'}</w:tc>`];
    });
    return `<w:tr>${trPr}${cells.join('')}</w:tr>`;
  });
  return `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>`;
}
