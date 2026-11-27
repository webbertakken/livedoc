// A table's rows and columns while suggesting (docs/specs/034-text-documents/review.md "Rows and columns", "Across
// merged cells", "Not yet"): a row or cell put in or taken out is suggested whole, a merged cell crossing a row or
// column put in growing over it plainly; one deleted is marked, merged cells staying, one's own taken away shrinking
// them; writing in one's own suggested row or cell is plainly part of it; reshaping anyone else's table is not yet.
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { removeColumn, removeRow, TableMap, type TableRect } from 'prosemirror-tables';
import {
  AttrStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Mapping,
  type Step,
} from 'prosemirror-transform';
import { DELETION_MARK, INSERTION_MARK, type SuggestionMark } from '@livedoc/text-documents';
import { insideOwnBlock, isOwn, isTablePart } from './text-document-suggesting-blocks';
import { TABLE_RESHAPE_META, type TablePartsDeleted } from './text-document-table-edits';

const CELLS = new Set(['table_cell', 'table_header']);

/** Whether a reshape reaches outside one's own suggested block: not yet while suggesting. */
export function reshapesOthers(tr: Transaction, key: string): boolean {
  return (
    tr.getMeta(TABLE_RESHAPE_META) === true &&
    !tr.steps.every((step, i) => insideOwnBlock(step, tr.docs[i]!, key))
  );
}

/** The table a row or cell at `pos` stands in, where it starts, and its map. */
function tableAround(doc: PmNode, pos: number) {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'table')
      return { table: node, start: $pos.start(depth), map: TableMap.get(node) };
  }
  return null;
}

/**
 * Whether a row or cell at `pos` is one a merged cell crosses: a row any cell of which spans more than one row; a cell
 * spanning more than one row or column. One's own such part reached by a plain range delete is not yet: taking it away
 * would leave what crosses it too big (a row or column deleted by the table's commands goes by `deleteTableParts`).
 */
export function crossed(doc: PmNode, pos: number, node: PmNode): boolean {
  if (CELLS.has(node.type.name))
    return (node.attrs.colspan as number) > 1 || (node.attrs.rowspan as number) > 1;
  const found = tableAround(doc, pos + 1);
  if (!found) return false;
  const { table, start, map } = found;
  let row = 0;
  for (let at = start; at < pos; row++) at += table.child(row).nodeSize;
  for (let column = 0; column < map.width; column++) {
    const rect = map.findCell(map.map[row * map.width + column]!);
    if (rect.bottom - rect.top > 1) return true;
  }
  return false;
}

/** Whether a slice is only whole rows, or only whole cells: a table's rows or a column's cells put in. */
export function isTableParts(step: ReplaceStep): boolean {
  const { content, openStart, openEnd } = step.slice;
  if (content.childCount === 0 || openStart !== 0 || openEnd !== 0) return false;
  let all = true;
  content.forEach((node) => {
    if (!isTablePart(node)) all = false;
  });
  return all;
}

/** The own suggested row or cell around a position: the nearest carrying `key`'s insertion. */
function ownPartAround(doc: PmNode, pos: number, key: string): number | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isTablePart(node) && isOwn(node.attrs[INSERTION_MARK], key)) return $pos.before(depth);
  }
  return null;
}

/** The cell a position stands inside, where it starts; none outside a cell. */
function cellAround(doc: PmNode, pos: number): number | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--)
    if (CELLS.has($pos.node(depth).type.name)) return $pos.before(depth);
  return null;
}

/**
 * Whether a step changes only the writing inside one cell of one's own suggested row or cell: part of its suggestion
 * (review.md "Rows and columns"). Rows and cells added or taken out never are, so a column stays whole.
 */
export function insideOwnPart(step: Step, doc: PmNode, key: string): boolean {
  if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return false;
  let parts = false;
  step.slice.content.descendants((node) => {
    if (isTablePart(node)) parts = true;
    return !parts;
  });
  if (parts) return false;
  const cell = cellAround(doc, step.from);
  return (
    cell !== null &&
    cell === cellAround(doc, step.to) &&
    ownPartAround(doc, step.from, key) !== null
  );
}

/**
 * A step changing a row's or cell's own attributes (setNodeMarkup) where that row or cell is `key`'s own suggested one
 * in the rewritten transaction `out` (a new column's cells taking their neighbours' look): the change made there,
 * its suggestion kept, part of it; none for any other step. Made on the node found, never by mapping the step: a
 * position inside what this transaction put in cannot be mapped back through its inverted step.
 */
export function ownPartChange(
  step: Step,
  into: Mapping,
  out: Transaction,
  key: string,
): (() => void) | null {
  const pos =
    step instanceof AttrStep
      ? step.pos
      : step instanceof ReplaceAroundStep &&
          step.slice.content.childCount === 1 &&
          step.gapFrom === step.from + 1 &&
          step.gapTo === step.to - 1
        ? step.from
        : null;
  if (pos === null) return null;
  // Before the node: content put in at its place by an earlier step stays after it.
  const at = into.map(pos, -1);
  const node = out.doc.nodeAt(at);
  if (!node || !isTablePart(node) || !isOwn(node.attrs[INSERTION_MARK], key)) return null;
  const attrs =
    step instanceof AttrStep
      ? { ...node.attrs, [step.attr]: step.value as unknown }
      : (step as ReplaceAroundStep).slice.content.firstChild!.attrs;
  return () => {
    const insertion: unknown = node.attrs[INSERTION_MARK];
    out.setNodeMarkup(at, undefined, { ...attrs, [INSERTION_MARK]: insertion });
  };
}

