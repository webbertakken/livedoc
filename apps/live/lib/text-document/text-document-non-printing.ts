// Non-printing characters (docs/specs/034-text-documents/text-and-paragraphs.md "Non-printing characters"): while
// shown, ¶ at each paragraph's end, · in each space, ↵ at each line break, drawn as decorations so they are never part of
// the text; tabs and section breaks draw theirs from the writing's class.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { touchedParagraphs } from './text-document-tab-layout';

export const MARKS_CLASS = 'text-document-marks';

type MarksState = { shown: boolean; decorations: DecorationSet };

export const nonPrintingKey = new PluginKey<MarksState>('textDocumentNonPrinting');

const pilcrow = (): HTMLElement => {
  const mark = document.createElement('span');
  mark.className = 'text-document-pilcrow';
  mark.setAttribute('aria-hidden', 'true');
  return mark;
};

const CHARACTER_MARKS: Record<string, string> = {
  ' ': 'text-document-space-mark',
  '\n': 'text-document-break-mark',
};

// The marks inside a paragraph starting at `pos`.
function marksIn(node: PmNode, pos: number): Decoration[] {
  const out: Decoration[] = [];
  node.descendants((child, offset) => {
    if (!child.isText) return true;
    const text = child.text ?? '';
    const at = pos + 1 + offset;
    for (let i = 0; i < text.length; i += 1) {
      const name = CHARACTER_MARKS[text[i]!];
      if (name) out.push(Decoration.inline(at + i, at + i + 1, { class: name }));
    }
    return false;
  });
  out.push(
    Decoration.widget(pos + node.nodeSize - 1, pilcrow, {
      side: 1,
      ignoreSelection: true,
      key: 'pilcrow',
    }),
  );
  return out;
}

/** Every mark the document draws while they are shown. */
export function nonPrintingDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name === 'paragraph') decorations.push(...marksIn(node, pos));
  });
  return DecorationSet.create(doc, decorations);
}

const OFF: MarksState = { shown: false, decorations: DecorationSet.empty };

/** Shows or hides the marks. */
export function setNonPrinting(view: EditorView, shown: boolean): void {
  if (nonPrintingKey.getState(view.state)?.shown === shown) return;
  view.dispatch(view.state.tr.setMeta(nonPrintingKey, shown).setMeta('addToHistory', false));
}

export function nonPrintingPlugin(shown: boolean): Plugin<MarksState> {
  return new Plugin<MarksState>({
    key: nonPrintingKey,
    state: {
      init: (_config, state) =>
        shown ? { shown, decorations: nonPrintingDecorations(state.doc) } : OFF,
      apply: (tr, previous) => {
        const meta = tr.getMeta(nonPrintingKey) as boolean | undefined;
        const on = meta ?? previous.shown;
        if (!on) return OFF;
        if (meta !== undefined) return { shown: true, decorations: nonPrintingDecorations(tr.doc) };
        if (!tr.docChanged) return previous;
        // Mapped, and found again only in the paragraphs the change touched.
        let decorations = previous.decorations.map(tr.mapping, tr.doc);
        for (const pos of touchedParagraphs(tr)) {
          const node = tr.doc.nodeAt(pos)!;
          decorations = decorations
            .remove(decorations.find(pos, pos + node.nodeSize))
            .add(tr.doc, marksIn(node, pos));
        }
        return { shown: true, decorations };
      },
    },
    props: {
      decorations: (state: EditorState) => nonPrintingKey.getState(state)?.decorations,
      attributes: (state: EditorState): Record<string, string> =>
        nonPrintingKey.getState(state)?.shown ? { class: MARKS_CLASS } : {},
    },
  });
}
