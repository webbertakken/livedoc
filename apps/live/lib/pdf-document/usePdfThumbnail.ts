'use client';

// An open PDF surface and its document's thumbnail (docs/specs/035-pdf-documents/live-editing-and-storage.md "A
// browser's thumbnail"): an Editor's surface sends the first page for the lists to draw. The room's alone, since no
// server lists a This Browser document; and never of a protected file, which shows a lock.
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import {
  apiPdfThumbnailWanted,
  apiSendPdfThumbnail,
  type PdfDocumentScope,
} from '@/lib/api/pdf-documents';
import { forgetThumbnailsOf } from '@/lib/thumbnail-cache';
import type { PdfHome } from './pdf-home';
import { marksOnPage, type PdfMarksStore } from './pdf-marks-store';
import { watchPdfThumbnail } from './pdf-thumbnail';
import { encodePdfThumbnail } from './pdf-thumbnail-canvas';
import type { PdfDocumentOpen } from './usePdfDocument';

export function usePdfThumbnail(
  ready: (PdfDocumentOpen & { phase: 'ready' }) | null,
  marks: PdfMarksStore | null,
  { ownerId, documentId, tabId, shareCode }: PdfDocumentScope,
  home: PdfHome,
  level: AccessLevel,
): void {
  // Read when a picture is about to be sent: a level lowered meanwhile sends none.
  const now = useRef(level);
  useLayoutEffect(() => {
    now.current = level;
  });
  useEffect(() => {
    const first = ready?.pages[0];
    if (!ready || !marks || !first || home !== 'room' || ready.protected) return undefined;
    const where = { ownerId, documentId, tabId, shareCode };
    const watch = watchPdfThumbnail({
      tabId,
      doc: ready.binding.doc,
      page: first,
      marks: () => marksOnPage(marks.get(), first.name),
      engine: ready.engine,
      canSend: () => now.current === 'edit',
      isSaved: ready.binding.isSaved,
      wanted: () => apiPdfThumbnailWanted(where),
      send: (jpeg) => apiSendPdfThumbnail(where, jpeg),
      encode: encodePdfThumbnail,
      onSent: () => forgetThumbnailsOf(documentId),
    });
    return watch.stop;
  }, [ready, marks, home, ownerId, documentId, tabId, shareCode]);
}
