// The box an SVG path draws in (docs/specs/008-canvas/canvas-performance.md "A break stays local"): an arrow's path
// is absolute coordinate pairs alone (M, L, Q, C), and a Bézier never leaves the hull of its control points, so the
// box of every pair bounds the drawing. Anything else (arcs, relative or one-axis commands) answers null, and the
// caller falls back to a region that cannot clip. Pure.
import type { Rect } from './geometry-primitives';

const PAIR_COMMANDS = /^[MLQCZ\s\d.eE+-]*$/;

export function pathDBounds(d: string): Rect | null {
  if (!d.trim() || !PAIR_COMMANDS.test(d)) return null;
  const nums = (d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 2 || nums.length % 2 !== 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]!);
    x1 = Math.max(x1, nums[i]!);
    y0 = Math.min(y0, nums[i + 1]!);
    y1 = Math.max(y1, nums[i + 1]!);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The mask region of an arrow's break: every path the mask applies to, grown by `margin` (its stroke and heads). Null
 *  when a path cannot be bounded. */
export function arrowMaskRegion(paths: readonly string[], margin: number): Rect | null {
  const boxes = paths.map(pathDBounds);
  if (boxes.length === 0 || boxes.some((b) => b === null)) return null;
  const all = boxes as Rect[];
  const x = Math.min(...all.map((b) => b.x)) - margin;
  const y = Math.min(...all.map((b) => b.y)) - margin;
  return {
    x,
    y,
    width: Math.max(...all.map((b) => b.x + b.width)) + margin - x,
    height: Math.max(...all.map((b) => b.y + b.height)) + margin - y,
  };
}
