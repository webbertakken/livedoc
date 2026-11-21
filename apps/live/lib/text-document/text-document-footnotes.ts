// Footnotes' marks numbered (docs/specs/034-text-documents/page-layout.md "Footnotes", "Numbered", "Read"): each mark
// in the body is told its number, 1, 2, 3 in the order of the marks, which it draws in superscript and a screen reader
// reads as "Footnote N". Numbered again only when a change touches a mark; a change elsewhere moves the numbers along.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { FOOTNOTE } from '@livedoc/text-documents';

/** A mark's number, as its node decoration tells it. */
export const NOTE_NUMBER_ATTRIBUTE = 'data-number';

const key = new PluginKey<DecorationSet>('textDocumentFootnoteNumbers');

/** Each mark's number as a node decoration, in document order. */
export function footnoteNumbers(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== FOOTNOTE) return true;
    const number = String(decorations.length + 1);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        [NOTE_NUMBER_ATTRIBUTE]: number,
        'aria-label': `Footnote ${number}`,
      }),
    );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const holdsMark = (doc: PmNode, from: number, to: number): boolean => {
  let found = false;
  if (from < to)
    doc.nodesBetween(from, to, (node) => {
      if (node.type.name === FOOTNOTE) found = true;
      return !found;
    });
  return found;
};

/** Whether a change took a mark away or brought one: the numbers are told again. */
export function touchesMark(tr: Transaction): boolean {
  return tr.steps.some((step, i) => {
    const before = tr.docs[i]!;
    const after = tr.docs[i + 1] ?? tr.doc;
    let touched = false;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      touched ||= holdsMark(before, oldStart, oldEnd) || holdsMark(after, newStart, newEnd);
    });
    return touched;
  });
}

/** A note's box: the number its note is drawn with (`useTextDocumentStories` paints it). */
export const NOTE_BOX_NUMBER_ATTRIBUTE = 'data-note-number';

/** A note's copy led by its number in superscript, at the start of its first paragraph (Google's). */
export function numberNote(copy: HTMLElement, number: string): void {
  const lead = document.createElement('sup');
  lead.className = 'text-document-note-number';
  lead.textContent = number;
  (copy.firstElementChild ?? copy).prepend(lead);
}

export function footnoteNumbersPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, state) => footnoteNumbers(state.doc),
      apply: (tr, set) => {
        if (!tr.docChanged) return set;
        return touchesMark(tr) ? footnoteNumbers(tr.doc) : set.map(tr.mapping, tr.doc);
      },
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
