'use client';

// Drawings no picture names any more (docs/specs/034-text-documents/objects.md "Deleting"): kept while an undo could
// bring the picture back, and removed once when an Editor next opens the text document, its writing loaded, in one
// change of the document's tabs. A drawing someone is in, or one waiting in this browser to be placed, is kept.
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { drawingPending } from '@/lib/text-document/text-document-drawing-pending';
import type { DrawingTabs } from '@/lib/text-document/text-document-drawing-open-plugin';

/** The drawing tabs of a text document tab that no picture names, nobody is in and nothing waits to place. */
export function orphanDrawings(
  ids: readonly string[],
  named: ReadonlyMap<string, number>,
  kept: (drawingTabId: string) => boolean,
): string[] {
  return ids.filter((id) => !named.has(id) && !kept(id));
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
}
