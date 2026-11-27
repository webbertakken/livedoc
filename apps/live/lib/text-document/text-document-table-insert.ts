// Putting rows and columns into a table (docs/specs/034-text-documents/tables.md "Working in a table"; review.md "Rows
// and columns", "Across merged cells"): each new row or column like the one beside it, a merged cell crossing the place
// growing over it. New rows and cells never carry the suggestion of what they copy. Each is one command, one undo step.
import type { Attrs, Node as PmNode } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';
import { addColumn, TableMap } from 'prosemirror-tables';
import {
  DELETION_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
  TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
} from '@livedoc/text-documents';
import { columnWidths } from './text-document-table-dom';
import { rectOf, roundPoints, setColumnWidths } from './text-document-table-edits';

/** `attrs` without any suggestion: what a new row, cell or paragraph copies from the one beside it. */
function unsuggested(attrs: Attrs | null | undefined): Attrs | null {
  if (!attrs) return null;
  const out: Record<string, unknown> = { ...attrs };
  for (const name of [INSERTION_MARK, DELETION_MARK, PARAGRAPH_FORMAT_CHANGE])
    if (name in out) out[name] = null;
  return out;
}

/** An empty cell like `source`: its type, lines and shading, one place, `colwidth` wide. */
function emptyCellLike(source: PmNode, colwidth: number[] | null): PmNode {
  return source.type.create(
    { ...unsuggested(source.attrs), colspan: 1, rowspan: 1, colwidth },
    source.type.schema.nodes.paragraph!.create(unsuggested(source.firstChild?.attrs)),
  );
}

/** The widths scaled so they sum to `total`. */
const scaledTo = (widths: readonly number[], total: number): number[] => {
  const sum = widths.reduce((a, b) => a + b, 0);
  return sum > 0 ? widths.map((w) => (w * total) / sum) : widths.map(() => total / widths.length);
};

/** A new row at grid row `index`, like row `like`: its cells' columns, lines and shading, empty, one row high. */
function insertRowAt(tr: Transaction, tableStart: number, index: number, like: number): void {
  const table = tr.doc.nodeAt(tableStart - 1)!;
  const map = TableMap.get(table);
  const { width, height } = map;
  const cells: PmNode[] = [];
  const grown = new Set<number>();
  let previous = -1;
  for (let col = 0; col < width; col++) {
    // A cell spanning down across the place grows by the row.
    if (index > 0 && index < height) {
      const above = map.map[(index - 1) * width + col]!;
      if (above === map.map[index * width + col]) {
        if (!grown.has(above)) {
          grown.add(above);
          const cell = table.nodeAt(above)!;
          tr.setNodeMarkup(tableStart + above, null, {
            ...cell.attrs,
            rowspan: (cell.attrs.rowspan as number) + 1,
          });
        }
        previous = -1;
        continue;
      }
    }
    const pos = map.map[like * width + col]!;
    const source = table.nodeAt(pos)!;
    const last = cells[cells.length - 1];
    if (pos === previous && last) {
      const attrs = last.attrs as { colspan: number; colwidth: number[] | null };
      const widths = columnWidths(table);
      cells[cells.length - 1] = last.type.create(
        {
          ...attrs,
          colspan: attrs.colspan + 1,
          colwidth: [...(attrs.colwidth ?? []), widths[col]!],
        },
        last.content,
      );
      continue;
    }
    previous = pos;
    const own = (source.attrs.colwidth as number[] | null)?.[col - map.findCell(pos).left];
    cells.push(emptyCellLike(source, own === undefined ? null : [own]));
  }
  // The row goes before grid row `index`'s row node, or at the table's end.
  let at = tableStart;
  for (let r = 0; r < index; r++) at += table.child(r).nodeSize;
  const likeRow = table.child(Math.min(like, table.childCount - 1));
  tr.insert(
    at,
    likeRow.type.create({ ...unsuggested(likeRow.attrs), height: null, heightRule: null }, cells),
  );
}

/**
 * A new column at grid column `index`, like column `like`, `width` wide, no other column's width changed: in each row
 * an empty cell like the like column's there, or, where a merged cell crosses the place, that cell grown over it, the
 * width added to its own, in one step (review.md "Across merged cells").
 */
