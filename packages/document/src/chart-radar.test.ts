// docs/specs/009-elements/pie-chart.md "Chart types", "Radar" (D291): spokes clockwise from twelve o'clock, each series
// a closed line with markers, a gap breaking the line on both sides, the web always faint behind.
import { describe, expect, it } from 'vitest';
import { isRadarChart, radarMarks } from './chart-radar';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import { lineValueLabels } from './chart-values';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { createShape } from './shape-factory';
import { renderElementsToSvg } from './index';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const CATS = ['Speed', 'Power', 'Range', 'Cost'];
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });

describe('radar as a chart type', () => {
  it('is a line chart kind with its own variant, named Radar', () => {
    expect(chartShapeOf('radar')).toEqual({ shape: 'line-chart', chartVariant: 'radar' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'radar' })).toBe('radar');
    expect(isRadarChart({ shape: 'line-chart', chartVariant: 'radar' })).toBe(true);
    expect(isRadarChart({ shape: 'line-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.radar).toBe('Radar');
  });
});

describe('radarMarks', () => {
  const m = radarMarks(AREA, CATS, [S('A', [1, 2, 3, 4])]);

  it('puts a spoke per category clockwise from twelve o’clock, the centre the least value', () => {
    expect(m.centre).toEqual({ x: 200, y: 100 });
    expect(m.radius).toBe(78);
    expect(m.spokes.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [200, 22],
      [278, 100],
      [200, 178],
      [122, 100],
    ]);
    const first = m.points[0]![0]!;
    expect([first.x, first.y]).toEqual([200, 80.5]);
    expect(m.points[0]![3]!.x).toBeCloseTo(122);
  });

  it('closes a whole series’ line, markers on, nothing filled', () => {
    expect(m.lines[0]).toMatch(/^M 200 80\.5 L .* Z$/);
    expect(m.areas).toEqual([]);
    expect(m.dot).toBe(3);
  });

  it('breaks the line on either side of a gap, joining across twelve o’clock', () => {
    const gap = radarMarks(AREA, CATS, [S('A', [1, null, 3, 4]), S('B', [null, 2, null, null])]);
    // From Range round to Speed: one open stretch of three points.
    expect(gap.lines[0]!.split(' L ')).toHaveLength(3);
    expect(gap.lines[0]).not.toContain('Z');
    expect(gap.lines[0]!.startsWith(`M ${gap.points[0]![2]!.x}`)).toBe(true);
    // A point alone draws no line.
    expect(gap.lines[1]).toBe('');
    expect(radarMarks(AREA, CATS, [S('C', [null, null, null, null])]).lines[0]).toBe('');
  });

  it('draws the outer ring always, a ring and a value per tick with Show Axis', () => {
    expect(m.rings).toHaveLength(1);
    expect(m.axis.left).toEqual([]);
    const axis = radarMarks(AREA, CATS, [S('A', [1, 2, 3, 4])], 0, 0, true);
    expect(axis.rings.length).toBeGreaterThan(1);
    expect(axis.axis.left.at(-1)!.y).toBeCloseTo(axis.centre.y - axis.radius);
    expect(axis.axis.left.map((t) => t.text)).toContain('4');
  });

  it('runs below zero when a value is, and widens a flat range', () => {
    const below = radarMarks(AREA, CATS, [S('A', [-2, 2, 0, 1])]);
    // -2 sits at the centre.
    expect(below.points[0]![0]).toEqual(below.centre);
    const flat = radarMarks(AREA, CATS, [S('A', [0, 0, 0, 0])]);
    expect(flat.points[0]![0]).toEqual(flat.centre);
  });

  it('names each spoke past its end, anchored away from the centre, long names cut', () => {
    const names = radarMarks(
      AREA,
      ['Top', 'A very long category name', 'Bottom', 'Left'],
      [S('A', [1, 2, 3, 4])],
    ).names;
    expect(names.map((n) => n.anchor)).toEqual(['middle', 'start', 'middle', 'end']);
    expect(names[1]!.text).toBe('A very long c…');
    expect(names[0]!.y).toBeLessThan(names[2]!.y);
  });

  it('places Show Values over the points', () => {
    const labels = lineValueLabels(m, [S('A', [1, 2, 3, 4])]);
    expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4']);
  });

  it('lays out nothing for no categories', () => {
    const none = radarMarks(AREA, [], [S('A', [])]);
    expect(none.rings).toEqual(['']);
    expect(none.lines).toEqual(['']);
  });
});

describe('a Radar chart rendered', () => {
  it('draws its web, closed lines, markers, spoke names, ticks and values', () => {
    const el: ShapeElement = {
      ...createShape('line-chart', 0, 0),
      width: 400,
      height: 300,
      chartVariant: 'radar',
      chartAxis: true,
      chartValues: true,
      lineCategories: CATS,
      lineSeries: [S('A', [1, 2, 3, 4])],
    };
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    expect(svg).toContain(' Z"');
    expect(svg).toContain('>Speed</text>');
    expect(svg.split('<circle').length).toBeGreaterThan(4);
  });

  it('draws the sample data with none of its own, and a lone point as its marker', () => {
    const bare: ShapeElement = {
      ...createShape('line-chart', 0, 0),
      chartVariant: 'radar',
      lineCategories: [],
      lineSeries: [],
    };
    expect(renderElementsToSvg({ id: 't', name: 'T', elements: [bare] }, {})).toContain('<circle');
    const lone = renderElementsToSvg(
      {
        id: 't',
        name: 'T',
        elements: [{ ...bare, lineCategories: CATS, lineSeries: [S('A', [null, 2, null, null])] }],
      },
      {},
    );
    expect(lone.split('<circle')).toHaveLength(2);
    expect(lone).not.toContain('stroke-linejoin');
  });
});
