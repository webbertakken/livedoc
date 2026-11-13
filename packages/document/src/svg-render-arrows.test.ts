import { describe, expect, it } from 'vitest';
import { createArrow } from './factories';
import { svgArrow } from './svg-render-arrows';
import type { ArrowElement, Element } from './index';

// The export's arrow (docs/specs/008-canvas/canvas-and-palette.md "Export"): its heads aim along the path as drawn,
// and its line carries the look and motion the canvas gives it.

const line = (extra: Partial<ArrowElement> = {}): ArrowElement => ({
  ...createArrow(0, 0, 100, 40),
  id: 'line',
  ...extra,
});

// Each head polygon's tip and wings, parsed from the export.
const heads = (svg: string) =>
  [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) =>
    m[1]!.split(' ').map((p) => p.split(',').map(Number) as [number, number]),
  );

describe('svgArrow heads', () => {
  it("aims an angled arrow's heads from its elbow", () => {
    // Horizontal first: the elbow is (100, 0), so the head at (100, 40) points straight down.
    const [tip, wingA, wingB] = heads(svgArrow(line({ arrowStyle: 'angled' }), []))[0]!;
    expect(tip).toEqual([100, 40]);
    expect(wingA![1]).toBeCloseTo(wingB![1], 6);
    expect(wingA![1]).toBeLessThan(40);
  });

  it("aims a multi-bend arrow's heads from its first and last points", () => {
    // One bend point at (100, 0): both ends aim from it, whether the bend is a spline's or a polyline's.
    const bend = { curvePoints: [{ dx: 50, dy: -20 }], arrowEnds: 'both' as const };
    for (const arrowStyle of ['curved', 'angled'] as const) {
      const [end, start] = heads(svgArrow(line({ ...bend, arrowStyle }), []));
      expect(end![0]).toEqual([100, 40]);
      expect(end![1]![1]).toBeCloseTo(end![2]![1], 6);
      // The start aims back from (100, 0) along the top: its wings share an x.
      expect(start![0]).toEqual([0, 0]);
      expect(start![1]![0]).toBeCloseTo(start![2]![0], 6);
    }
  });
});

describe('svgArrow line', () => {
  it('carries the see-through opacity of a faded arrow', () => {
    expect(svgArrow(line({ opacity: 0.5 }), [])).toMatch(/^<g opacity="0.5">/);
    expect(svgArrow(line(), [])).toMatch(/^<g>/);
  });

  it('marches a moving flow on its own pattern, with only the parts it sets', () => {
    const full = svgArrow(
      line(),
      [],
      'light',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        className: 'flow-march',
        dash: '4 4',
        pathLength: 1,
        style: '--speed: 2s',
      },
    );
    expect(full).toContain('stroke-dasharray="4 4"');
    expect(full).toContain('class="flow-march" pathLength="1" style="--speed: 2s"');
    const bare = svgArrow(
      line(),
      [],
      'light',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        className: 'flow-dot',
        style: '',
      },
    );
    expect(bare).toContain('class="flow-dot"');
    expect(bare).not.toContain('pathLength');
    expect(bare).not.toContain('style=');
    expect(bare).not.toContain('stroke-dasharray');
  });

  it("lays a marker's second ink layer over the first", () => {
    // An angled line is two strokes, one in each layer.
    const svg = svgArrow(line({ finish: 'marker', arrowStyle: 'angled', arrowEnds: 'none' }), []);
    expect(svg.match(/<path d="[^"]+" fill="none"/g)).toHaveLength(2);
    expect(svg).toContain('stroke-opacity=');
  });

  it('breaks around the boxes of any iterable it is given, and labels in the tab font', () => {
    const box: Element = {
      id: 'box',
      type: 'shape',
      shape: 'square',
      x: 40,
      y: -10,
      width: 20,
      height: 60,
      fillColor: '#ffffff',
    };
    const labelled = line({ label: 'Flows' });
    const occluders = new Set<Element>([box]);
    const svg = svgArrow(
      labelled,
      [labelled, box],
      'light',
      'Inter',
      undefined,
      undefined,
      occluders,
    );
    expect(svg).toContain('<mask id="lvd-ko-line"');
    expect(svg).toContain('x="30"');
  });
});

describe('svgArrow on a named actor', () => {
  it('starts under the actor\'s name, as the canvas does (arrow-anchors.md "The actor\'s name")', () => {
    const actor: Element = {
      id: 'actor',
      type: 'shape',
      shape: 'actor',
      x: 0,
      y: 0,
      width: 90,
      height: 130,
      label: 'Customer',
    };
    const down = line({
      from: { kind: 'pinned', elementId: 'actor', anchor: 's' },
      to: { kind: 'free', x: 45, y: 300 },
    });
    expect(svgArrow(down, [actor])).toMatch(/<path d="M 45 130 /);
  });
});