function insertColumnAt(
  tr: Transaction,
  tableStart: number,
  index: number,
  like: number,
  width: number,
): void {
  const table = tr.doc.nodeAt(tableStart - 1)!;
  const map = TableMap.get(table);
  const w = roundPoints(width);
  // Last row first: what goes in later in the table never moves a place read from the map earlier in it.
  for (let row = map.height - 1; row >= 0; row--) {
    const place = row * map.width + index;
    const crossing = index > 0 && index < map.width && map.map[place - 1] === map.map[place];
    if (crossing) {
      const pos = map.map[place]!;
      const rect = map.findCell(pos);
      if (rect.top !== row) continue;
      const cell = table.nodeAt(pos)!;
      const widths = cell.attrs.colwidth as number[] | null;
      const at = index - rect.left;
      tr.setNodeMarkup(tableStart + pos, null, {
        ...cell.attrs,
        colspan: (cell.attrs.colspan as number) + 1,
        colwidth: widths ? [...widths.slice(0, at), w, ...widths.slice(at)] : null,
      });
      continue;
    }
    const source = table.nodeAt(map.map[row * map.width + like]!)!;
    tr.insert(tableStart + map.positionAt(row, index, table), emptyCellLike(source, [w]));
  }
}

/** Insert rows above the caret's or the selection's first row, or below its last; as many as it spans. */
export const insertRows =
  (side: 'above' | 'below'): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect) return false;
    const count = rect.bottom - rect.top;
    if (rect.map.height + count > TEXT_DOCUMENT_TABLE_MAX_ROWS) return false;
    if (dispatch) {
      const tr = state.tr;
      const like = side === 'above' ? rect.top : rect.bottom - 1;
      const index = side === 'above' ? rect.top : rect.bottom;
      // Each like the row it is beside; every insert at the same place pushes the earlier ones on.
      for (let i = 0; i < count; i++)
        insertRowAt(tr, rect.tableStart, index, side === 'above' ? like + i : like);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * Insert columns left of the caret's or the selection's first column, or right of its last; the table keeps its width,
 * or, with `keepWidths` (while suggesting), grows by the new columns, each its neighbour's width, no other cell
 * changed but a merged cell grown over one, so rejecting them gives the table back as it was (review.md "Rows and
 * columns").
 */
export const insertColumns =
  (side: 'left' | 'right', { keepWidths = false }: { keepWidths?: boolean } = {}): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect) return false;
    const count = rect.right - rect.left;
    if (rect.map.width + count > TEXT_DOCUMENT_TABLE_MAX_COLUMNS) return false;
    if (dispatch) {
      const tr = state.tr;
      const before = columnWidths(rect.table);
      const like = side === 'left' ? rect.left : rect.right - 1;
      const index = side === 'left' ? rect.left : rect.right;
      if (keepWidths) {
        // Each like the column it is beside, which a column put in left of it pushes on.
        for (let i = 0; i < count; i++)
          insertColumnAt(
            tr,
            rect.tableStart,
            index,
            side === 'left' ? like + i : like,
            before[like]!,
          );
        dispatch(tr.scrollIntoView());
        return true;
      }
      const total = before.reduce((a, b) => a + b, 0);
      const widths = [...before];
      for (let i = 0; i < count; i++) {
        const table = tr.doc.nodeAt(rect.tableStart - 1)!;
        const map = TableMap.get(table);
        addColumn(tr, { ...rect, table, map }, index);
        // The new cells take the like column's lines and shading.
        const after = tr.doc.nodeAt(rect.tableStart - 1)!;
        const next = TableMap.get(after);
        const source = side === 'left' ? like + 1 + i : like;
        for (let row = 0; row < next.height; row++) {
          const pos = next.map[row * next.width + index]!;
          const cell = after.nodeAt(pos)!;
          if ((cell.attrs.colspan as number) > 1) continue;
          const from = after.nodeAt(next.map[row * next.width + source]!)!;
          tr.setNodeMarkup(rect.tableStart + pos, null, {
            ...cell.attrs,
            props: from.attrs.props as unknown,
          });
        }
        widths.splice(index, 0, before[like]!);
      }
      setColumnWidths(tr, rect.tableStart, scaledTo(widths, total));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
