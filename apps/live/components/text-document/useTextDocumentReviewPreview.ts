// What the body draws of the writing (docs/specs/034-text-documents/review.md): the live writing, or the writing settled
// as every pending suggestion accepted or rejected would leave it. The Suggested edits panel's Preview ("Reviewing
// suggestions") chooses Preview accept all or Preview reject all; Viewing ("Editing modes") draws every suggestion
// rejected, the writing itself while nothing is pending. A settled writing is a document of its own bound to the body
// (read only, the surface's gate) and to the headers, footers and notes (`drawn`), kept reading as the document settled
// now as others change it, by the least change, so what it shows, where it is scrolled and what is selected stay put.
// Show suggested edits, or leaving Viewing, binds the live writing back. Showing another tab ends a preview: that tab's
// live writing shows.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type * as Y from 'yjs';
import { SettledWriting, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';

/** What the body shows: the writing with its suggestions, or as if all were accepted, or all rejected. */
export type ReviewPreview = 'show' | 'accept-all' | 'reject-all';

/** How often a settled writing follows others' changes, at most (default). */
export const REVIEW_PREVIEW_REFRESH_MS = 300;

export function useTextDocumentReviewPreview({
  doc: docRef,
  tab,
  viewing = false,
  printing = false,
}: {
  doc: RefObject<Y.Doc | null>;
  /** The document tab shown. */
  tab: string;
  /** The person is in Viewing: every suggestion drawn rejected, and no preview is chosen. */
  viewing?: boolean;
  /**
   * The surface is in its printing look (files-and-print.md "Printing"): every suggestion drawn accepted, Viewing too.
   */
  printing?: boolean;
}) {
  // How the body is bound to another fragment of the same tab: the surface's editor sets it once it is made.
  const bindBody = useRef<(fragment: Y.XmlFragment) => void>(() => {});
  const [chosen, setChosen] = useState<{ mode: ReviewPreview; tab: string }>({
    mode: 'show',
    tab,
  });
  // A preview is of the tab it was chosen in, and none is chosen in Viewing.
  const mode: ReviewPreview = chosen.tab === tab && !viewing ? chosen.mode : 'show';
  const settle: ReviewPreview = printing ? 'accept-all' : viewing ? 'reject-all' : mode;
  // The settled writing drawn, and the tab whose body it is bound to.
  const [drawn, setDrawn] = useState<Y.Doc | null>(null);
  const bound = useRef<{ doc: Y.Doc; tab: string } | null>(null);

  const release = useCallback(() => {
    const was = bound.current;
    if (!was) return;
    bound.current = null;
    setDrawn(null);
    was.doc.destroy();
  }, []);

  useEffect(() => {
    const doc = docRef.current;
    if (settle === 'show' || !doc) return;
    const accept = settle === 'accept-all';
    let copy: Y.Doc | null = null;
    const draw = () => {
      const started = performance.now();
      if (copy) {
        SettledWriting.refresh(copy, doc, accept);
        debugLog('[text-document] settled writing followed', {
          ms: Math.round(performance.now() - started),
        });
        return;
      }
      // Viewing draws the writing itself while nothing is pending: no copy to keep up.
      if (viewing && !SettledWriting.pending(doc)) {
        if (bound.current?.tab === tab) bindBody.current(TextDocumentState.tabBody(doc, tab));
        release();
        return;
      }
      copy = SettledWriting.make(doc, accept);
      bindBody.current(TextDocumentState.tabBody(copy, tab));
      release();
      bound.current = { doc: copy, tab };
      setDrawn(copy);
      debugLog('[text-document] settled writing made', {
        accept,
        tab,
        ms: Math.round(performance.now() - started),
      });
    };
    draw();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      timer ??= setTimeout(() => {
        timer = null;
        draw();
      }, REVIEW_PREVIEW_REFRESH_MS);
    };
    doc.on('update', changed);
    return () => {
      doc.off('update', changed);
      if (timer) clearTimeout(timer);
    };
  }, [docRef, settle, tab, viewing, release]);

  // Back to the writing: the body bound to the tab's live writing again, where it scrolled. Another tab shown, the
  // surface has bound that tab's writing itself.
  useEffect(() => {
    if (settle !== 'show' || !bound.current) return;
    const doc = docRef.current;
    if (doc && bound.current.tab === tab) bindBody.current(TextDocumentState.tabBody(doc, tab));
    debugLog('[text-document] settled writing live', { tab });
    release();
  }, [docRef, settle, tab, release]);

  useEffect(() => release, [release]);

  const setMode = useCallback((next: ReviewPreview) => setChosen({ mode: next, tab }), [tab]);

  return { mode, setMode, previewing: mode !== 'show' || printing, drawn, bindBody };
}
