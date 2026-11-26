// The Suggested edits panel's Preview (docs/specs/034-text-documents/review.md "Reviewing suggestions"): Preview accept
// all and Preview reject all show the shown tab's writing exactly as settling would leave it, a copy of the document
// settled that way bound to the body (read only, the surface's gate), made again as others change the document;
// Show suggested edits binds the live writing back. Showing another tab ends a preview: that tab's live writing shows.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type * as Y from 'yjs';
import { LiveSuggestions, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';

/** What the body shows: the writing with its suggestions, or as if all were accepted, or all rejected. */
export type ReviewPreview = 'show' | 'accept-all' | 'reject-all';

/** How often a preview is made again while others change the document, at most (default). */
export const REVIEW_PREVIEW_REFRESH_MS = 300;

export function useTextDocumentReviewPreview({
  doc: docRef,
  tab,
}: {
  doc: RefObject<Y.Doc | null>;
  /** The document tab shown. */
  tab: string;
}) {
  // How the body is bound to another fragment of the same tab: the surface's editor sets it once it is made.
  const bindBody = useRef<(fragment: Y.XmlFragment) => void>(() => {});
  const [chosen, setChosen] = useState<{ mode: ReviewPreview; tab: string }>({
    mode: 'show',
    tab,
  });
  // A preview is of the tab it was chosen in: another tab shown, the live writing shows.
  const mode: ReviewPreview = chosen.tab === tab ? chosen.mode : 'show';

  useEffect(() => {
    const doc = docRef.current;
    if (mode === 'show' || !doc) return;
    const make = () => {
      const copy = LiveSuggestions.settledCopy(doc, mode === 'accept-all');
      bindBody.current(TextDocumentState.tabBody(copy, tab));
    };
    make();
    debugLog('[text-document] review preview', { mode, tab });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      timer ??= setTimeout(() => {
        timer = null;
        make();
      }, REVIEW_PREVIEW_REFRESH_MS);
    };
    doc.on('update', changed);
    return () => {
      doc.off('update', changed);
      if (timer) clearTimeout(timer);
    };
  }, [docRef, mode, tab]);

  const setMode = useCallback(
    (next: ReviewPreview) => {
      const doc = docRef.current;
      // Back to the writing: the body bound to the tab's live writing again, where it scrolled.
      if (next === 'show' && mode !== 'show' && doc)
        bindBody.current(TextDocumentState.tabBody(doc, tab));
      setChosen({ mode: next, tab });
    },
    [docRef, mode, tab],
  );

  return { mode, setMode, previewing: mode !== 'show', bindBody };
}
