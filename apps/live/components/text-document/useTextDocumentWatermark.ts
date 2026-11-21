'use client';

// Insert > Watermark (docs/specs/034-text-documents/page-layout.md "Watermark"): the document's watermark, read live
// from the document map (anyone's change, an undo), and set or taken away as one undo step, counted when it changed.
// An Editor's only (the panel is offered to no other); everyone's pages draw it.
import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { TextDocumentState, type Watermark } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { applyWatermark } from '@/lib/text-document/text-document-watermark';

export function useTextDocumentWatermark({
  view,
  liveDoc,
  ready,
  writes,
}: {
  view: EditorView | null;
  liveDoc: RefObject<Y.Doc | null>;
  ready: boolean;
  writes: boolean;
}) {
  const [watermark, setWatermark] = useState<Watermark | undefined>(undefined);
  useEffect(() => {
    const doc = liveDoc.current;
    if (!ready || !doc) return;
    const meta = TextDocumentState.metaType(doc);
    const read = () => setWatermark(TextDocumentState.watermark(doc));
    read();
    meta.observe(read);
    return () => meta.unobserve(read);
  }, [liveDoc, ready]);

  const apply = useCallback(
    (next: Watermark | undefined) => {
      const doc = liveDoc.current;
      if (!writes || !doc || !view || view.isDestroyed) return;
      if (applyWatermark(view, doc, next)) track('Tab', 'Changed', 'TextDocumentWatermark');
    },
    [liveDoc, view, writes],
  );

  return { watermark, apply };
}
