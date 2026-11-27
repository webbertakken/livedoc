// @vitest-environment jsdom
// pie-chart.md "The readout stays in view": a readout a clipping box cuts moves in along its side; with no room above
// its point it sits below it; a page scrolling under it measures it again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { READOUT_EDGE_PX } from '@/lib/chart-readout-place';
import { ChartReadout } from './ChartReadout';

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
  }) as DOMRect;

// The readout inside a chart frame (200 by 100 px at 0,0, drawn at `scale`), inside a box that clips from x = 50.
function mount(node: React.ReactNode, scale = 1) {
  const view = render(
    <div data-clip style={{ overflow: 'hidden' }}>
      <div data-frame>{node}</div>
    </div>,
  );
  const clip = view.container.querySelector<HTMLElement>('[data-clip]')!;
  const frame = view.container.querySelector<HTMLElement>('[data-frame]')!;
  vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(rect(50, 0, 1000, 1000));
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 200 * scale, 100 * scale));
  vi.spyOn(frame, 'offsetWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-chart-readout') ? frame : null;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-chart-readout') ? 80 : 200;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20);
  // Laid out now: a scroll measures it again, as one under a held hover does.
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
  return view;
}

const readout = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-chart-readout]')!;

describe('ChartReadout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('moves in from a clipped side by just enough, in the chart’s own px', () => {
    // Centred at x = 40 it would start at 0: the clip starts at 50.
    const { container, rerender } = mount(
      <ChartReadout leftPct={20} topPct={50} label="a" value={1} />,
    );
    expect(readout(container).style.marginLeft).toBe(`${50 + READOUT_EDGE_PX}px`);
    expect(readout(container).dataset.chartReadout).toBe('above');
    expect(readout(container).textContent).toBe('a: 1');
    rerender(
      <div data-clip style={{ overflow: 'hidden' }}>
        <div data-frame>
          <ChartReadout leftPct={60} topPct={50} lines={['Haiku', 'Coding index: 76.2']} />
        </div>
      </div>,
    );
    expect(readout(container).style.marginLeft).toBe('');
    // Lines, one under the other, the first naming the point.
    expect([...readout(container).children].map((line) => line.textContent)).toEqual([
      'Haiku',
      'Coding index: 76.2',
    ]);
  });

  it('sits below a point with no room above it', () => {
    const { container } = mount(<ChartReadout leftPct={60} topPct={5} label="" value={1} />);
    expect(readout(container).dataset.chartReadout).toBe('below');
    expect(readout(container).style.marginTop).not.toBe('');
    expect(readout(container).textContent).toBe('—: 1');
  });

  it('starts or ends at its point as told, moved in by the chart’s own px when it is drawn scaled', () => {
    // Drawn at twice its size: its end at x = 40 on screen, 160 px wide, so it would start at -120; the clip starts at 50.
    const end = mount(<ChartReadout leftPct={10} topPct={50} align="end" label="a" value={1} />, 2);
    expect(readout(end.container).className).toContain('-translate-x-full');
    expect(readout(end.container).style.marginLeft).toBe(`${(170 + READOUT_EDGE_PX) / 2}px`);
    end.unmount();
    vi.restoreAllMocks();
    const start = mount(
      <ChartReadout leftPct={50} topPct={50} align="start" label="a" value={1} />,
    );
    expect(readout(start.container).className).toContain('translate-x-0');
    expect(readout(start.container).style.marginLeft).toBe('');
  });

  it('measures nothing outside a laid-out frame', () => {
    const { container } = render(<ChartReadout leftPct={0} topPct={0} label="a" value={1} />);
    expect(readout(container).style.marginLeft).toBe('');
    expect(readout(container).dataset.chartReadout).toBe('above');
  });
});
