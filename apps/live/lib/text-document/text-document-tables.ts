// Putting a table in and moving through it (docs/specs/034-text-documents/tables.md "Inserting", "Working in a table"):
// a new table's columns share the text width at the caret, every cell lined and padded as Google's; Tab and Shift+Tab
// move between cells, Tab in the last cell adding a row like the last.
import type { Node as PmNode } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { TextSelection, type Command, type EditorState, type Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { goToNextCell, isInTable, TableMap } from 'prosemirror-tables';
import {
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
  type BorderLine,
  type CellProps,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { GridSize } from '@/lib/office/size-grid';
import { track } from '@/lib/telemetry';
import { startUndoStep } from './text-document-undo';
import { textDocumentSchema as schema } from './text-document-schema';

const LINE: BorderLine = { width: 1, dash: 'solid', color: '#000000', space: 0 };
/** Google's padding, 0.069 in, in points. */
const NEW_TABLE_PADDING_PT = 5;

/** A new table's cell: a 1 pt black line on every side and Google's padding (tables.md "Inserting", default). */
export const NEW_TABLE_CELL: CellProps = {
  borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
  padding: {
    top: NEW_TABLE_PADDING_PT,
    bottom: NEW_TABLE_PADDING_PT,
    left: NEW_TABLE_PADDING_PT,
    right: NEW_TABLE_PADDING_PT,
  },
};

/** The table the tool finder's Table inserts (default). */
export const TOOL_FINDER_TABLE: GridSize = { columns: 3, rows: 3 };

const round = (value: number) => Math.round(value * 100) / 100;

/** A new table of empty cells, its columns sharing `width` points. */
export function newTable({ columns, rows, width }: GridSize & { width: number }): PmNode {
  const column = round(width / columns);
  const row = () =>
    schema.nodes.table_row!.create(
      null,
      Array.from({ length: columns }, () =>
        schema.nodes.table_cell!.create(
          { colspan: 1, rowspan: 1, colwidth: [column], props: NEW_TABLE_CELL },
          schema.nodes.paragraph!.create(),
        ),
      ),
    );
  return schema.nodes.table!.create(null, Array.from({ length: rows }, row));
}

const isCell = (node: PmNode) => {
  const role = node.type.spec.tableRole as string | undefined;
  return role === 'cell' || role === 'header_cell';
};

/** The width a table inserted at the caret takes: the cell's less its padding inside a table, else `sectionWidth`. */
export function tableWidthAt(state: EditorState, sectionWidth: number): number {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (!isCell(node)) continue;
    const { colwidth, props } = node.attrs as { colwidth: unknown; props: CellProps | null };
    const widths = Array.isArray(colwidth) ? colwidth.filter((w) => typeof w === 'number') : [];
    const padding = (props?.padding?.left ?? 0) + (props?.padding?.right ?? 0);
    return Math.max(1, widths.reduce((a: number, b: number) => a + b, 0) - padding);
  }
  return sectionWidth;
}

/**
 * Insert a table at the caret, the selection's writing put away first: an empty paragraph's place taken, a paragraph
 * split with no empty half, an empty paragraph after the table when its paragraph has no writing after the caret.
 */
export const insertTable =
  (size: GridSize, width: number): Command =>
  (state, dispatch) => {
    const tr = state.tr;
    if (!state.selection.empty) tr.deleteSelection();
    const { $from } = tr.selection;
    if (!$from.parent.isTextblock) return false;
    const table = newTable({ ...size, width });
    const empty = $from.parent.content.size === 0;
    let at: number;
    if (empty || $from.parentOffset === 0) at = $from.before();
    else if ($from.parentOffset === $from.parent.content.size) {
      at = $from.after();
      tr.insert(at, schema.nodes.paragraph!.create());
    } else {
      tr.split($from.pos);
      at = $from.pos + 1;
    }
    tr.insert(at, table);
    // Into the first cell's paragraph: past the table's, row's, cell's and paragraph's openings.
    tr.setSelection(TextSelection.create(tr.doc, at + 4)).scrollIntoView();
    dispatch?.(tr);
    return true;
  };

/** A row like the table's last: each of its cells' columns, lines and shading, one row high and empty. */
function rowLikeLast(table: PmNode): PmNode {
  const map = TableMap.get(table);
  const last = map.height - 1;
  const cells: PmNode[] = [];
  let previous = -1;
  for (let column = 0; column < map.width; column++) {
    const pos = map.map[last * map.width + column]!;
    if (pos === previous) continue;
    previous = pos;
    const cell = table.nodeAt(pos)!;
    cells.push(
      cell.type.create(
        { ...cell.attrs, rowspan: 1 },
        schema.nodes.paragraph!.create(cell.firstChild?.attrs ?? null),
      ),
    );
  }
  return schema.nodes.table_row!.create(table.lastChild?.attrs ?? null, cells);
}

/** Tab (1) and Shift+Tab (-1) in a table; Tab in its last cell adds a row like the last, while it has room for one. */
export const goToCell =
  (direction: 1 | -1, onRowAdded?: () => void): Command =>
  (state, dispatch, view) => {
    if (!isInTable(state)) return false;
    if (goToNextCell(direction)(state, dispatch, view)) return true;
    // Shift+Tab in the first cell stays.
    if (direction === -1) return true;
    const { $from } = state.selection;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type.spec.tableRole !== 'table') depth--;
    const table = $from.node(depth);
    if (table.childCount >= TEXT_DOCUMENT_TABLE_MAX_ROWS) return true;
    const end = $from.end(depth);
    const tr = state.tr.insert(end, rowLikeLast(table));
    // Into the new row's first cell's paragraph.
    tr.setSelection(TextSelection.create(tr.doc, end + 3)).scrollIntoView();
    if (dispatch) {
      dispatch(tr);
      onRowAdded?.();
    }
    return true;
  };

const rowAdded = () => {
  track('Element', 'Changed', 'TextDocumentTableInsertRow');
  debugLog('[text-document] table', { change: 'row-added' });
};

/** Tab and Shift+Tab in a table where the writing takes edits, bound ahead of the lists' and the writing's. */
export function tableKeysPlugin(): Plugin {
  const editing =
    (command: Command): Command =>
    (state, dispatch, view) =>
      view?.editable === true && command(state, dispatch, view);
  return keymap({ Tab: editing(goToCell(1, rowAdded)), 'Shift-Tab': editing(goToCell(-1)) });
}

/** Insert > Table for an Editor: the grid's size, or the tool finder's 3 x 3, at the caret's text width. */
export function textDocumentTableActions(
  view: EditorView | null,
  { canEdit, sectionWidth }: { canEdit: boolean; sectionWidth: number },
): OfficeActions {
  if (!canEdit) return {};
  const insert = (size: GridSize) => {
    if (!view || view.isDestroyed) return;
    // A step of its own: the writing before it and after it undo apart.
    startUndoStep(view);
    if (insertTable(size, tableWidthAt(view.state, sectionWidth))(view.state, view.dispatch)) {
      startUndoStep(view);
      track('Element', 'Added', 'TextDocumentTable');
      debugLog('[text-document] table', { change: 'inserted', ...size });
    }
    view.focus();
  };
  return { 'table-grid': { run: () => insert(TOOL_FINDER_TABLE), runSized: insert } };
}
