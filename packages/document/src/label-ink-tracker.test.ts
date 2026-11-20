import { describe, expect, it } from 'vitest';
import { withReadableLabelInks } from './label-backdrop';
import { createLabelInkTracker } from './label-ink-tracker';
import type { Element } from './index';

// docs/specs/008-canvas/canvas-performance.md "Derived layouts are computed once per change": the label inks a
// redraw needs (docs/specs/011-theme/light-and-dark.md "A theme never sinks a label into what is behind it"), worked
// out again only for the labels a change can reach.

const panel = (id: string, fillColor: string, x = 0, y = 0, w = 400, h = 300) =>
  ({
    id,
    type: 'shape',
    shape: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    fillColor,
  }) as unknown as Element;
const words = (id: string, textColor: string, x = 100, y = 100) =>
  ({
    id,
    type: 'text',
    x,
    y,
    width: 120,
    height: 24,
    label: 'Words',
    textColor,
  }) as unknown as Element;
const stroke = (id: string) =>
  ({
    id,
    type: 'freehand',
    x: 900,
    y: 900,
    width: 50,
    height: 20,
    points: [],
  }) as unknown as Element;

// Before: a dark label on a light panel; after (a redraw in the dark half): the panel drawn dark, the label still dark.
const BEFORE_CANVAS = '#fbfaf7';
const AFTER_CANVAS = '#0f172a';
// Drawn as the canvas draws: an unchanged element keeps the drawn object it had.
const drawnOf = new WeakMap<Element, Element>();
const drawn = (els: readonly Element[]) =>
  els.map((el) => {
    if (el.type !== 'shape') return el;
    const known = drawnOf.get(el) ?? ({ ...el, fillColor: '#1e293b' } as Element);
    drawnOf.set(el, known);
    return known;
  });

function board(): Element[] {
  return [
    panel('p1', '#fde68a'),
    words('t1', '#0f172a'),
    panel('p2', '#bbf7d0', 1000, 0),
    words('t2', '#0f172a', 1100, 100),
    words('t3', '#0f172a', 3000, 3000),
  ];
}

function step(track: ReturnType<typeof createLabelInkTracker>, before: Element[]) {
  const after = drawn(before);
  const got = track(before, BEFORE_CANVAS, after, AFTER_CANVAS);
  expect(got).toEqual(withReadableLabelInks(before, BEFORE_CANVAS, after, AFTER_CANVAS));
  return got;
}

describe('createLabelInkTracker', () => {
  it('gives what a whole-board pass gives, through every kind of change', () => {
    const track = createLabelInkTracker();
    let els = board();
    step(track, els);
    // A stroke added, a label moved onto the second panel, a panel moved off its label, a label recoloured,
    // a panel removed, and the paint order changed.
    els = [...els, stroke('s')];
    step(track, els);
    els = els.map((el) => (el.id === 't3' ? ({ ...el, x: 1150, y: 150 } as Element) : el));
    step(track, els);
    els = els.map((el) => (el.id === 'p1' ? ({ ...el, x: 2000 } as Element) : el));
    step(track, els);
    els = els.map((el) => (el.id === 't2' ? ({ ...el, textColor: '#334155' } as Element) : el));
    step(track, els);
    els = els.filter((el) => el.id !== 'p2');
    step(track, els);
    els = [els[1]!, els[0]!, ...els.slice(2)];
    step(track, els);
  });

  it('keeps every label as it was through a change no label can see', () => {
    const track = createLabelInkTracker();
    const els = board();
    const first = step(track, els);
    const next = step(track, [...els, stroke('s')]);
    for (const id of ['t1', 't2', 't3'])
      expect(next.find((el) => el.id === id)).toBe(first.find((el) => el.id === id));
  });
});
