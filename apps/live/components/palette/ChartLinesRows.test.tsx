// @vitest-environment jsdom
// Lines (docs/specs/009-elements/pie-chart.md "A scatter series drawn as a line"): a tile per series of a scatter
// chart, pressed while it is drawn as a line.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartLinesRows } from './ChartLinesRows';

afterEach(() => cleanup());

describe('ChartLinesRows', () => {
  it('presses the series drawn as lines, and a press flips one', () => {
    const onSetLine = vi.fn();
    render(
      <ChartLinesRows
        series={[
          { name: 'Models', values: [1] },
          { name: 'Pareto', values: [2], line: true },
        ]}
        palette={['#ff0000', '#00ff00']}
        onSetLine={onSetLine}
      />,
    );
    expect(screen.getByText('Lines')).toBeTruthy();
    const models = screen.getByRole('button', { name: 'Models' });
    const pareto = screen.getByRole('button', { name: 'Pareto' });
    expect(models.getAttribute('aria-pressed')).toBe('false');
    expect(pareto.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(models);
    expect(onSetLine).toHaveBeenLastCalledWith(0, true);
    fireEvent.click(pareto);
    expect(onSetLine).toHaveBeenLastCalledWith(1, false);
  });
});
