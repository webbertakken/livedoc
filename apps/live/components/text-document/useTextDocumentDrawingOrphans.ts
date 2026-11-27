'use client';

// Drawings no picture names any more (docs/specs/034-text-documents/objects.md "Deleting"): kept while an undo could
// bring the picture back, and removed once when an Editor next opens the text document, its writing loaded, in one
// change of the document's tabs. A drawing someone is in, or one waiting in this browser to be placed, is kept. A
// suggestion an Editor settles here that leaves a drawing named by no picture removes it at once (review.md "Drawings":
// a replacement rejected leaves no copy behind, one accepted no old drawing).
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { drawingPending } from '@/lib/text-document/text-document-drawing-pending';
import type { DrawingTabs } from '@/lib/text-document/text-document-drawing-open-plugin';
import { TEXT_DOCUMENT_SUGGESTIONS_ORIGIN } from '@/lib/text-document/text-document-undo';

/** The drawing tabs of a text document tab that no picture names, nobody is in and nothing waits to place. */
export function orphanDrawings(
  ids: readonly string[],
  named: ReadonlyMap<string, number>,
  kept: (drawingTabId: string) => boolean,
): string[] {
  return ids.filter((id) => !named.has(id) && !kept(id));
}

/** The drawing tabs pictures named before a settle and none names after it, but for those in use. */
export function settledOrphans(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  kept: (drawingTabId: string) => boolean,
): string[] {
  return [...before.keys()].filter((id) => !after.has(id) && !kept(id));
}

export function useTextDocumentDrawingOrphans({
  ready,
  canEdit,
  tabId,
  liveDoc,
  drawingTabs,
}: {
  // The writing loaded (the surface ready).
  ready: boolean;
  // An Editor, writing the body.
  canEdit: boolean;
  tabId: string;
  liveDoc: { readonly current: Y.Doc | null };
  drawingTabs: DrawingTabs | null;
}): void {
  const swept = useRef(false);
  useEffect(() => {
    const doc = liveDoc.current;
    if (!ready || !canEdit || !drawingTabs || !doc || swept.current) return;
    swept.current = true;
    const orphans = orphanDrawings(
      drawingTabs.ids(tabId),
      TextDocumentState.drawingNames(doc),
      (id) => drawingTabs.someoneIn(id) || drawingPending(id) !== null,
    );
    if (orphans.length > 0) drawingTabs.remove(orphans);
    debugLog('[text-document] drawing orphans removed', { tabId, count: orphans.length });
  }, [ready, canEdit, tabId, liveDoc, drawingTabs]);

  // A settle's own: the pictures' drawings read before and after each change this person's Accept or Reject makes.
  useEffect(() => {
    const doc = liveDoc.current;
    if (!ready || !canEdit || !drawingTabs || !doc) return;
    let before: ReadonlyMap<string, number> | null = null;
    const settles = (tr: Y.Transaction) =>
      tr.local && tr.origin === TEXT_DOCUMENT_SUGGESTIONS_ORIGIN;
    const onBefore = (tr: Y.Transaction) => {
      if (settles(tr)) before = TextDocumentState.drawingNames(doc);
    };
    const onAfter = (tr: Y.Transaction) => {
      if (!settles(tr) || !before) return;
      const gone = settledOrphans(
        before,
        TextDocumentState.drawingNames(doc),
        // Another text document's drawing is its own to keep.
        (id) =>
          drawingTabs.drawingOf(id) !== tabId ||
          drawingTabs.someoneIn(id) ||
          drawingPending(id) !== null,
      );
      before = null;
      if (gone.length === 0) return;
      // After the change: the document's tabs are written in a change of their own.
      queueMicrotask(() => drawingTabs.remove(gone));
      debugLog('[text-document] settled drawings removed', { tabId, drawings: gone });
    };
    doc.on('beforeTransaction', onBefore);
    doc.on('afterTransaction', onAfter);
    return () => {
      doc.off('beforeTransaction', onBefore);
      doc.off('afterTransaction', onAfter);
    };
  }, [ready, canEdit, tabId, liveDoc, drawingTabs]);
}
