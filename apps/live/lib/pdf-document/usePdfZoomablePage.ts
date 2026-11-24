// A PDF tab lets the page zoom with the browser (docs/specs/035-pdf-documents/accessibility.md "Seeing"; WCAG 1.4.4):
// the editor's route pins the viewport at scale 1 for the canvas (live-app.md "Mobile / responsive"), so while a PDF's
// surface is shown its viewport drops the pin, and the pin comes back as the surface goes.
import { useEffect } from 'react';
import { debugLog } from '@/lib/debug-log';

/** The viewport a PDF tab keeps: the device's width at scale 1, zoomable. */
export const PDF_ZOOMABLE_VIEWPORT = 'width=device-width, initial-scale=1';

export function usePdfZoomablePage(): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const pinned = meta.content;
    meta.content = PDF_ZOOMABLE_VIEWPORT;
    debugLog('[pdf] viewport zoomable');
    return () => {
      meta.content = pinned;
    };
  }, []);
}
