// Candidate contexts in an exported image (docs/specs/021-event-storming/candidate-contexts.md "Where it lives"):
// every kept context drawn beneath the notes from the same outline the canvas draws, its name on a plate of the
// paper's colour on the top edge. A suggested context is a suggestion, and no export shows one.

import { isKeptContext, contextNotes, type CandidateContextElement } from './candidate-contexts';
import {
  CONTEXT_DASH_PX,
  CONTEXT_STROKE_PX,
  CONTEXT_WOBBLE_PX,
  contextOutline,
} from './candidate-context-outline';
import type { Rect } from './geometry-primitives';
import type { Element } from './index';
import { labelMeasure, r2, xmlEscape } from './svg-render-primitives';

/** The outline's ink and its name's, per canvas: 3:1 and 4.5:1 or more against the canvas (slate 500 / 700 on light,
 *  400 / 200 on dark). */
export const CONTEXT_INK = {
  light: { line: '#64748b', name: '#334155' },
  dark: { line: '#94a3b8', name: '#e2e8f0' },
} as const;
/** The name's type size and its plate, canvas px. */
export const CONTEXT_NAME_PX = 13;
export const CONTEXT_PLATE_H = 20;
export const CONTEXT_PLATE_PAD_X = 6;
const CONTEXT_FONT = 'Inter, system-ui, sans-serif';

/** Where a context's name plate stands, from the outline's label point and the name's width. */
export function contextPlate(label: { x: number; y: number }, nameWidth: number): Rect {
  return {
    x: label.x - CONTEXT_PLATE_PAD_X,
    y: label.y - CONTEXT_PLATE_H / 2,
    width: nameWidth + 2 * CONTEXT_PLATE_PAD_X,
    height: CONTEXT_PLATE_H,
  };
}

/** The kept contexts drawn round their `visible` notes, and the box they reach; empty when none shows. */
export function svgCandidateContexts(
  elements: readonly Element[],
  visible: readonly Element[],
  surface: 'light' | 'dark',
  paper: string,
): { svg: string; bounds: Rect | null } {
  const shown = new Map(visible.map((el) => [el.id, el]));
  const ink = CONTEXT_INK[surface];
  const measure = labelMeasure(CONTEXT_NAME_PX, true, false, CONTEXT_FONT);
  const parts: string[] = [];
  let reach: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const grow = (r: Rect) => {
    reach = reach ?? { x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height };
    reach.x0 = Math.min(reach.x0, r.x);
    reach.y0 = Math.min(reach.y0, r.y);
    reach.x1 = Math.max(reach.x1, r.x + r.width);
    reach.y1 = Math.max(reach.y1, r.y + r.height);
  };
  for (const el of elements) {
    if (!isKeptContext(el)) continue;
    const context = el as CandidateContextElement;
    const outline = contextOutline(context.id, contextNotes(context, shown));
    if (!outline) continue;
    const plate = contextPlate(outline.label, measure(context.label));
    const w = CONTEXT_WOBBLE_PX;
    grow({
      x: outline.bounds.x - w,
      y: outline.bounds.y - w,
      width: outline.bounds.width + 2 * w,
      height: outline.bounds.height + 2 * w,
    });
    grow(plate);
    parts.push(
      `<g data-candidate-context="${xmlEscape(context.id)}">` +
        `<path d="${outline.path}" fill="none" stroke="${ink.line}" stroke-width="${CONTEXT_STROKE_PX}" ` +
        `stroke-dasharray="${CONTEXT_DASH_PX} ${CONTEXT_DASH_PX}" stroke-linecap="round"/>` +
        `<rect x="${r2(plate.x)}" y="${r2(plate.y)}" width="${r2(plate.width)}" height="${r2(plate.height)}" ` +
        `rx="4" fill="${xmlEscape(paper)}"/>` +
        `<text x="${r2(outline.label.x)}" y="${r2(outline.label.y)}" dominant-baseline="central" ` +
        `font-family="${CONTEXT_FONT}" font-size="${CONTEXT_NAME_PX}" font-weight="600" fill="${ink.name}">` +
        `${xmlEscape(context.label)}</text></g>`,
    );
  }
  const r = reach as { x0: number; y0: number; x1: number; y1: number } | null;
  return {
    svg: parts.join('\n'),
    bounds: r ? { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0 } : null,
  };
}

/** An export's content box grown to take in the contexts' reach. */
export function withContextReach(
  b: { x: number; y: number; w: number; h: number },
  reach: Rect | null,
): { x: number; y: number; w: number; h: number } {
  if (!reach) return b;
  const x = Math.min(b.x, reach.x);
  const y = Math.min(b.y, reach.y);
  return {
    x,
    y,
    w: Math.max(b.x + b.w, reach.x + reach.width) - x,
    h: Math.max(b.y + b.h, reach.y + reach.height) - y,
  };
}
