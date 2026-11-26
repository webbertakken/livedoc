'use client';

// This person's place in a PDF (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"): the page in view
// and the mode, said for the tab this person is on and taken back on leaving it; and what they hold (a mark, else
// their text selection) while focus is within the surface. React's focus events bubble through portals, so a menu
// open from the surface keeps it.
import { useCallback, useEffect, useState } from 'react';
import type { PdfPresenceMode } from '@livedoc/api-schema';
import { heldOf } from './pdf-presence-held';
import { setLocalPdfPresence } from './pdf-presence-store';
import type { PdfMarksChosen } from './usePdfMarkSelection';
import type { PdfTextSelected } from './usePdfTextSelection';

export type PdfPresenceFocus = {
  /** The surface's root's focus and blur: focus moving within it is a blur then a focus, kept as within. */
  readonly onFocus: () => void;
  readonly onBlur: () => void;
};

export function usePdfPresencePlace({
  tabId,
  present,
  pages,
  page,
  mode,
  chosen,
  text,
  reviews,
}: {
  tabId: string;
  // The tab is the one this person is on: the other pane of a split says nothing.
  present: boolean;
  pages: readonly { readonly name: string }[] | null;
  // The page in view, by index.
  page: number;
  mode: PdfPresenceMode;
  // The marks selected, and the text selected.
  chosen: PdfMarksChosen | null;
  text: Pick<PdfTextSelected, 'page' | 'spans'> | null;
  // The session reviews: a Viewer holds nothing.
  reviews: boolean;
}): PdfPresenceFocus {
  const [focused, setFocused] = useState(false);
  const textPage = text ? pages?.[text.page]?.name : undefined;
  const held = heldOf({
    chosen,
    text: text && textPage ? { page: textPage, spans: text.spans } : null,
    focused,
    reviews,
  });
  // A place alike to the last is not said again (setLocalPdfPresence), so a selection made anew alike sends nothing.
  useEffect(() => {
    if (!present || !pages) return;
    const shown = pages[Math.min(page, pages.length - 1)];
    if (shown) setLocalPdfPresence(tabId, { page: shown.name, mode, held });
  }, [present, pages, page, tabId, mode, held]);
  useEffect(() => (present ? () => setLocalPdfPresence(tabId, null) : undefined), [present, tabId]);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { onFocus, onBlur };
}
