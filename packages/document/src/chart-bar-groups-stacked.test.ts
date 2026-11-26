// docs/specs/009-elements/pie-chart.md "Stacking" (D282): a column or bar chart of several series, each category one
// bar of a segment per series, below zero a stack of its own; 100% as shares, its ticks percents.
import { describe, expect, it } from 'vitest';
import {
  BAR_GROUP_SHARE,
  BAR_THICK_MAX,
  barGroupMarks,
  barGroupValueLabels,
} from './chart-bar-groups';
import type { ShapeElement } from './index';
import { createShape } from './shape-factory';
import { svgBarChart, svgLineChart } from './svg-render-charts';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const CATS = ['Opus', 'Sonnet', 'Haiku'];
const SERIES = [
  { name: 'Input', values: [10, 0.5, null] },
  { name: 'Output', values: [30, -4, 40] },
];

describe('barGroupMarks stacked', () => {
  it('draws one square-cornered bar a category, each series a segment on the last', () => {
    const m = barGroupMarks(AREA, CATS, SERIES, false, 0, 0, false, 'stacked');
    expect(m.stack).toBe('stacked');
    const [a, b] = [m.bars[0]![0]!, m.bars[1]![0]!];
    expect(a.x).toBeCloseTo(b.x);
    expect(a.w).toBeCloseTo(b.w);
    const slot = (m.baseline.x2 - m.baseline.x1) / 3;
    expect(a.w).toBeCloseTo(Math.min(slot * BAR_GROUP_SHARE, BAR_THICK_MAX));
    expect(a.rx).toBe(0);
    // The second sits on the first: its foot at the first's end.
    expect(a.y + a.h).toBeCloseTo(m.baseline.y1);
    expect(b.y + b.h).toBeCloseTo(a.y);
    expect(b.h).toBeCloseTo(a.h * 3);
    // The tallest stack, 40, reaches the plot's top end: 10 + 30 is level with it.
    expect(b.y).toBeCloseTo(m.bars[1]![2]!.y);
    // A value below zero hangs from zero in its own stack; no value, no segment.
    const below = m.bars[1]![1]!;
    expect(below.y).toBeCloseTo(m.baseline.y1);
    expect(m.bars[0]![2]).toBeNull();
  });

  it('lays a stacked bar chart’s segments left to right, its percent ticks reading percents', () => {
    const m = barGroupMarks(AREA, CATS, SERIES, true, 0, 0, true, 'percent');
    const [a, b] = [m.bars[0]![0]!, m.bars[1]![0]!];
    expect(a.y).toBeCloseTo(b.y);
    expect(b.x).toBeCloseTo(a.x + a.w);
    // 25% and 75% of the one category.
    expect(b.w).toBeCloseTo(a.w * 3);
    expect(m.axis.ticks.at(-1)!.text).toBe('100%');
    expect(m.axis.ticks.some((t) => t.text.startsWith('-'))).toBe(true);
    // A category of one value fills its stack.
    const full = m.bars[1]![2]!;
    expect(full.x + full.w).toBeCloseTo(b.x + b.w);
  });

  it('prints each segment’s value in its middle, in its series’ ink, when it holds it', () => {
    const tall = { x: 0, y: 0, w: 400, h: 400 };
    const m = barGroupMarks(tall, CATS, SERIES, false, 0, 0, false, 'stacked');
    const labels = barGroupValueLabels(m, SERIES, false, 10);
    const top = labels.find((l) => l.text === '30')!;
    const seg = m.bars[1]![0]!;
    expect(top.x).toBeCloseTo(seg.x + seg.w / 2);
    expect(top.y).toBeCloseTo(seg.y + seg.h / 2 + 3.5);
    expect(top.onMark).toBe(1);
    expect(top.anchor).toBe('middle');
    // A segment too short for its number has none: 0.5 of the second category, a few px tall.
    expect(labels.some((l) => l.text === '0.5')).toBe(false);
    expect(labels.map((l) => l.text)).toEqual(['10', '30', '-4', '40']);
  });

  it('keeps a stacked bar chart’s numbers to segments wide enough for them', () => {
    const m = barGroupMarks(AREA, CATS, SERIES, true, 0, 0, false, 'stacked');
    const texts = barGroupValueLabels(m, SERIES, true, 10).map((l) => l.text);
    expect(texts).toContain('30');
    expect(texts).not.toContain('0.5');
  });
});

describe('stacked charts in SVG', () => {
  const chart = (shape: 'bar-chart' | 'line-chart', extra: Partial<ShapeElement>) =>
    ({
      ...createShape(shape, 0, 0),
      width: 400,
      height: 400,
      lineCategories: CATS,
      lineSeries: [
        { ...SERIES[0]!, color: '#ffffff' },
        { ...SERIES[1]!, color: '#111111' },
      ],
      ...extra,
    }) as ShapeElement;

  it('draws a stacked column chart’s segments square, its numbers on them in readable ink', () => {
    const svg = svgBarChart(
      chart('bar-chart', { chartStack: 'stacked', chartValues: true, chartAxis: true }),
      '#777777',
    );
    const rects = svg.split('<rect ').slice(1);
    expect(rects.filter((r) => r.slice(0, r.indexOf('>')).includes('rx="0"'))).toHaveLength(5);
    // 30 sits on the near-black segment: light ink; 10 on the white one: dark ink.
    expect(svg).toMatch(/fill="#ffffff">30</);
    expect(svg).toMatch(/fill="#[0-9a-f]{6}">10</);
    expect(svg).not.toMatch(/fill="#ffffff">10</);
  });

  it('draws a 100% stacked area chart’s bands and percent ticks', () => {
    const svg = svgLineChart(
      chart('line-chart', { chartVariant: 'area', chartStack: 'percent', chartAxis: true }),
      '#777777',
    );
    expect(svg).toContain('>100%<');
    expect(svg.match(/fill-opacity/g)).toHaveLength(2);
  });

  it('leaves a chart with stacking but one series unstacked', () => {
    const one = { lineSeries: [SERIES[0]!] };
    expect(svgBarChart(chart('bar-chart', { ...one, chartStack: 'percent' }), '#000')).toBe(
      svgBarChart(chart('bar-chart', one), '#000'),
    );
  });
});
