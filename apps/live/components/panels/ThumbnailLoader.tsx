import { fnv1aString } from '@livedoc/document';

// The "preview on its way" state of a DocumentThumbnail (docs/specs/006-document/document-snapshots.md):
// the same three-node sketch as the empty-document placeholder, drawing
// itself. The first node traces, two connectors grow out of it, their
// arrowheads land, the other two nodes trace, then a dot runs down each
// connector and the sketch fades out to start over (`thumbnail-loader.css`).
// Once the first node has traced, a small spinner turns inside it.
//
// Same geometry and colour as BlankCanvasIllustration, so a card never
// changes size or tone when the picture arrives and a half-drawn sketch
// can't be mistaken for a real snapshot. Solid strokes rather than the
// placeholder's dashes: dashed means "nothing drawn yet", which is what a
// thumbnail says once it KNOWS the document is empty.
//
// It starts still: the finished sketch, which most snapshots replace within
// half a second. A slower one sets it drawing (DocumentThumbnail marks its
// box `data-drawing` after loaderStillMs), entering the cycle where the
// sketch is whole, so the still sketch fades out and the drawing begins.
// Reduced motion keeps the still sketch throughout.

/** How long a loader stays the still sketch once its box is near the view, before its stagger. */
export const LOADER_STILL_MS = 500;
// Spread over the cards of a grid, so their drawing ripples instead of starting in lockstep.
const LOADER_STAGGER_MS = 400;

/**
 * How long this document's loader stays still once near the view: half a second, plus a stagger derived from its
 * id (FNV-1a), stable across renders and mounts.
 */
export function loaderStillMs(seed: string): number {
  return LOADER_STILL_MS + (fnv1aString(seed) % LOADER_STAGGER_MS);
}

export function ThumbnailLoader() {
  return (
    <span className="flex h-full flex-col items-center justify-center p-1">
      <svg
        viewBox="0 0 64 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        data-testid="thumbnail-loader"
        className="lvd-thumb-loader h-full max-h-20 w-auto text-slate-300 dark:text-slate-600"
      >
        <g className="lvd-thumb-cycle">
          <rect className="lvd-thumb-a" x="4" y="14" width="18" height="12" rx="3" pathLength="1" />
          {/* A spinner inside the first node, appearing once that node has
              traced: a faint track and an arc, turning on its own quick
              loop independent of the drawing cycle. */}
          <g className="lvd-thumb-spinner">
            <circle cx="13" cy="20" r="3" strokeWidth="1.2" opacity="0.35" />
            <circle
              className="lvd-thumb-spin"
              cx="13"
              cy="20"
              r="3"
              strokeWidth="1.2"
              pathLength="1"
              strokeDasharray="0.3 0.7"
            />
          </g>
          <path className="lvd-thumb-link" d="M22 20c8 0 10-11 18-11" pathLength="1" />
          <path className="lvd-thumb-link" d="M22 20c8 0 10 11 18 11" pathLength="1" />
          <path className="lvd-thumb-head" d="M37 6.5l3 2.5-3 2.5" />
          <path className="lvd-thumb-head" d="M37 28.5l3 2.5-3 2.5" />
          <rect className="lvd-thumb-b" x="42" y="3" width="18" height="12" rx="3" pathLength="1" />
          <rect
            className="lvd-thumb-c"
            x="42"
            y="25"
            width="18"
            height="12"
            rx="3"
            pathLength="1"
          />
          <circle className="lvd-thumb-dot lvd-thumb-dot-top" r="1.4" fill="currentColor" />
          <circle className="lvd-thumb-dot lvd-thumb-dot-bottom" r="1.4" fill="currentColor" />
        </g>
      </svg>
    </span>
  );
}
