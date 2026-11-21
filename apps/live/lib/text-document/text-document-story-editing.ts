// What a header or footer is edited with (docs/specs/034-text-documents/page-layout.md "Editing headers and footers"):
// Escape leaves it, Alt+F10 goes to its bar; the caret's changes reach the toolbar as the body's do; its own undo; the keys of lists and of
// writing (Tab, Shift+Enter) and the editor's base keys, as in the body.
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Plugin } from 'prosemirror-state';
import type { TextFormatting } from './text-document-formatting';
import { listKeysPlugin } from './text-document-list-actions';
import { textDocumentUndoPlugins } from './text-document-undo';
import { writingKeysPlugin } from './text-document-writing-keys';

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
    ...textDocumentUndoPlugins({ story: true }),
    listKeysPlugin(),
    writingKeysPlugin(input.readFormatting),
    keymap(baseKeymap),
  ];
}
