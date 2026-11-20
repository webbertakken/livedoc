// The label inks a redraw needs, worked out again on a change of the board only for the labels the change can reach
// (docs/specs/008-canvas/canvas-performance.md "Derived layouts are computed once per change";
// docs/specs/011-theme/light-and-dark.md "A theme never sinks a label into what is behind it"). A label's ink reads
// its own colours and the panels under its centre, so a change reaches the labels it changed and those whose centre
// lies on a panel it changed, moved, added or removed (where it was, and where it is). A change of canvas, of the
// paint order, or of more than CHANGED_ELEMENTS_LIMIT elements works every label out again. Pure, per tracker.
import { withReadableLabelInks } from './label-backdrop';
import type { Element } from './index';

/** More changed elements than this and the whole board is worked out again: one pass over every label then costs
 *  less than checking each label against every changed panel. Safe range 16..512. */
const CHANGED_ELEMENTS_LIMIT = 64;

type Box = { type: string; x?: number; y?: number; width?: number; height?: number };
type Rect = { x: number; y: number; width: number; height: number };

const num = (v: number | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;
const isPanel = (el: Element): boolean => el.type === 'shape' || el.type === 'sticky';
const rectOf = (el: Element): Rect => {
  const b = el as Box;
  return { x: num(b.x), y: num(b.y), width: num(b.width), height: num(b.height) };
};

// The ids whose element differs between two boards (changed, added or removed), or null when the elements both hold
// sit in another order.
function changedIds(prev: readonly Element[], next: readonly Element[]): Set<string> | null {
  const prevById = new Map(prev.map((el) => [el.id, el] as const));
  const nextIds = new Set(next.map((el) => el.id));
  const changed = new Set<string>();
  const kept: string[] = [];
  for (const el of next) {
    const was = prevById.get(el.id);
    if (was !== el) changed.add(el.id);
    if (was) kept.push(el.id);
  }
  let k = 0;
  for (const el of prev) {
    if (!nextIds.has(el.id)) {
      changed.add(el.id);
      continue;
    }
    if (kept[k++] !== el.id) return null;
  }
  return changed;
}

// The labels a change can reach: its own, and every element whose centre lies on a panel it touched.
function reached(
  changed: ReadonlySet<string>,
  boards: readonly (readonly Element[])[],
  after: readonly Element[],
): Set<string> {
  const panels: Rect[] = [];
  for (const els of boards)
    for (const el of els) if (changed.has(el.id) && isPanel(el)) panels.push(rectOf(el));
  const out = new Set(changed);
  if (panels.length === 0) return out;
  for (const el of after) {
    const r = rectOf(el);
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (panels.some((p) => cx > p.x && cx < p.x + p.width && cy > p.y && cy < p.y + p.height))
      out.add(el.id);
  }
  return out;
}

export function createLabelInkTracker(): <T extends Element>(
  before: readonly Element[],
  beforeCanvas: string,
  after: readonly T[],
  afterCanvas: string,
) => readonly T[] {
  let last: {
    before: readonly Element[];
    beforeCanvas: string;
    after: readonly Element[];
    afterCanvas: string;
    // Each label the last pass re-inked, by id, against the element it re-inked.
    inked: Map<string, { from: Element; to: Element }>;
  } | null = null;
  return <T extends Element>(
    before: readonly Element[],
    beforeCanvas: string,
    after: readonly T[],
    afterCanvas: string,
  ): readonly T[] => {
    const sameCanvases =
      last !== null && last.beforeCanvas === beforeCanvas && last.afterCanvas === afterCanvas;
    const changedBefore = sameCanvases ? changedIds(last!.before, before) : null;
    const changedAfter = sameCanvases ? changedIds(last!.after, after) : null;
    let out: readonly T[];
    if (
      !last ||
      !changedBefore ||
      !changedAfter ||
      changedBefore.size + changedAfter.size > CHANGED_ELEMENTS_LIMIT
    ) {
      out = withReadableLabelInks(before, beforeCanvas, after, afterCanvas);
    } else {
      const changed = new Set([...changedBefore, ...changedAfter]);
      const ids = reached(changed, [last.before, before, last.after, after], after);
      const fresh =
        changed.size === 0
          ? after
          : withReadableLabelInks(before, beforeCanvas, after, afterCanvas, ids);
      const inked = last.inked;
      let merged: T[] | null = null;
      after.forEach((el, i) => {
        const kept = ids.has(el.id) ? undefined : inked.get(el.id);
        const pick = kept && kept.from === el ? (kept.to as T) : fresh[i]!;
        if (pick === el) return;
        merged ??= [...after];
        merged[i] = pick;
      });
      out = merged ?? after;
    }
    const inked = new Map<string, { from: Element; to: Element }>();
    after.forEach((el, i) => {
      if (out[i] !== el) inked.set(el.id, { from: el, to: out[i]! });
    });
    last = { before, beforeCanvas, after, afterCanvas, inked };
    return out;
  };
}
