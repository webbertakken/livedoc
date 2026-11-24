// Blocks put in at the caret (docs/specs/034-text-documents/tables.md "Inserting", objects.md "Building blocks"): the
// selection's writing put away first; before an empty paragraph or one whose start has the caret, after one whose end
// has it with an empty paragraph following to write on below, and a paragraph split between, leaving no empty half.
import type { Node as PmNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { textDocumentSchema as schema } from './text-document-schema';

/** Puts `nodes` in at the transaction's caret; where they start, or null when the caret is in no text block. */
export function placeBlocks(tr: Transaction, nodes: readonly PmNode[]): number | null {
  if (!tr.selection.empty) tr.deleteSelection();
  const { $from } = tr.selection;
  if (!$from.parent.isTextblock) return null;
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
  tr.insert(at, nodes);
  return at;
}

/**
 * A place inside `nodes` as put in one after another: `path` picks a node at each depth down to a text block, and
 * `textOffset` counts characters into it. The result is relative to where the nodes start.
 */
export function offsetInside(
  nodes: readonly PmNode[],
  path: readonly number[],
  textOffset: number,
): number {
  let offset = 0;
  let siblings: readonly PmNode[] = nodes;
  for (const index of path) {
    for (let i = 0; i < index; i++) offset += siblings[i]!.nodeSize;
    const node = siblings[index]!;
    // Past the chosen node's opening.
    offset += 1;
    siblings = node.content.content;
  }
  return offset + textOffset;
}
