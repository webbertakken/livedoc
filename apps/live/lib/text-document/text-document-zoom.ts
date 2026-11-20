// A text document's zoom (docs/specs/034-text-documents/editing-surface.md "Zoom"): one person's, per document,
// remembered in this browser.
import { recentStore } from '@/lib/recent-store';
import { isZoomPercent, ZOOM_DEFAULT, type OfficeZoomValue } from '@/lib/office/office-zoom';
import { SURFACE_VIEW_MAX_ENTRIES } from '@/lib/surface-view';

export const TEXT_DOCUMENT_ZOOM_KEY = 'livedoc:v2:text-document-zoom';
/** A page's width at 100%: US Letter, 8.5 in at 96 px. */
export const PAGE_WIDTH_PX = 816;

const parseStored = (value: unknown): OfficeZoomValue | null =>
  value === 'fit' || (typeof value === 'number' && isZoomPercent(value)) ? value : null;

const zooms = recentStore<OfficeZoomValue>(
  TEXT_DOCUMENT_ZOOM_KEY,
  SURFACE_VIEW_MAX_ENTRIES,
  parseStored,
);

export const readTextDocumentZoom = (documentId: string): OfficeZoomValue =>
  zooms.read(documentId) ?? ZOOM_DEFAULT;

export const writeTextDocumentZoom = (documentId: string, zoom: OfficeZoomValue): void =>
  zooms.write(documentId, zoom);
