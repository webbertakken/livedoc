'use client';

// A double tap on the pages (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): the column under the
// finger fills the view's width less the pages' pad either side, its left at the view's left and the point under the
// finger at its height; with no column there, one zoom step in about the finger. A double tap while the zoom is still
// the one a double tap made goes back to the zoom before it.
import { useCallback, useEffect, useRef } from 'react';
import { TextRange, type PagePoint } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { PDF_PAGES_PAD_PX, type PdfPoint } from './pdf-page-layout';
import type { PdfPageTexts } from './pdf-page-texts';
import { PdfView, type PdfZoom } from './pdf-view';
import type { PdfViewer } from './usePdfView';

/** What a page hands over on a double tap: the page's point, the client's, and the way from one to the other. */
export type PdfPageTap = {
  readonly at: PagePoint;
  readonly client: PdfPoint;
  readonly toClient: (point: PagePoint) => PdfPoint;
};

type Viewer = Pick<PdfViewer, 'element' | 'zoomBy' | 'zoomTo' | 'view' | 'scale' | 'viewport'>;

// Two zooms a double tap compares are one where they differ by less than this.
const SAME_ZOOM = 1e-9;

const sameZoom = (a: PdfZoom, b: number): boolean =>
  typeof a === 'number' && Math.abs(a - b) < SAME_ZOOM;

export function usePdfColumnZoom(
  viewer: Viewer,
  texts: PdfPageTexts | null,
): (index: number, tap: PdfPageTap) => void {
  const latest = useRef({ viewer, texts });
  useEffect(() => {
    latest.current = { viewer, texts };
  });
  // The zoom before a double tap's, and the zoom it made.
  const made = useRef<{ before: PdfZoom; to: number } | null>(null);

  return useCallback((index: number, tap: PdfPageTap) => {
    const element = latest.current.viewer.element;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const focus = { x: tap.client.x - rect.left, y: tap.client.y - rect.top };
    const back = made.current;
    made.current = null;
    if (back && sameZoom(latest.current.viewer.view.zoom, back.to)) {
      debugLog('[pdf] view-double-tapped column=no back=yes');
      latest.current.viewer.zoomTo(back.before, 'Custom', focus);
      return;
    }
    const read = latest.current.texts?.read(index) ?? Promise.resolve(null);
    void read.then((text) => {
      const { view, scale, viewport, zoomBy } = latest.current.viewer;
      const column = text ? TextRange.columnAt(text, tap.at) : null;
      let factor = PdfView.stepIn(scale) / scale;
      let to = focus;
      if (column) {
        const corners: PagePoint[] = [
          { x: column.left, y: column.bottom },
          { x: column.right, y: column.top },
        ];
        const xs = corners.map((corner) => tap.toClient(corner).x - rect.left);
        const [left, right] = [Math.min(...xs), Math.max(...xs)];
        factor = (viewport.width - 2 * PDF_PAGES_PAD_PX) / Math.max(right - left, 1);
        to = { x: PDF_PAGES_PAD_PX + (focus.x - left) * factor, y: focus.y };
      }
      const zoomed = PdfView.withZoom(view, scale * factor).zoom as number;
      made.current = { before: view.zoom, to: zoomed };
      debugLog(`[pdf] view-double-tapped column=${column ? 'yes' : 'no'} back=no`);
      track('Pdf', 'Zoomed', 'Custom');
      zoomBy(factor, focus, to);
    });
  }, []);
}
