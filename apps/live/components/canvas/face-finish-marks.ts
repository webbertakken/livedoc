// The marks a face's finish pass sets on the live DOM (docs/specs/008-canvas/finish.md "Faces: frames and shapes"):
// read by face-finish.css, by the pass's own change filter and by clearing it. Shared by the pass every board runs
// (useFaceFinishPass) and the hand-drawn drawing that loads with a hand-drawn board (hand-drawn-face.ts).

/** The ink this pass adds; everything carrying it is removed before each take. */
export const INK_ATTR = 'data-marker-ink';
/** Marks a part whose line the ink replaces: `frame`, `shape` or `line` (face-finish.css). */
export const DRAWN_ATTR = 'data-marker-drawn';
/** Marks an SVG rectangle whose ends are round, which Professional keeps round (face-finish.css). */
export const PILL_ATTR = 'data-finish-pill';
/** Shows a Sketch face's hidden fills and lines while the pass reads them (app/sketch-face.css). */
export const MEASURE_ATTR = 'data-sketch-measure';
/** Marks a part a face wants drawn as a shape whatever its size or roundness (a progress bar's track and fill). */
export const SHAPE_ATTR = 'data-marker-shape';
/** Marks a box this pass made its own stacking context, so its colouring can sit under its contents. */
export const ISOLATED_ATTR = 'data-marker-isolated';
/** Marks a grid cell's sides whose border the grid's marker rules replace (`r`, `b`: face-finish.css). */
export const RULES_ATTR = 'data-marker-rules';

/** Removes the pass's ink and marks under `root`. */
export function clearMarkerFace(root: Element): void {
  for (const ink of root.querySelectorAll(`[${INK_ATTR}]`)) ink.remove();
  for (const drawn of root.querySelectorAll(`[${DRAWN_ATTR}]`)) drawn.removeAttribute(DRAWN_ATTR);
  for (const ruled of root.querySelectorAll(`[${RULES_ATTR}]`)) ruled.removeAttribute(RULES_ATTR);
  for (const isolated of [root, ...root.querySelectorAll<HTMLElement>(`[${ISOLATED_ATTR}]`)])
    if (isolated instanceof HTMLElement && isolated.hasAttribute(ISOLATED_ATTR)) {
      isolated.style.isolation = '';
      isolated.removeAttribute(ISOLATED_ATTR);
    }
}
