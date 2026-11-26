// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createShape, type ShapeElement } from '@livedoc/document';
import { BarChartView } from './BarChartView';
import { LineChartView } from './LineChartView';
import { PieChartView } from './PieChartView';

// Each chart type on the canvas (docs/specs/009-elements/pie-chart.md "Chart types"), drawn from the same marks the
// export draws.
const el = (kind: 'pie-chart' | 'bar-chart' | 'line-chart', extra: Partial<ShapeElement> = {}) =>
  ({ ...createShape(kind, 0, 0), width: 260, height: 220, ...extra }) as ShapeElement;

describe('chart views', () => {
  it('draws Show Axis as the export does: ticks up a column or line chart, along a bar chart, right in colour', () => {
    const series = [
      { name: 'Signups', values: [800, 1200] },
      { name: 'Paid', values: [90, 170], axis: 'right' as const, color: '#ff0000' },
    ];
    const line = render(
      <LineChartView
        element={el('line-chart', {
          chartAxis: true,
          lineCategories: ['W1', 'W2'],
          lineSeries: series,
        })}
        textColor="#000"
      />,
    ).container;
    const ticks = [...line.querySelectorAll('text')].map((t) => t.textContent);
    expect(ticks).toContain('1,500');
    const right = [...line.querySelectorAll('text[text-anchor="start"]')];
    expect(right.map((t) => t.textContent)).toContain('200');
    expect(right[0]!.getAttribute('fill')).toBe('#000');
    expect(line.querySelector('line[stroke="#ff0000"]')).not.toBeNull();
    for (const variant of [undefined, 'horizontal' as const]) {
      const bars = render(
        <BarChartView
          element={el('bar-chart', {
            chartAxis: true,
            pieSlices: [{ label: 'Jul', value: 160 }],
            ...(variant ? { chartVariant: variant } : {}),
          })}
          textColor="#000"
        />,
      ).container;
      expect([...bars.querySelectorAll('text')].map((t) => t.textContent)).toContain('200');
    }
  });

  it('draws several series side by side, each in its colour, names its groups, reads a hovered bar (D281)', () => {
    const { container } = render(
      <BarChartView
        element={el('bar-chart', {
          chartValues: true,
          lineCategories: ['Opus', 'Sonnet'],
          lineSeries: [
            { name: 'Cost', values: [15, null], color: '#aa3300' },
            { name: 'Index', values: [60, 54] },
          ],
        })}
        textColor="#000"
      />,
    );
    const bars = container.querySelectorAll('rect[rx]');
    const filled = [...bars].filter((r) => r.getAttribute('fill') === '#aa3300');
    expect(filled.length).toBeGreaterThanOrEqual(1);
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
    for (const t of ['Opus', 'Sonnet', '60', '54']) expect(texts).toContain(t);
    fireEvent.pointerEnter(filled[0]!);
    expect(container.textContent).toContain('Opus · Cost: 15');
    fireEvent.pointerLeave(filled[0]!);
    expect(container.textContent).not.toContain('Opus · Cost: 15');
  });

  it('draws a doughnut as even-odd ring segments, and reads a hovered slice', () => {
    const { container } = render(
      <PieChartView element={el('pie-chart', { chartVariant: 'doughnut' })} textColor="#000" />,
    );
    const paths = container.querySelectorAll('path[fill-rule="evenodd"]');
    expect(paths.length).toBe(3);
    fireEvent.pointerEnter(paths[0]!);
    fireEvent.pointerMove(paths[0]!);
    expect(container.textContent).toContain('40');
  });

  it('draws a whole pie as a circle, a whole doughnut as a ring', () => {
    const one = { pieSlices: [{ label: 'All', value: 1 }] };
    expect(
      render(
        <PieChartView element={el('pie-chart', one)} textColor="#000" />,
      ).container.querySelector('circle'),
    ).not.toBeNull();
    const ring = render(
      <PieChartView
        element={el('pie-chart', { ...one, chartVariant: 'doughnut' })}
        textColor="#000"
      />,
    ).container;
    expect(ring.querySelector('circle')).toBeNull();
  });

  it('lays a Bar chart’s bars on their side from an upright baseline', () => {
    const { container } = render(
      <BarChartView element={el('bar-chart', { chartVariant: 'horizontal' })} textColor="#000" />,
    );
    const line = container.querySelector('line')!;
    expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'));
    const rects = [...container.querySelectorAll('rect')].filter((r) => r.getAttribute('rx'));
    expect(rects.length).toBe(3);
    fireEvent.pointerEnter(rects[0]!);
    fireEvent.pointerMove(rects[0]!);
    expect(container.textContent).toContain('40');
  });

  it('stands a Column chart’s bars on a level baseline', () => {
    const line = render(
      <BarChartView element={el('bar-chart')} textColor="#000" />,
    ).container.querySelector('line')!;
    expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
  });

  it('fills an Area chart and draws a Scatter chart without lines', () => {
    const area = render(
      <LineChartView element={el('line-chart', { chartVariant: 'area' })} textColor="#000" />,
    ).container;
    expect(area.querySelectorAll('path[fill-opacity]').length).toBe(2);
    expect(area.querySelectorAll('path[stroke-linejoin]').length).toBe(2);
    const scatter = render(
      <LineChartView
        element={el('line-chart', {
          chartVariant: 'scatter',
          lineCategories: ['1', '5', '10'],
          lineSeries: [{ name: 'Y', values: [2, 4, 3] }],
        })}
        textColor="#000"
      />,
    ).container;
    expect(scatter.querySelectorAll('path[stroke-linejoin]').length).toBe(0);
    const dots = scatter.querySelectorAll('circle');
    expect(dots.length).toBe(3);
    // Numeric x: five ticks across the axis.
    expect([...scatter.querySelectorAll('text')].map((t) => t.textContent)).toEqual(
      expect.arrayContaining(['1', '3.25', '5.5', '7.75', '10']),
    );
    fireEvent.pointerEnter(dots[1]!);
    fireEvent.pointerMove(dots[1]!);
    expect(scatter.textContent).toContain('5 · Y');
  });

  // pie-chart.md "Scatter's point names": a named point reads `name, y, x`, whatever series it is in.
  it('reads a named scatter point by its name, its value and its x, on a line series too', () => {
    const named = (linePointNames?: string[]) =>
      render(
        <LineChartView
          element={el('line-chart', {
            chartVariant: 'scatter',
            lineCategories: ['0.2', '1.5'],
            lineSeries: [
              { name: 'Ranks 11 to 25', values: [76.2, null] },
              { name: 'Pareto frontier', values: [76.2, 83.4], line: true },
            ],
            ...(linePointNames ? { linePointNames } : {}),
          })}
          textColor="#000"
        />,
      ).container;
    const scatter = named(['Claude Haiku 5.5', '']);
    const dots = scatter.querySelectorAll('circle');
    fireEvent.pointerEnter(dots[1]!);
    expect(scatter.textContent).toContain('Claude Haiku 5.5, 76.2, 0.2');
    expect(scatter.textContent).not.toContain('Pareto frontier:');
    fireEvent.pointerLeave(dots[1]!);
    // A point with an empty name reads as an unnamed one.
    fireEvent.pointerEnter(dots[2]!);
    expect(scatter.textContent).toContain('1.5 · Pareto frontier: 83.4');
  });

  // pie-chart.md "A scatter series drawn as a line": its points joined in order of x, a line in its key.
  it('joins a scatter series drawn as a line, and keys it with a line', () => {
    const scatter = render(
      <LineChartView
        element={el('line-chart', {
          chartVariant: 'scatter',
          lineCategories: ['3', '1', '2'],
          lineSeries: [
            { name: 'Pareto', values: [1, null, 3], line: true },
            { name: 'Models', values: [2, 2, 2] },
          ],
        })}
        textColor="#000"
      />,
    ).container;
    expect(scatter.querySelectorAll('path[stroke-linejoin]').length).toBe(1);
    // The plot's points (the key's line swatch carries a dot of its own).
    expect(scatter.querySelector('svg')!.querySelectorAll('circle').length).toBe(5);
    expect(scatter.querySelectorAll('[data-key-swatch="line"]').length).toBe(1);
    expect(scatter.querySelectorAll('[data-key-swatch="square"]').length).toBe(1);
  });

  // pie-chart.md "No value is a gap": no mark, no value label; a 0 still draws.
  it('breaks a line at no value and draws no point there', () => {
    const line = render(
      <LineChartView
        element={el('line-chart', {
          chartValues: true,
          lineCategories: ['a', 'b', 'c', 'd'],
          lineSeries: [{ name: 'Y', values: [1, 0, null, 4] }],
        })}
        textColor="#000"
      />,
    ).container;
    expect(line.querySelectorAll('circle').length).toBe(3);
    // One stretch (a, b); d stands alone, as its point.
    expect(
      line.querySelector('path[stroke-linejoin]')!.getAttribute('d')!.match(/M /g),
    ).toHaveLength(1);
    const texts = [...line.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['1', '0', '4']));
  });

  it('draws a scatter’s points only where a series has a value', () => {
    const scatter = render(
      <LineChartView
        element={el('line-chart', {
          chartVariant: 'scatter',
          lineCategories: ['1', '2', '3'],
          lineSeries: [
            { name: 'A', values: [5, null, null] },
            { name: 'B', values: [null, 6, null] },
            { name: 'C', values: [null, null, 7] },
          ],
        })}
        textColor="#000"
      />,
    ).container;
    expect(scatter.querySelectorAll('circle').length).toBe(3);
  });

  it('draws no column and no value for no value, keeping its name', () => {
    const bars = render(
      <BarChartView
        element={el('bar-chart', {
          chartValues: true,
          chartLegend: false,
          pieSlices: [
            { label: 'A', value: 3 },
            { label: 'B', value: null },
          ],
        })}
        textColor="#000"
      />,
    ).container;
    expect(bars.querySelectorAll('rect').length).toBe(1);
    const texts = [...bars.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['3', 'A', 'B']));
    expect(texts).not.toContain('0');
  });
});
