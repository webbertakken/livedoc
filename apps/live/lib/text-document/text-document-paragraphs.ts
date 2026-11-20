// The paragraphs a change to paragraphs applies to (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph
// styles", "Alignment and indents"): every paragraph the selection touches, or the caret's.
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';

/** The paragraphs the selection touches, each once, in order. */
export function selectedParagraphs(state: EditorState): { node: PmNode; pos: number }[] {
  const out: { node: PmNode; pos: number }[] = [];
  const seen = new Set<number>();
  for (const { $from, $to } of state.selection.ranges)
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      if (!seen.has(pos)) out.push({ node, pos });
      seen.add(pos);
      return false;
    });
  if (out.length === 0) {
    const $from = state.selection.$from;
    if ($from.parent.type.name === 'paragraph')
      out.push({ node: $from.parent, pos: $from.before() });
  }
  return out;
}
