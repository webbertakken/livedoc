// What kind of edit a transaction made (performance.md "A keystroke's frame"): an edit of text alone keeps every block,
// its type and its attributes, so what is drawn from the blocks alone is mapped through it, never drawn again.
import type { Fragment, Node as PmNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

// A step as its kind (its registered JSON id) and the range it changes; a replacement's slice too.
type SteppedRange = {
  jsonID?: string;
  from: number;
  to: number;
  slice?: { openStart: number; openEnd: number; content: Fragment };
};

/**
 * The textblocks an edit of text alone changed, each as it was before its step; null when the transaction changed
 * nothing, or changed more than text and its formatting inside textblocks (a block came, went, split, joined or changed
 * its attributes).
 */
export function editedTextblocks(tr: Transaction): PmNode[] | null {
  if (!tr.docChanged) return null;
  const edited: PmNode[] = [];
  for (const [i, step] of tr.steps.entries()) {
    const { jsonID, from, to, slice } = step as unknown as SteppedRange;
    const marked = jsonID === 'addMark' || jsonID === 'removeMark';
    if (!marked && (jsonID !== 'replace' || !slice || !inlineOnly(slice))) return null;
    const doc = tr.docs[i]!;
    const $from = doc.resolve(from);
    if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) return null;
    edited.push($from.parent);
  }
  return edited;
}

/** Whether the transaction changed the document by text and its formatting alone (`editedTextblocks`). */
export function changesTextOnly(tr: Transaction): boolean {
  return editedTextblocks(tr) !== null;
}

function inlineOnly(slice: NonNullable<SteppedRange['slice']>): boolean {
  if (slice.openStart !== 0 || slice.openEnd !== 0) return false;
  let inline = true;
  slice.content.forEach((node) => {
    if (!node.isInline) inline = false;
  });
  return inline;
}
