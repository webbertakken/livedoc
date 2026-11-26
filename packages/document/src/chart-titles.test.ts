// A chart's title and axis titles (docs/specs/029-sheets/charts.md "The model"): each takes its band of the box from
// the plot, the pie has no axis titles, and the export draws the same texts the canvas lays out.
import { describe, expect, it } from 'vitest';
import { chartFrame } from './chart-frame';
import { createShape } from './shape-factory';
import { renderElementsToSvg } from './svg-render';
import { CHART_AXIS_TITLE_BAND_PX, CHART_TITLE_BAND_PX } from './chart-titles';
import type { ShapeElement } from './index';

const chart = (shape: 'line-chart' | 'pie-chart', x: Partial<ShapeElement> = {}) =>
  ({
    ...createShape(shape, 0, 0),
    id: 'c',
    width: 400,
    height: 300,
    chartLegend: false,
    ...x,
  }) as ShapeElement;

describe('chart titles', () => {
  it('lays a chart with none out as before', () => {
    const f = chartFrame(chart('line-chart'));
    expect(f.titles).toEqual([]);
    expect(f.area).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('takes a band off the top for the title and off the plot for each axis title', () => {
    const f = chartFrame(
      chart('line-chart', { chartTitle: 'Value', chartAxisTitles: { x: 'Cost', y: 'Index' } }),
    );
    expect(f.area).toEqual({
      x: CHART_AXIS_TITLE_BAND_PX,
      y: CHART_TITLE_BAND_PX,
      w: 400 - CHART_AXIS_TITLE_BAND_PX,
      h: 300 - CHART_TITLE_BAND_PX - CHART_AXIS_TITLE_BAND_PX,
    });
    expect(f.titles.map((t) => [t.text, t.turned, t.bold])).toEqual([
      ['Value', false, true],
      ['Cost', false, false],
      ['Index', true, false],
    ]);
  });

  it('puts the legend below the title, and gives a pie its title but no axis titles', () => {
    const f = chartFrame(
      chart('pie-chart', {
        chartLegend: true,
        chartLegendPosition: 'top',
        chartTitle: 'Share',
        chartAxisTitles: { x: 'Cost' },
      }),
    );
    expect(f.legend.y).toBe(CHART_TITLE_BAND_PX);
    expect(f.titles.map((t) => t.text)).toEqual(['Share']);
  });

  it('draws nothing for a blank title', () => {
    expect(chartFrame(chart('line-chart', { chartTitle: '  ' })).titles).toEqual([]);
  });

  it('draws the titles in an export, escaped, the vertical one turned', () => {
    const el = chart('line-chart', { chartTitle: 'A & B', chartAxisTitles: { y: 'Index' } });
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    expect(svg).toContain('>A &amp; B</text>');
    expect(svg).toMatch(/<text [^>]*transform="rotate\(-90 [^"]*"[^>]*>Index<\/text>/);
  });
});
