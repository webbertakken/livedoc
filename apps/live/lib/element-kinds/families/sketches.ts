// The sketches family (docs/specs/016-platform/web-performance.md): the hand-drawn finishes, Sketch's pencil and
// Marker's felt-tip. An element's hand-drawn body (SketchOverlay), its art drawn into still pictures in WebKit
// (SketchArtPicture), a face's parts drawn by hand (hand-drawn-face.ts), and the model's hand-drawn drawing of
// elements and arrows. Loaded through the registry (lib/element-kinds) for a board in a hand-drawn finish or holding an
// element in one, never imported statically; the finishes' rules, their filters and the export stay base.
export { SketchOverlay } from '@/components/canvas/SketchOverlay';
export { SketchArtPicture } from '@/components/canvas/SketchArtPicture';
export { drawMarkerFace } from '@/components/canvas/hand-drawn-face';
export { handDrawnArrow, handDrawnElementPaint } from '@livedoc/document';
