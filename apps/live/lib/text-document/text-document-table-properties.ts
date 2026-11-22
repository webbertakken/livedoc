// Table properties (docs/specs/034-text-documents/tables.md "Table properties"): what the panel shows of the cells it
// changes (the selected ones, else the caret's), blank where they differ, and each change it makes: a cell's background,
// lines, padding and vertical alignment; their rows' minimum height; their columns' width; the table's alignment and
// indent. Each change is one command, one undo step.
import type { Node as PmNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { isInTable, selectedRect, type TableRect } from 'prosemirror-tables';
import {
  CELL_SIDES,
  type BorderLine,
  type CellProps,
  type CellVerticalAlign,
} from '@livedoc/text-documents';
import { columnWidths } from './text-document-table-dom';
import { headerRowsOf, pinHeaderRows, setColumnWidths } from './text-document-table-edits';

/** Google's border widths, in points. */
export const TABLE_BORDER_WIDTHS: readonly number[] = [0, 0.5, 1, 1.5, 2.25, 3, 4.5, 6];
/** The most header rows the panel offers to pin (default). */
export const MOST_HEADER_ROWS = 10;
/** The narrowest a column is set: 0.1 in. */
export const MIN_COLUMN_WIDTH_PT = 7.2;

export type TableAlignChoice = 'start' | 'center' | 'end';

/** What the panel shows, in points; null where the cells it changes differ. */
export type TableProperties = {
  readonly rowHeight: number | null;
  // Whether the rows may break across pages; null where they differ.
  readonly rowBreaks: boolean | null;
  // The table's pinned header rows, and the most it may pin.
  readonly headerRows: number;
  readonly mostHeaderRows: number;
  readonly columnWidth: number | null;
  readonly verticalAlign: CellVerticalAlign | null;
  readonly align: TableAlignChoice;
  readonly indent: number;
  readonly borderColor: string | null;
  readonly borderWidth: number | null;
  // `#rrggbb`, '' for none, null where they differ.
  readonly background: string | null;
  readonly padding: number | null;
};

export type TablePropertyChange =
  | {
      readonly field: 'rowHeight' | 'columnWidth' | 'indent' | 'borderWidth' | 'padding';
      readonly value: number;
    }
  | { readonly field: 'headerRows'; readonly value: number }
  | { readonly field: 'rowBreaks'; readonly value: boolean }
  | { readonly field: 'verticalAlign'; readonly value: CellVerticalAlign }
  | { readonly field: 'align'; readonly value: TableAlignChoice }
  | { readonly field: 'borderColor'; readonly value: string }
  | { readonly field: 'background'; readonly value: string | null };

const BLACK_LINE: BorderLine = { width: 1, dash: 'solid', color: '#000000', space: 0 };

/** One value all share, else null. */
function shared<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null;
  const first = JSON.stringify(values[0]);
  return values.every((v) => JSON.stringify(v) === first) ? values[0]! : null;
}

type Target = {
  readonly rect: TableRect;
  // Each changed cell's position in the document, and the cell.
  readonly cells: readonly { readonly pos: number; readonly node: PmNode }[];
  // Each changed row's position in the document, and the row.
  readonly rows: readonly { readonly pos: number; readonly node: PmNode }[];
};

function targetOf(state: EditorState): Target | null {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const cells = rect.map
    .cellsInRect(rect)
    .map((pos) => ({ pos: rect.tableStart + pos, node: rect.table.nodeAt(pos)! }));
  const rows: { pos: number; node: PmNode }[] = [];
  let at = rect.tableStart;
  rect.table.forEach((row, _offset, index) => {
    if (index >= rect.top && index < rect.bottom) rows.push({ pos: at, node: row });
    at += row.nodeSize;
  });
  return { rect, cells, rows };
}

const propsOf = (cell: PmNode): CellProps => (cell.attrs.props as CellProps | null) ?? {};

