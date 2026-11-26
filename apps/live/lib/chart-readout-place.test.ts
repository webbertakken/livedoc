// @vitest-environment jsdom
// A chart's hover readout stays in view (docs/specs/009-elements/pie-chart.md "The readout stays in view"): it moves
// in along its side to stay inside what is seen of the page, and sits below its mark with no room above.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READOUT_EDGE_PX, readoutPlace, visibleArea } from './chart-readout-place';

const view = { left: 100, top: 50, right: 500, bottom: 400 };
// A readout 80 px wide and 20 tall, centred above a mark at (x, y).
const box = (x: number, y: number) => ({
  x,
  y,
  width: 80,
  height: 20,
  gap: 10,
  align: 'center' as const,
});

describe('readoutPlace', () => {
  it('leaves a readout with room all round where it is', () => {
    expect(readoutPlace(box(300, 200), view)).toEqual({ dx: 0, below: false });
  });

  it('moves in from a side the view cuts it at, by just enough', () => {
    // Centred at 110 it would start at 70: 30 px past the view's left, plus the edge.
    expect(readoutPlace(box(110, 200), view)).toEqual({ dx: 30 + READOUT_EDGE_PX, below: false });
    expect(readoutPlace(box(490, 200), view)).toEqual({
      dx: -(30 + READOUT_EDGE_PX),
      below: false,
    });
  });

  it('keeps its start in view when it is wider than the view', () => {
    const wide = { ...box(300, 200), width: 600 };
    // Centred at 300 it would start at 0.
    expect(readoutPlace(wide, view).dx).toBe(100 + READOUT_EDGE_PX);
  });

  it('sits below its mark with no room above, and stays above when below has none either', () => {
    expect(readoutPlace(box(300, 60), view)).toEqual({ dx: 0, below: true });
    expect(readoutPlace(box(300, 60), { ...view, bottom: 70 })).toEqual({ dx: 0, below: false });
  });

  it('starts or ends at its mark as its alignment says', () => {
    expect(readoutPlace({ ...box(460, 200), align: 'start' }, view).dx).toBe(
      500 - READOUT_EDGE_PX - 540,
    );
    expect(readoutPlace({ ...box(140, 200), align: 'end' }, view).dx).toBe(
      100 + READOUT_EDGE_PX - 60,
    );
  });
});

describe('visibleArea', () => {
  afterEach(() => vi.restoreAllMocks());

  const rect = (left: number, top: number, right: number, bottom: number) =>
    ({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
    }) as DOMRect;

  it('is the window cut by every ancestor that clips, and no other', () => {
    const clip = document.createElement('div');
    clip.style.overflow = 'hidden';
    const open = document.createElement('div');
    const el = document.createElement('div');
    open.append(el);
    clip.append(open);
    document.body.append(clip);
    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(rect(40, -10, 2000, 300));
    vi.spyOn(open, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 10, 10));
    expect(visibleArea(el)).toEqual({ left: 40, top: 0, right: window.innerWidth, bottom: 300 });
    clip.remove();
  });
});
