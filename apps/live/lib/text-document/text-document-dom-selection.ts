// The selection as the page shows it, read into the editor before a command acts on it (docs/specs/034-text-documents/
// text-and-paragraphs.md "Text formatting"). The editor reads a moved selection from the page a moment after it moves;
// the shortcut layer hears a key before the editor does, so Shift+Right then Ctrl+B, typed quickly, would otherwise
// format the selection as it was one key before.
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';

export function readDomSelection(view: EditorView): void {
  if (!(view.state.selection instanceof TextSelection)) return;
  const shown = view.dom.ownerDocument.getSelection();
  const { anchorNode, focusNode } = shown ?? {};
  if (!shown || !anchorNode || !focusNode) return;
  if (!view.dom.contains(anchorNode) || !view.dom.contains(focusNode)) return;
  try {
    const anchor = view.posAtDOM(anchorNode, shown.anchorOffset);
    const head = view.posAtDOM(focusNode, shown.focusOffset);
    const { selection, doc } = view.state;
    if (anchor === selection.anchor && head === selection.head) return;
    const next = TextSelection.between(doc.resolve(anchor), doc.resolve(head));
    view.dispatch(view.state.tr.setSelection(next).setMeta('addToHistory', false));
  } catch (error) {
    debugLog('[text-document] dom selection unreadable', { error: String(error) });
  }
}
