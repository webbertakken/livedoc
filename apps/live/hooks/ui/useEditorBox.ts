'use client';

import { createContext, useContext } from 'react';

// The editor's box on screen (docs/specs/007-editor/split-view.md "How the editor fits in its pane"): the
// window, or the editor's pane in a side by side split. In a split the box is the containing block of
// every `fixed` piece inside it, so a `fixed` overlay placed from client coordinates (the marquee, the
// guides, the draw previews) counts from the box's corner and takes the box's offset off first.
export type EditorBox = {
  readonly left: number;
  readonly top: number;
  // Null while the editor fills the window, which the reader measures itself.
  readonly width: number | null;
};

export const WINDOW_EDITOR_BOX: EditorBox = Object.freeze({ left: 0, top: 0, width: null });

export const EditorBoxContext = createContext<EditorBox>(WINDOW_EDITOR_BOX);

export function useEditorBox(): EditorBox {
  return useContext(EditorBoxContext);
}

type Point = { x: number; y: number };

/** A client-coordinate point, in the coordinates a `fixed` overlay inside the editor's box is placed in. */
export function toEditorBox(point: Point, box: EditorBox): Point {
  return { x: point.x - box.left, y: point.y - box.top };
}
