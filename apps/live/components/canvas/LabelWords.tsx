// A label's words (docs/specs/023-draw-mode/draw-mode.md "Selecting"): on a whiteboard an unselected stroke, line or
// outline-picked shape lets pointers through its box, and only its drawn line catches them. Its words are drawn ink
// too, so while the box lets pointers through (the element view marks it `data-words-pick`) they catch them as the
// line does, through the globals.css rule on `data-label-words`: a click on them selects the element and a
// double-click opens its label, never a new text box on the board beneath.
import type { CSSProperties, ReactNode } from 'react';

export function LabelWords({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return (
    <span data-label-words="" style={style}>
      {children}
    </span>
  );
}
