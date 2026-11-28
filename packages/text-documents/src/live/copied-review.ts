// What a copy of a text document keeps of its review (docs/specs/034-text-documents/files-and-print.md "Make a copy"):
// without Copy comments and suggestions, no thread and every pending suggestion rejected, as Google's copy reads; with
// it, resolved threads only with Include resolved. Made from the stored state into a document of its own, so what is
// left out is gone from the copy's bytes, never only hidden.
import * as Y from 'yjs';
import { THREADS_MAP } from './live-names';
import { LiveSuggestions } from './live-suggestions';

/** The Copy document dialog's two review choices. */
export type CopiedReviewChoice = { readonly comments: boolean; readonly resolved: boolean };

/** The copy's own document: a fresh one, collected, so a deleted thread's words are not carried. */
function copied(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc({ gc: true });
  Y.applyUpdate(doc, state);
  return doc;
}

function withThreads(doc: Y.Doc, keep: (thread: Y.Map<unknown>) => boolean): void {
  const threads = doc.getMap<Y.Map<unknown>>(THREADS_MAP);
  doc.transact(() => {
    for (const [id, thread] of [...threads.entries()]) if (!keep(thread)) threads.delete(id);
  });
}

export const CopiedReview = {
  /** The state as a copy with these choices holds it; the state itself when everything is kept. */
  applied(state: Uint8Array, choice: CopiedReviewChoice): Uint8Array {
    if (choice.comments && choice.resolved) return state;
    const doc = copied(state);
    try {
      if (choice.comments) withThreads(doc, (thread) => thread.get('resolved') !== true);
      else {
        LiveSuggestions.settleAll(doc, false, null);
        withThreads(doc, () => false);
      }
      // A fresh document from the collected one: nothing deleted above is in what is handed on.
      return Y.encodeStateAsUpdate(doc);
    } finally {
      doc.destroy();
    }
  },
} as const;
