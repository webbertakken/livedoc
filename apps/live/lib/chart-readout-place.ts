// Where a chart's hover readout sits so it stays in view (docs/specs/009-elements/pie-chart.md "The readout stays in
// view"): above its mark, moved in along its side just far enough to stay inside what is seen of the page (a sheet
// scrolled part way past the chart, a panel's edge, the window's), and below its mark when there is no room above.

// The px the readout keeps from the edge of what is seen.
export const READOUT_EDGE_PX = 4;
// The px of its own (unscaled) between a mark and a readout sitting below it, so the readout does not cover the mark.
export const READOUT_BELOW_GAP_PX = 10;

export type Area = { left: number; top: number; right: number; bottom: number };

// The readout in screen px: its mark at (x, y), its size, its gap below the mark, and which of its edges sits at it.
export type ReadoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  gap: number;
  align: 'start' | 'center' | 'end';
};

const ALIGN_SHIFT = { start: 0, center: 0.5, end: 1 } as const;

// How far the readout moves along its side, in screen px, and whether it sits below its mark. Pure.
export function readoutPlace(box: ReadoutBox, view: Area): { dx: number; below: boolean } {
  const left = box.x - box.width * ALIGN_SHIFT[box.align];
  const right = left + box.width;
  const least = view.left + READOUT_EDGE_PX;
  const most = view.right - READOUT_EDGE_PX;
  // Its start stays in view first: a readout wider than the view is read from its start.
  const dx = left < least ? least - left : right > most ? Math.max(most - right, least - left) : 0;
  const roomAbove = box.y - box.height >= view.top + READOUT_EDGE_PX;
  const roomBelow = box.y + box.gap + box.height <= view.bottom - READOUT_EDGE_PX;
  return { dx, below: !roomAbove && roomBelow };
}

// What is seen of the page around `el`: the window, cut by every ancestor that clips what overflows it.
export function visibleArea(el: Element): Area {
  const area: Area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let at = el.parentElement; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const r = at.getBoundingClientRect();
    area.left = Math.max(area.left, r.left);
    area.top = Math.max(area.top, r.top);
    area.right = Math.min(area.right, r.right);
    area.bottom = Math.min(area.bottom, r.bottom);
  }
  return area;
}
