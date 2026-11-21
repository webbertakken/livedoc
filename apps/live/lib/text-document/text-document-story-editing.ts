// What a header or footer is edited with (docs/specs/034-text-documents/page-layout.md "Editing headers and footers"):
// Escape leaves it, Alt+F10 goes to its bar; the caret's changes reach the toolbar as the body's do; its own undo; the keys of lists and of
// writing (Tab, Shift+Enter) and the editor's base keys, as in the body. A footnote's mark pasted or dropped in is left out.
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { FOOTNOTE } from '@livedoc/text-documents';
import type { TextFormatting } from './text-document-formatting';
import { listKeysPlugin } from './text-document-list-actions';
import { textDocumentUndoPlugins } from './text-document-undo';
import { writingKeysPlugin } from './text-document-writing-keys';

/** A slice without footnotes' marks: a header, footer or note holds none (page-layout.md "Footnotes"). */
export function withoutMarks(slice: Slice): Slice {
  const strip = (fragment: Fragment): Fragment => {
    const kept: PmNode[] = [];
    fragment.forEach((node) => {
      if (node.type.name !== FOOTNOTE)
        kept.push(node.isLeaf ? node : node.copy(strip(node.content)));
    });
    return Fragment.from(kept);
  };
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
}

export function storyEditingPlugins(input: {
  /** The plugin telling the toolbar of the caret's changes. */
  readonly caret: Plugin;
  readonly readFormatting: () => TextFormatting;
  /** Leaves the header or footer, back to the body. */
  readonly leave: () => void;
  /** Alt+F10: into the header's bar ("The bar"). */
  readonly toBar: () => void;
}): Plugin[] {
  return [
    keymap({
      Escape: () => {
        input.leave();
        return true;
      },
      'Alt-F10': () => {
        input.toBar();
        return true;
      },
    }),
    input.caret,
    new Plugin({ props: { transformPasted: withoutMarks } }),
    ...textDocumentUndoPlugins({ story: true }),
    listKeysPlugin(),
    writingKeysPlugin(input.readFormatting),
    keymap(baseKeymap),
  ];
}
