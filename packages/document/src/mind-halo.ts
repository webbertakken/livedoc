// The root's halo (docs/specs/009-elements/mind-node.md "The root's halo"): a second outline just outside every root
// that has a child, so the root reads as the root whatever it looks like. Worked out from the parent pointers each
// time a map is drawn, never stored. Shared by the canvas and the SVG / PNG export. Pure.

import { BORDER_STROKE_PX } from './border-style';
import { DARK_CANVAS_BACKGROUND_COLOR, DEFAULT_BACKGROUND_COLOR } from './canvas-colors';
import type { CanvasSurface } from './colors';
import { bestInk, contrastRatio, hexToRgb, rgbToHex } from './colour-math';
import { finishBorderStroke, type Finish } from './finish';
import { r2, xmlEscape } from './svg-render-primitives';
import type { Element, ElementId, ShapeElement } from './index';

/** The clear space between a root's edge and its halo, in canvas px. */
export const MIND_HALO_GAP = 6;
/** The halo's thinnest line, for a root whose own border is thinner or none. */
export const MIND_HALO_MIN_WIDTH = 1.5;
/** WCAG 2.2 1.4.11 Non-text Contrast: what the halo keeps against the paper. */
export const MIND_HALO_MIN_CONTRAST = 3;
// How far each step mixes a faint halo toward the paper's contrasting ink: fine enough to stop just past 3:1.
const MIX_STEP = 0.05;

const PAPER: Record<CanvasSurface, string> = {
  light: DEFAULT_BACKGROUND_COLOR,
  dark: DARK_CANVAS_BACKGROUND_COLOR,
};

const isMindNode = (el: Element): el is ShapeElement =>
  el.type === 'shape' && el.shape === 'mind-node';

/** The roots that get a halo: mind nodes with no parent (or one that is gone) and at least one child. */
export function mindHaloRoots(elements: readonly Element[]): ReadonlySet<ElementId> {
  const nodes = new Map(elements.filter(isMindNode).map((n) => [n.id, n]));
  const roots = new Set<ElementId>();
  for (const node of nodes.values()) {
    const parent = node.mindParentId ? nodes.get(node.mindParentId) : undefined;
    if (parent && !(parent.mindParentId && nodes.has(parent.mindParentId))) roots.add(parent.id);
  }
  return roots;
}

/** Where a root's halo is drawn: its line's centre, so the clear gap is `MIND_HALO_GAP` on every side. */
export type MindHaloRing = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  strokeWidth: number;
};

/** The halo round `node`, whose own corner is `radius`, in canvas coordinates. */
export function mindHaloRing(node: ShapeElement, radius: number, finish: Finish): MindHaloRing {
  const border = BORDER_STROKE_PX[finishBorderStroke(node.strokeWidth, finish)];
  const strokeWidth = Math.max(border, MIND_HALO_MIN_WIDTH);
  const out = MIND_HALO_GAP + strokeWidth / 2;
  return {
    x: node.x - out,
    y: node.y - out,
    width: node.width + 2 * out,
    height: node.height + 2 * out,
    radius: radius + out,
    strokeWidth,
  };
}

/**
 * The halo's colour: the root's border colour, mixed toward the paper's contrasting ink just far enough to reach
 * `MIND_HALO_MIN_CONTRAST` when the paper would not carry it. A colour that is not a hex is left as it is.
 */
export function mindHaloStroke(stroke: string, surface: CanvasSurface): string {
  const paper = PAPER[surface];
  const from = hexToRgb(stroke);
  if (!from || contrastRatio(stroke, paper) >= MIND_HALO_MIN_CONTRAST) return stroke;
  const ink = hexToRgb(bestInk(paper, '#0f172a', '#ffffff'))!;
  let mixed = stroke;
  for (
    let t = MIX_STEP;
    t <= 1 && contrastRatio(mixed, paper) < MIND_HALO_MIN_CONTRAST;
    t += MIX_STEP
  )
    mixed = rgbToHex({
      r: from.r + (ink.r - from.r) * t,
      g: from.g + (ink.g - from.g) * t,
      b: from.b + (ink.b - from.b) * t,
    });
  return mixed;
}

/** The halo as SVG, for the export, drawn under its root. `stroke` is the root's resolved border colour. */
export function svgMindHalo(
  node: ShapeElement,
  radius: number,
  surface: CanvasSurface,
  finish: Finish,
  stroke: string,
): string {
  const ring = mindHaloRing(node, radius, finish);
  return (
    `<rect x="${r2(ring.x)}" y="${r2(ring.y)}" width="${r2(ring.width)}" height="${r2(ring.height)}"` +
    ` rx="${r2(ring.radius)}" fill="none" stroke="${xmlEscape(mindHaloStroke(stroke, surface))}"` +
    ` stroke-width="${r2(ring.strokeWidth)}"/>`
  );
}
