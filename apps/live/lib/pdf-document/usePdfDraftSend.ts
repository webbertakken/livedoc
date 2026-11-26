'use client';

// A Drawing's stroke as it is drawn, put where the broadcaster sends it from (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "A mark as it is made"): its page by name, an id of its own from its first point, its
// look and its points; nothing once it ends or the surface goes.
import { useCallback, useEffect, useRef } from 'react';
import type { PdfDraftLook } from '@livedoc/api-schema';
import type { Stroke } from '@livedoc/pdf-documents';
import { setLocalPdfDraft } from './pdf-draft-store';

export function usePdfDraftSend({
  tabId,
  pages,
}: {
  tabId: string;
  pages: readonly { readonly name: string }[] | null;
}): (index: number, stroke: Stroke | null, look: PdfDraftLook) => void {
  const id = useRef<string | null>(null);
  useEffect(
    () => () => {
      id.current = null;
      setLocalPdfDraft(null);
    },
    [tabId],
  );
  return useCallback(
    (index, stroke, look) => {
      const page = pages?.[index];
      if (!stroke || !page) {
        id.current = null;
        setLocalPdfDraft(null);
        return;
      }
      // A stroke's first point begins it.
      if (stroke.length <= 2 || !id.current) id.current = crypto.randomUUID();
      setLocalPdfDraft({ tabId, page: page.name, stroke: id.current, look, points: stroke });
    },
    [tabId, pages],
  );
}
