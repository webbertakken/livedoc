// The caret the person moved (docs/specs/034-text-documents/editing-surface.md "The caret"): the browser moves the
// page's selection for a key and the editor reads it a moment later. A change that edits the document and sets no
// selection of its own (a collaborator's edit, a field brought up to date) would, in that moment, write the editor's
// older selection back over the page's. After each of its updates the editor's selection is on the page, so the page's
// selection is recorded then; a page selection that differs from that record is the person's newer move, kept through
// the change. Versions are compared, never times.
import { Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';

type PageRange = {
  readonly anchorNode: Node | null;
  readonly anchorOffset: number;
  readonly focusNode: Node | null;
  readonly focusOffset: number;
};

/** The page's selection as each editor last left it. */
const left = new WeakMap<EditorView, PageRange>();

const pageRange = (view: EditorView): PageRange | null => {
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  return { anchorNode, anchorOffset, focusNode, focusOffset };
};

const same = (a: PageRange, b: PageRange) =>
  a.anchorNode === b.anchorNode &&
  a.anchorOffset === b.anchorOffset &&
  a.focusNode === b.focusNode &&
  a.focusOffset === b.focusOffset;

/** Records the page's selection after each of the editor's updates, as the editor left it. */
export function pageSelectionPlugin(): Plugin {
  const record = (view: EditorView) => {
    const range = pageRange(view);
    if (range) left.set(view, range);
  };
  return new Plugin({
    view: (view) => {
      record(view);
      return { update: record, destroy: () => left.delete(view) };
    },
  });
}

/**
 * The person's newer selection: the page's, where it moved since the editor last left it, lies in the editor and is
 * not the editor's own; null otherwise (nothing moved, the focus elsewhere, a composition, a node or cell selected).
 */
export function unreadSelection(view: EditorView): { anchor: number; head: number } | null {
  const was = left.get(view);
  const now = pageRange(view);
  if (!was || !now || same(was, now) || view.composing || !view.hasFocus()) return null;
  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) return null;
  const { anchorNode, focusNode } = now;
  if (!anchorNode || !focusNode || !view.dom.contains(anchorNode) || !view.dom.contains(focusNode))
    return null;
  try {
    // Read as ProseMirror reads the page's selection: each end biased forward.
    const anchor = view.posAtDOM(anchorNode, now.anchorOffset, 1);
    const head = view.posAtDOM(focusNode, now.focusOffset, 1);
    return anchor === selection.anchor && head === selection.head ? null : { anchor, head };
  } catch {
    // A spot the editor cannot place (inside a drawn object): its own selection stands.
    return null;
  }
}

const textSelection = (tr: Transaction, anchor: number, head: number) =>
  TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head));

/** A change the editor makes on its own keeps the person's newer selection, mapped through it, never the older one. */
export function keepUnreadSelection(view: EditorView, tr: Transaction): Transaction {
  if (tr.selectionSet) return tr;
  const unread = unreadSelection(view);
  if (!unread) return tr;
  debugLog('[text-document] caret kept', { from: view.state.selection.head, to: unread.head });
  return tr.setSelection(
    textSelection(tr, tr.mapping.map(unread.anchor), tr.mapping.map(unread.head)),
  );
}
