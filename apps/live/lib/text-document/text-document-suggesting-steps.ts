// What a step the Suggesting transform replays does (docs/specs/034-text-documents/review.md "While suggesting"): a
// paragraph's style, formatting or list set, an object in a line changed in place, or an object in a line put in alone.
import type { Node as PmNode } from 'prosemirror-model';
import { AttrStep, ReplaceAroundStep, ReplaceStep, type Step } from 'prosemirror-transform';

/** The paragraph attributes a paragraph format suggestion keeps from before. */
export const PARAGRAPH_FORMAT_ATTRIBUTES = ['style', 'props', 'list'] as const;
const PARAGRAPH = 'paragraph';

type Attrs = Record<string, unknown>;

/** The paragraph attributes a node-markup step sets, when it only changes a paragraph's style, formatting or list. */
export function paragraphMarkup(step: Step, doc: PmNode): { pos: number; attrs: Attrs } | null {
  if (step instanceof AttrStep) {
    const node = doc.nodeAt(step.pos);
    if (node?.type.name !== PARAGRAPH || !PARAGRAPH_FORMAT_ATTRIBUTES.includes(step.attr as never))
      return null;
    return { pos: step.pos, attrs: { ...node.attrs, [step.attr]: step.value as unknown } };
  }
  if (!(step instanceof ReplaceAroundStep)) return null;
  const node = doc.nodeAt(step.from);
  const replacement = step.slice.content.firstChild;
  if (
    !node ||
    node.type.name !== PARAGRAPH ||
    replacement?.type !== node.type ||
    step.slice.content.childCount !== 1 ||
    step.to !== step.from + node.nodeSize ||
    step.gapFrom !== step.from + 1 ||
    step.gapTo !== step.to - 1
  )
    return null;
  const changed = Object.keys(replacement.attrs).filter(
    (a) => JSON.stringify(replacement.attrs[a]) !== JSON.stringify(node.attrs[a]),
  );
  if (!changed.every((a) => PARAGRAPH_FORMAT_ATTRIBUTES.includes(a as never))) return null;
  return { pos: step.from, attrs: replacement.attrs };
}

/**
 * The object in a line a step changes in place (its attribute set, or the object replaced by one of its type, as
 * setNodeMarkup does), at its position before the step; null for any other step.
 */
export function objectChange(step: Step, doc: PmNode): { pos: number; node: PmNode } | null {
  if (step instanceof AttrStep) {
    const node = doc.nodeAt(step.pos);
    return node?.isInline && node.isAtom ? { pos: step.pos, node } : null;
  }
  if (!(step instanceof ReplaceStep)) return null;
  const node = doc.nodeAt(step.from);
  const replacement = step.slice.content.firstChild;
  return node?.isInline &&
    node.isAtom &&
    !node.isText &&
    step.to === step.from + node.nodeSize &&
    step.slice.openStart === 0 &&
    step.slice.openEnd === 0 &&
    step.slice.content.childCount === 1 &&
    replacement?.type === node.type
    ? { pos: step.from, node }
    : null;
}

/** The object in a line a slice is, alone; null for any other slice. */
export const loneObject = (step: ReplaceStep): PmNode | null => {
  const only = step.slice.content.childCount === 1 ? step.slice.content.firstChild : null;
  return only?.isInline && only.isAtom && !only.isText ? only : null;
};
