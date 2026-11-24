'use client';

// A drawing's picture shown (docs/specs/034-text-documents/objects.md "The document around it"): a search hit on a
// drawing, or an address naming one, asks this text document tab's surface (text-document-drawing-reveal.ts); once
// its writing is bound, the picture naming the drawing is selected and scrolled into view, in the document tab
// holding it (shown first when another is). One asked for while the surface is open is shown at once.
import { useEffect, useRef } from 'react';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { PICTURE, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import {
  onDrawingReveal,
  takeDrawingReveal,
} from '@/lib/text-document/text-document-drawing-reveal';

/** Where the writing holds a picture naming the drawing tab, or null. */
function pictureAt(view: EditorView, drawingTabId: string): number | null {
  let at: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (at !== null) return false;
    if (node.type.name === PICTURE && node.attrs.drawing === drawingTabId) at = pos;
    return at === null;
  });
  return at;
}

export function useTextDocumentDrawingReveal({
  view,
  tabId,
  ready,
  liveDoc,
  shownTab,
  showTab,
}: {
  view: EditorView | null;
  tabId: string;
  // The writing bound (the surface ready).
  ready: boolean;
  liveDoc: { readonly current: Y.Doc | null };
  // The document tab shown, and showing another.
  shownTab: string | null;
  showTab: { readonly current: (tab: string) => void };
}): void {
  // The drawing asked for and not yet shown.
  const wanted = useRef<string | null>(null);
  // The document tab asked to be shown for it, so it is asked once.
  const showing = useRef<string | null>(null);

  useEffect(() => {
    const show = () => {
      const drawing = wanted.current;
      if (!drawing || !view || !ready) return;
      const at = pictureAt(view, drawing);
      if (at !== null) {
        wanted.current = null;
        showing.current = null;
        view.dispatch(
          view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)).scrollIntoView(),
        );
        view.focus();
        debugLog('[text-document] drawing picture shown', { drawing });
        return;
      }
      const doc = liveDoc.current;
      const place = doc ? TextDocumentState.drawingPlace(doc, drawing) : null;
      if (place && place !== shownTab && place !== showing.current) {
        showing.current = place;
        showTab.current(place);
        return;
      }
      if (place && place !== shownTab) return;
      wanted.current = null;
      showing.current = null;
      debugLog('[text-document] drawing picture not found', { drawing });
    };
    wanted.current = takeDrawingReveal(tabId) ?? wanted.current;
    show();
    return onDrawingReveal((asked) => {
      if (asked !== tabId) return;
      wanted.current = takeDrawingReveal(tabId);
      showing.current = null;
      show();
    });
  }, [view, tabId, ready, liveDoc, shownTab, showTab]);
}