const SPAN_ATTRIBUTES = new Set(['rowspan', 'colspan', 'colwidth']);

/**
 * A step growing anyone else's merged cell by one row or column over a row or column put in through it (review.md
 * "Across merged cells"): the growth made plainly on the cell found in `out`, its suggestion attributes kept, riding
 * with the person's own row or column; none for any other step (a change of widths alone is not one).
 */
export function spanGrowth(
  step: Step,
  doc: PmNode,
  into: Mapping,
  out: Transaction,
): (() => void) | null {
  const pos =
    step instanceof AttrStep
      ? step.pos
      : step instanceof ReplaceAroundStep &&
          step.slice.content.childCount === 1 &&
          step.gapFrom === step.from + 1 &&
          step.gapTo === step.to - 1
        ? step.from
        : null;
  if (pos === null) return null;
  const before = doc.nodeAt(pos);
  if (!before || !CELLS.has(before.type.name)) return null;
  const after =
    step instanceof AttrStep ? before : (step as ReplaceAroundStep).slice.content.firstChild!;
  if (after.type !== before.type) return null;
  const attrs: Record<string, unknown> =
    step instanceof AttrStep
      ? { ...before.attrs, [step.attr]: step.value as unknown }
      : { ...after.attrs };
  for (const [name, value] of Object.entries(before.attrs))
    if (!SPAN_ATTRIBUTES.has(name) && attrs[name] !== value) return null;
  const grows =
    (attrs.rowspan as number) +
    (attrs.colspan as number) -
    ((before.attrs.rowspan as number) + (before.attrs.colspan as number));
  if (grows !== 1) return null;
  const at = into.map(pos, -1);
  const node = out.doc.nodeAt(at);
  if (!node || node.type !== before.type) return null;
  return () => {
    out.setNodeMarkup(at, undefined, {
      ...node.attrs,
      rowspan: attrs.rowspan,
      colspan: attrs.colspan,
      colwidth: attrs.colwidth,
    });
  };
}

/** A row or cell deleted: `own` when one's own suggestion put it in, `inOwnRow` when it stands in one's own row. */
type TablePart = { pos: number; node: PmNode; own: boolean; inOwnRow?: boolean };

/**
 * Rows or columns deleted while suggesting (review.md "Rows and columns", "Across merged cells"), from the table as it
 * stood: anyone else's marked deleted as one suggestion, merged cells crossing them staying until Accept; one's own
 * taken away, last first, shrinking what crosses them as Delete row does. A column partly one's own is not yet.
 */
export function deleteTableParts(
  state: EditorState,
  parts: TablePartsDeleted,
  out: Transaction,
  key: string,
  mark: (from: number, to: number) => SuggestionMark,
): 'structure' | null {
  const table = state.doc.nodeAt(parts.tableStart - 1);
  if (table?.type.name !== 'table') return 'structure';
  const map = TableMap.get(table);
  const rowStarts: number[] = [];
  let at = parts.tableStart;
  table.forEach((row) => {
    rowStarts.push(at);
    at += row.nodeSize;
  });
  const ownRow = (row: number) => isOwn(table.child(row).attrs[INSERTION_MARK], key);
  const groups: { index: number; parts: TablePart[] }[] = [];
  for (let index = parts.from; index < parts.to; index++) {
    if (parts.axis === 'rows') {
      groups.push({
        index,
        parts: [{ pos: rowStarts[index]!, node: table.child(index), own: ownRow(index) }],
      });
      continue;
    }
    // A column's cells wholly inside the columns deleted; a merged cell reaching past them crosses it and stays.
    const cells: TablePart[] = [];
    const seen = new Set<number>();
    for (let row = 0; row < map.height; row++) {
      const cellPos = map.map[row * map.width + index]!;
      if (seen.has(cellPos)) continue;
      seen.add(cellPos);
      const rect = map.findCell(cellPos);
      if (rect.left < parts.from || rect.right > parts.to) continue;
      const node = table.nodeAt(cellPos)!;
      cells.push({
        pos: parts.tableStart + cellPos,
        node,
        own: isOwn(node.attrs[INSERTION_MARK], key),
        inOwnRow: ownRow(rect.top),
      });
    }
    groups.push({ index, parts: cells });
  }
  // One's own column: one's own cells, any other standing in one's own row. Anyone else's: every cell marked, a cell
  // of one's own row too (accepted, the column goes from it). Partly one's own beside anyone else's: not yet.
  const own = groups.filter(
    (g) => g.parts.some((p) => p.own) && g.parts.every((p) => p.own || p.inOwnRow),
  );
  if (groups.some((g) => !own.includes(g) && g.parts.some((p) => p.own))) return 'structure';
  const marked = new Map<number, PmNode>();
  for (const group of groups)
    if (!own.includes(group))
      for (const part of group.parts)
        if (!part.node.attrs[DELETION_MARK]) marked.set(part.pos, part.node);
  if (marked.size > 0) {
    // Asked of the first part alone, as each deleted part's step was: never joined to a suggestion it passes over.
    const first = Math.min(...marked.keys());
    const suggestion = mark(first, first + marked.get(first)!.nodeSize);
    for (const [pos, node] of marked)
      out.setNodeMarkup(pos, undefined, { ...node.attrs, [DELETION_MARK]: suggestion });
  }
  for (const { index } of [...own].sort((a, b) => b.index - a.index)) {
    const now = out.doc.nodeAt(parts.tableStart - 1)!;
    const rect: TableRect = {
      map: TableMap.get(now),
      table: now,
      tableStart: parts.tableStart,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };
    if (parts.axis === 'rows') removeRow(out, rect, index);
    else removeColumn(out, rect, index);
  }
  return null;
}
