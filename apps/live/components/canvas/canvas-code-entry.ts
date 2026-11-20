// The canvas's code as one chunk (docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code"), reached
// only by lib/canvas-code's dynamic import: a document whose tabs all have a surface never downloads it.
// app/document/[id]/document-lazy-load.test.ts fails if the document page imports any of it statically.
export { EditorCanvasHost } from './EditorCanvasHost';
export { EditorCanvasChrome } from './EditorCanvasChrome';
