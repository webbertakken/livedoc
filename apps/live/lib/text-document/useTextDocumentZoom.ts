'use client';

// A text document's zoom on its surface (docs/specs/034-text-documents/editing-surface.md "Zoom"): the person's value
// for this document, remembered as it changes, and the pages' scale from it; Fit follows the window's width.
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { OfficeZoom } from '@/components/office/OfficeZoomField';
import { track } from '@/lib/telemetry';
import { zoomScale, type OfficeZoomValue } from '@/lib/office/office-zoom';
import { PAGE_WIDTH_PX, readTextDocumentZoom, writeTextDocumentZoom } from './text-document-zoom';

/** The room the pages keep either side when they fit the window. */
const FIT_GUTTER_PX = 48;

export function useTextDocumentZoom(
  documentId: string,
  scroller: RefObject<HTMLElement | null>,
): { zoom: OfficeZoom; scale: number } {
  const [value, setValue] = useState<OfficeZoomValue>(() => readTextDocumentZoom(documentId));
  const [room, setRoom] = useState(PAGE_WIDTH_PX + FIT_GUTTER_PX);

  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setRoom(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller]);

  const zoom = useMemo<OfficeZoom>(
    () => ({
      value,
      onChange: (next) => {
        setValue(next);
        writeTextDocumentZoom(documentId, next);
        track('UI', 'Changed', 'TextDocumentZoom');
      },
    }),
    [value, documentId],
  );
  return { zoom, scale: zoomScale(value, room - FIT_GUTTER_PX, PAGE_WIDTH_PX) };
}
