// A document thumbnail's motion stays its own (docs/specs/016-platform/web-performance.md "Long lists").
//
// The loader runs a dozen CSS animations per thumbnail and the picture crossfades in, and every start, repeat and
// end of each is an event that bubbles to React's root listener, which walks the tree for a handler that is never
// there. A folder opening with 30 loaders fired 390 `animationstart` events in one task: 215 ms of it at 4x CPU.
// Nothing listens for a thumbnail's motion, so one capture listener on the window stops it there, before React's.

// Set on every thumbnail's box by DocumentThumbnail.
const DOCUMENT_THUMBNAIL_ATTRIBUTE = 'data-document-thumbnail';

const MOTION_EVENTS = [
  'animationstart',
  'animationiteration',
  'animationend',
  'animationcancel',
  'transitionrun',
  'transitionstart',
  'transitionend',
  'transitioncancel',
] as const;

const INSIDE_A_THUMBNAIL = `[${DOCUMENT_THUMBNAIL_ATTRIBUTE}]`;

function stopInsideAThumbnail(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest(INSIDE_A_THUMBNAIL)) event.stopPropagation();
}

let kept = false;

/** Stops thumbnail motion events at the window from now on; once per page, however many thumbnails call it. */
export function keepThumbnailMotionToItself(): void {
  if (kept || typeof window === 'undefined') return;
  kept = true;
  for (const type of MOTION_EVENTS) window.addEventListener(type, stopInsideAThumbnail, true);
}
