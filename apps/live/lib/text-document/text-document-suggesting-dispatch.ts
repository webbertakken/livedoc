// How the editor applies a transaction around suggesting (docs/specs/034-text-documents/review.md "Suggesting",
// "While suggesting"): while the person suggests, their transaction is rewritten as suggestions, or refused; while they
// edit, what a split or a paste copies of a suggestion is left out, so a new paragraph or pasted text is plain. What
// the room or an undo brings (y-prosemirror's own transactions) is applied as it comes.
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import { ySyncPluginKey } from 'y-prosemirror';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
} from '@livedoc/text-documents';
import type { PendingMedia } from './text-document-pending-media';
import {
  suggestTransaction,
  type Suggester,
  type SuggestingRefusal,
} from './text-document-suggesting';

export type SuggestingDispatch = {
  /** Who suggests now, or null while the person edits (or may not suggest). */
  readonly suggester: () => Suggester | null;
  readonly onRefused: (reason: SuggestingRefusal) => void;
  /** The suggestions a transaction began (never one it joined). */
  readonly onMade: (ids: readonly string[]) => void;
  /** What goes with a local change: wraps each one applied (its pasted media), and is dropped when one is refused. */
  readonly alongside?: Pick<PendingMedia, 'apply' | 'drop'>;
};

const fromSync = (tr: Transaction): boolean =>
  (tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin === true;

/** The transaction with what its insertions copied of a suggestion left out: marks on new text, a new paragraph's. */
export function withoutCopiedSuggestions(tr: Transaction): Transaction {
  const ranges: [number, number][] = [];
  tr.steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep) || step.slice.size === 0) return;
    const after = tr.mapping.slice(i + 1);
    const start = after.map(step.from, -1);
    const end = after.map(step.from + step.slice.size, 1);
    if (start < end) ranges.push([start, Math.min(end, tr.doc.content.size)]);
  });
  const schema = tr.doc.type.schema;
  for (const [from, to] of ranges) {
    for (const name of [INSERTION_MARK, DELETION_MARK, FORMAT_CHANGE_MARK])
      tr.removeMark(from, to, schema.marks[name]);
    tr.doc.nodesBetween(from, to, (node, pos) => {
      const attrs = node.attrs as Record<string, unknown>;
      const copied = Boolean(
        attrs[INSERTION_MARK] ||
        attrs[DELETION_MARK] ||
        (node.type.name === 'paragraph' && attrs[PARAGRAPH_FORMAT_CHANGE]),
      );
      if (copied && pos >= from && !node.isText)
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [INSERTION_MARK]: null,
          [DELETION_MARK]: null,
          ...(node.type.name === 'paragraph' ? { [PARAGRAPH_FORMAT_CHANGE]: null } : {}),
        });
      return true;
    });
  }
  return tr;
}

/** Applies `tr` to the view as the person's mode asks. */
export function dispatchWithSuggesting(
  view: EditorView,
  tr: Transaction,
  context: SuggestingDispatch,
): void {
  if (!tr.docChanged || fromSync(tr)) {
    view.updateState(view.state.apply(tr));
    return;
  }
  const apply = (next: Transaction) => {
    const write = () => view.updateState(view.state.apply(next));
    if (context.alongside) context.alongside.apply(write);
    else write();
  };
  const suggester = context.suggester();
  if (!suggester) {
    apply(withoutCopiedSuggestions(tr));
    return;
  }
  const result = suggestTransaction(view.state, tr, suggester);
  if ('refused' in result) {
    context.alongside?.drop();
    context.onRefused(result.refused);
    return;
  }
  apply(result.tr);
  if (result.made.length > 0) context.onMade(result.made);
}
