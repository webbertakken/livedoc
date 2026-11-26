// A table's rows and columns while suggesting (docs/specs/034-text-documents/review.md "Rows and columns", "Not yet"):
// a row or cell put in or taken out is suggested whole; writing in one's own suggested row or cell is plainly part of
// it; a row or column a merged cell crosses, and reshaping anyone else's table, are not yet (director, 2026-11-26).
import type { Node as PmNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { TableMap } from 'prosemirror-tables';
import {
  AttrStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Mapping,
  type Step,
} from 'prosemirror-transform';
import { INSERTION_MARK } from '@livedoc/text-documents';
import { insideOwnBlock, isOwn, isTablePart } from './text-document-suggesting-blocks';
import { TABLE_RESHAPE_META } from './text-document-table-edits';

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
 * Whether a row or cell at `pos` is one a merged cell crosses (review.md "Not yet"): a row any cell of which spans
 * more than one row; a cell spanning more than one row or column.
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