/** The panel's values at the caret or the selection; null outside a table. */
export function tablePropertiesAt(state: EditorState): TableProperties | null {
  const target = targetOf(state);
  if (!target) return null;
  const { rect, cells, rows } = target;
  const props = cells.map(({ node }) => propsOf(node));
  const sides = props.flatMap((p) => CELL_SIDES.map((side) => p.borders?.[side]));
  const widths = columnWidths(rect.table).slice(rect.left, rect.right);
  const { align, indent } = rect.table.attrs as { align: unknown; indent: unknown };
  return {
    rowHeight: shared(rows.map(({ node }) => (node.attrs.height as number | null) ?? 0)),
    rowBreaks: shared(rows.map(({ node }) => node.attrs.breaks !== false)),
    headerRows: headerRowsOf(rect.table),
    mostHeaderRows: Math.min(MOST_HEADER_ROWS, rect.table.childCount - 1),
    columnWidth: shared(widths),
    verticalAlign: shared(props.map((p) => p.verticalAlign ?? 'top')),
    align: align === 'center' || align === 'end' ? align : 'start',
    indent: typeof indent === 'number' ? indent : 0,
    borderColor: shared(sides.map((line) => line?.color ?? null)),
    borderWidth: shared(sides.map((line) => line?.width ?? 0)),
    background: shared(props.map((p) => p.background ?? '')),
    padding: shared(props.flatMap((p) => CELL_SIDES.map((side) => p.padding?.[side] ?? 0))),
  };
}

/** A cell's props with the change, or the props unchanged for a field that is not a cell's. */
function changedProps(props: CellProps, change: TablePropertyChange): CellProps {
  switch (change.field) {
    case 'background': {
      if (change.value) return { ...props, background: change.value };
      const { background: _gone, ...without } = props;
      return without;
    }
    case 'verticalAlign':
      return { ...props, verticalAlign: change.value };
    case 'padding':
      return {
        ...props,
        padding: {
          top: change.value,
          bottom: change.value,
          left: change.value,
          right: change.value,
        },
      };
    case 'borderWidth': {
      if (change.value <= 0) {
        const { borders: _gone, ...without } = props;
        return without;
      }
      const line = (side: (typeof CELL_SIDES)[number]): BorderLine => ({
        ...(props.borders?.[side] ?? BLACK_LINE),
        width: change.value,
        dash: 'solid',
      });
      return {
        ...props,
        borders: {
          top: line('top'),
          bottom: line('bottom'),
          left: line('left'),
          right: line('right'),
        },
      };
    }
    case 'borderColor': {
      const line = (side: (typeof CELL_SIDES)[number]): BorderLine => ({
        ...(props.borders?.[side] ?? BLACK_LINE),
        color: change.value,
      });
      return {
        ...props,
        borders: {
          top: line('top'),
          bottom: line('bottom'),
          left: line('left'),
          right: line('right'),
        },
      };
    }
    default:
      return props;
  }
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Make one change over the selected cells, their rows, their columns or the table. */
export const setTableProperty =
  (change: TablePropertyChange): Command =>
  (state, dispatch) => {
    if (change.field === 'headerRows') return pinHeaderRows(change.value)(state, dispatch);
    const target = targetOf(state);
    if (!target) return false;
    if (!dispatch) return true;
    const { rect, cells, rows } = target;
    const tr = state.tr;
    switch (change.field) {
      case 'rowHeight':
        for (const { pos, node } of rows)
          tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            height: change.value > 0 ? round(change.value) : null,
            heightRule: null,
          });
        break;
      case 'rowBreaks':
        // A row may break unless it says not (the model's `breaks`).
        for (const { pos, node } of rows)
          tr.setNodeMarkup(pos, null, { ...node.attrs, breaks: change.value ? null : false });
        break;
      case 'columnWidth': {
        const widths = columnWidths(rect.table).map((w, i) =>
          i >= rect.left && i < rect.right ? Math.max(MIN_COLUMN_WIDTH_PT, round(change.value)) : w,
        );
        setColumnWidths(tr, rect.tableStart, widths);
        break;
      }
      case 'align':
        tr.setNodeMarkup(rect.tableStart - 1, null, {
          ...rect.table.attrs,
          align: change.value === 'start' ? null : change.value,
        });
        break;
      case 'indent':
        tr.setNodeMarkup(rect.tableStart - 1, null, {
          ...rect.table.attrs,
          indent: change.value > 0 ? round(change.value) : null,
        });
        break;
      default:
        for (const { pos, node } of cells)
          tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            props: changedProps(propsOf(node), change),
          });
    }
    dispatch(tr);
    return true;
  };
