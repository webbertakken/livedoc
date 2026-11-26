// Whole blocks while suggesting (docs/specs/034-text-documents/review.md "Whole blocks", "Inside a suggested block"): a
// table, a section break or a table of contents is suggested whole; inside one's own suggested block every change is
// plainly part of it; a kept block is never suggested.
import type { Node as PmNode } from 'prosemirror-model';
import { AttrStep, ReplaceAroundStep, ReplaceStep, type Step } from 'prosemirror-transform';
import { INSERTION_MARK, type SuggestionMark } from '@livedoc/text-documents';

const PARAGRAPH = 'paragraph';

/** Whether a suggestion mark is `key`'s own. */
export const isOwn = (value: unknown, key: string): value is SuggestionMark =>
  typeof value === 'object' &&
  value !== null &&
  (value as { author?: { key?: unknown } }).author?.key === key;

/** The blocks suggested whole (review.md "Whole blocks"): their insertion or deletion is an attribute of their own. */
const WHOLE_BLOCKS = new Set(['table', 'section_break', 'table_of_contents']);
/** A table's rows and cells: written in as a table is, never suggested on their own (yet). */
const TABLE_PARTS = new Set(['table_row', 'table_cell', 'table_header']);

export const isWholeBlock = (node: PmNode): boolean => WHOLE_BLOCKS.has(node.type.name);
export const isTablePart = (node: PmNode): boolean => TABLE_PARTS.has(node.type.name);

/** Whether a node is a block the transform cannot suggest around: a kept block, anything not written or whole. */
export const isStructure = (node: PmNode): boolean =>
  node.isBlock &&
  node.type.name !== PARAGRAPH &&
  node.type.name !== 'doc' &&
  !isWholeBlock(node) &&
  !isTablePart(node);

/** The nearest block around a position carrying `key`'s own insertion, and where it starts; none when there is none. */
export function ownBlockAround(
  doc: PmNode,
  pos: number,
  key: string,
): { node: PmNode; at: number } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isWholeBlock(node) && isOwn(node.attrs[INSERTION_MARK], key))
      return { node, at: $pos.before(depth) };
  }
  return null;
}

/** Whether a step changes only what is inside one of `key`'s own suggested blocks: part of its suggestion. */
export function insideOwnBlock(step: Step, doc: PmNode, key: string): boolean {
  const range =
    step instanceof AttrStep
      ? { from: step.pos, to: step.pos }
      : step instanceof ReplaceStep || step instanceof ReplaceAroundStep
        ? { from: step.from, to: step.to }
        : null;
  if (!range) return false;
  const from = ownBlockAround(doc, range.from, key);
  const to = ownBlockAround(doc, range.to, key);
  return from !== null && to !== null && from.at === to.at && range.from > from.at;
}
