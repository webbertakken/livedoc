'use client';

// Previous view and Next view on a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages"): every
// jump (a link, a bookmark, a thumbnail, the page field, Go to) keeps the place in view before it, and the history
// steps back and forward through them, as a browser's does. One person's, kept while the surface is open.
import { useCallback, useMemo, useState } from 'react';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { GO_TO_NEXT_VIEW, GO_TO_PREVIOUS_VIEW } from './pdf-menus';
import { PdfViewHistory } from './pdf-view-history';
import type { PdfViewer } from './usePdfView';

export function usePdfViewHistory(viewer: Pick<PdfViewer, 'goToPage' | 'placeInView'>) {
  const [history, setHistory] = useState(PdfViewHistory.empty);
  const { goToPage, placeInView } = viewer;

  /** Goes to a page, or a place on it, keeping where the view was to come back to. */
  const jump = useCallback(
    (...to: Parameters<PdfViewer['goToPage']>) => {
      const from = placeInView();
      setHistory((before) => PdfViewHistory.jumped(before, from));
      goToPage(...to);
    },
    [goToPage, placeInView],
  );

  /** Back or forward a place; false where there is nowhere to go, so the key stays the browser's. */
  const step = useCallback(
    (way: 'back' | 'forward'): boolean => {
      const now = placeInView();
      const moved = now && PdfViewHistory[way](history, now);
      if (!moved) return false;
      debugLog(`[pdf] view-history way=${way} page=${moved.to.index + 1}`);
      setHistory(moved.history);
      goToPage(moved.to.index, moved.to);
      return true;
    },
    [history, goToPage, placeInView],
  );

  const actions = useMemo<OfficeActions>(
    () => ({
      [GO_TO_PREVIOUS_VIEW]: {
        run: () => step('back'),
        disabled: !PdfViewHistory.canBack(history),
      },
      [GO_TO_NEXT_VIEW]: {
        run: () => step('forward'),
        disabled: !PdfViewHistory.canForward(history),
      },
    }),
    [history, step],
  );

  return { jump, step, actions };
}
