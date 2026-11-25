// The `lines` alias's series (docs/specs/009-elements/pie-chart.md "Lines set by an agent").
import { describe, expect, it } from 'vitest';
import { createShape, LINE_DEFAULT_SERIES, type Element } from '@livedoc/document';
import { seriesWithLines } from './chart-lines';

describe('seriesWithLines', () => {
  it('names the sample series for a chart on its sample data', () => {
    const sample = { ...createShape('line-chart', 0, 0), id: 'c' } as Element;
    const out = seriesWithLines(sample, [LINE_DEFAULT_SERIES[1]!.name]);
    expect('series' in out && out.series.map((s) => s.line === true)).toEqual([false, true]);
  });

  it('has no series to name on an element that is no chart', () => {
    const text = { id: 't', type: 'text', x: 0, y: 0, width: 1, height: 1, label: '' } as Element;
    expect(seriesWithLines(text, ['Pareto'])).toEqual({
      rule: `series names of this chart: ${LINE_DEFAULT_SERIES.map((s) => s.name).join(', ')}`,
    });
  });
});
