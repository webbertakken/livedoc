// @vitest-environment jsdom
// A SPARKLINE's chart in the grid (docs/specs/029-sheets/charts.md "Sparklines").
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Sparkline } from '@livedoc/sheets';
import { SheetSparkline } from './SheetSparkline';

const BOX = { x: 10, y: 20, w: 104, h: 24 };

afterEach(cleanup);

describe('SheetSparkline', () => {
  it('draws a line in the accent over the cell, labelled for assistive tech', () => {
    const chart: Sparkline = { kind: 'line', values: [0, 10, 5], options: {} };
    render(<SheetSparkline chart={chart} box={BOX} ink={undefined} accent="#0a0" muted="#888" />);
    const svg = screen.getByRole('img', { name: 'Line sparkline of 3 values' });
    expect(svg.style.left).toBe('10px');
    expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('#0a0');
    expect(svg.style.opacity).toBe('');
  });

  it('draws columns with the axis muted and set colours as given, faded while waiting', () => {
    const chart: Sparkline = {
      kind: 'column',
      values: [2, -2],
      options: { axis: true, negcolor: 'red' },
    };
    render(
      <SheetSparkline
        chart={chart}
        box={BOX}
        ink="#123"
        accent="#0a0"
        muted="#888"
        waitingOpacity={0.5}
      />,
    );
    const svg = screen.getByRole('img', { name: 'Column sparkline of 2 values' });
    const fills = [...svg.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills).toEqual(['#0a0', 'red']);
    expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('#888');
    expect(svg.style.opacity).toBe('0.5');
  });
});
