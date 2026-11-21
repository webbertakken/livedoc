// How a table is drawn (docs/specs/034-text-documents/tables.md "In the editor"): the table at its columns' widths in
// points, aligned or indented; each row at its height; each cell with its background on the page's paper, its lines,
// padding and vertical alignment; a header row's cells as column headers. A side with no line shows a faint guide on
// screen (the style sheet's), never printed. Values are checked before they reach a style attribute.
import { tableNodes } from 'prosemirror-tables';
import type { DOMOutputSpec, Node as PmNode, NodeSpec } from 'prosemirror-model';
import {
  CELL_SIDES,
  TABLE,
  TABLE_ATTRIBUTES,
  TABLE_CELL,
  TABLE_CELL_ATTRIBUTES,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_ROW_ATTRIBUTES,
  type CellProps,
} from '@livedoc/text-documents';
import { borderCss, cssText } from './text-document-style-sheet';
import { paperFill } from './text-document-paper';

/** A table's own class, which the style sheet draws. */
export const TABLE_CLASS = 'text-document-table';
/** The sides of a cell with no line, by initial (`t`, `b`, `l`, `r`): where the guide is drawn. */
export const CELL_GUIDES = 'data-guides';

const HEX = /^#[0-9a-f]{6}$/i;
/** A length in points the drawing accepts: finite, from 0 to `most`. */
const length = (value: unknown, most: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= most ? value : null;
const pt = (value: number) => `${Math.round(value * 1000) / 1000}pt`;
/** The widest a page's text runs, in points: a table or a column past it is drawn no wider. */
const MOST_PT = 22 * 72;

const nullAttributes = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, { default: null }]));

/** The table's columns: its first row's cells' widths, each spanned column its own. */
export function columnWidths(table: PmNode): number[] {
  const first = table.firstChild;
  const widths: number[] = [];
  first?.forEach((cell) => {
    const { colspan, colwidth } = cell.attrs as { colspan: number; colwidth: unknown };
    for (let i = 0; i < (colspan || 1); i += 1) {
      const width = Array.isArray(colwidth) ? length(colwidth[i], MOST_PT) : null;
      widths.push(width ?? 72);
    }
  });
  return widths;
}

function tableDom(node: PmNode): DOMOutputSpec {
  const { align, indent } = node.attrs as { align: unknown; indent: unknown };
  const widths = columnWidths(node);
  const at = length(indent, MOST_PT);
  const style = cssText([
    `width: ${pt(widths.reduce((a, b) => a + b, 0))}`,
    align === 'center'
      ? 'margin-left: auto; margin-right: auto'
      : align === 'end'
        ? 'margin-left: auto'
        : at
          ? `margin-left: ${pt(at)}`
          : undefined,
  ]);
  return [
    'table',
    { class: TABLE_CLASS, style },
    ['colgroup', ...widths.map((w): DOMOutputSpec => ['col', { style: `width: ${pt(w)}` }])],
    ['tbody', 0],
  ];
}

function rowDom(node: PmNode): DOMOutputSpec {
  const height = length((node.attrs as { height: unknown }).height, MOST_PT);
  return height ? ['tr', { style: `height: ${pt(height)}` }, 0] : ['tr', 0];
}

/** A cell's formatting as CSS, and the sides it draws a guide on. */
export function cellStyle(props: CellProps | null): { style: string; guides: string } {
  const p = props ?? {};
  const guides: string[] = [];
  const declarations = CELL_SIDES.flatMap((side) => {
    const drawn = borderCss(p.borders?.[side]);
    if (drawn === 'none') {
      guides.push(side[0]!);
      return [];
    }
    return [`border-${side}: ${drawn}`];
  });
  for (const side of CELL_SIDES) {
    const padding = length(p.padding?.[side], 72 * 2);
    if (padding !== null) declarations.push(`padding-${side}: ${pt(padding)}`);
  }
  if (typeof p.background === 'string' && HEX.test(p.background))
    declarations.push(`background-color: ${paperFill(p.background)}`);
  if (p.verticalAlign === 'middle' || p.verticalAlign === 'bottom')
    declarations.push(`vertical-align: ${p.verticalAlign}`);
  return { style: cssText(declarations), guides: guides.join('') };
}

function cellDom(tag: 'td' | 'th') {
  return (node: PmNode): DOMOutputSpec => {
    const { colspan, rowspan, props } = node.attrs as {
      colspan: number;
      rowspan: number;
      props: CellProps | null;
    };
    const { style, guides } = cellStyle(props);
    return [
      tag,
      {
        ...(colspan > 1 ? { colspan: String(colspan) } : {}),
        ...(rowspan > 1 ? { rowspan: String(rowspan) } : {}),
        ...(tag === 'th' ? { scope: 'col' } : {}),
        ...(style ? { style } : {}),
        ...(guides ? { [CELL_GUIDES]: guides } : {}),
      },
      0,
    ];
  };
}

/** The table's node specs: `prosemirror-tables`' own, holding the live state's attributes, drawn as above. */
export function tableNodeSpecs(): Record<string, NodeSpec> {
  const cellAttributes = Object.fromEntries(
    TABLE_CELL_ATTRIBUTES.filter((n) => !['colspan', 'rowspan', 'colwidth'].includes(n)).map(
      (name) => [name, { default: null }],
    ),
  );
  const specs = tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes });
  return {
    [TABLE]: { ...specs.table, attrs: nullAttributes(TABLE_ATTRIBUTES), toDOM: tableDom },
    [TABLE_ROW]: { ...specs.table_row, attrs: nullAttributes(TABLE_ROW_ATTRIBUTES), toDOM: rowDom },
    [TABLE_CELL]: { ...specs.table_cell, toDOM: cellDom('td') },
    [TABLE_HEADER]: { ...specs.table_header, toDOM: cellDom('th') },
  };
}
