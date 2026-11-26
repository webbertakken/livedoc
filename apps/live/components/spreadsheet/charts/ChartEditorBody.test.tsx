// @vitest-environment jsdom
// The Chart Editor (docs/specs/029-sheets/charts.md "Chart Editor"): Setup changes the type, the data range and a
// scatter's lines; Customise the titles, legend, palette, value axis, data labels and alt text; each writes the chart
// whole, a text only when it is left or Enter is pressed.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetChart } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { CHART_GONE, CHART_RANGE, ChartEditorBody } from './ChartEditorBody';

vi.mock('@/hooks/ui/useDocumentColours', () => ({ useDocumentColours: () => [] }));

beforeAll(stubResizeObserver);
afterEach(cleanup);

const chartOf = (h: SheetHarness) => h.store.sheet(SHEET_ID)!.layout.objects?.[0];

async function open(type: SheetChart['type'] = 'scatter') {
  const h = await makeSheet({
    rows: 8,
    cols: 6,
    cells: {
      A1: 'Cost',
      B1: 'Index',
      C1: 'Pareto',
      A2: '1',
      B2: '40',
      C2: '40',
      A3: '2',
      B3: '50',
    },
  });
  const onClose = vi.fn();
  const write = (next: SheetChart | null, id = 'chart1') =>
    h.ctl().write({ kind: 'layout', changes: [{ k: 'object', id, object: next }] }, 'Chart');
  renderSheet(h, () => (
    <ChartEditorBody chartId="chart1" onChange={(next) => write(next)} onClose={onClose} />
  ));
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  act(() => {
    write({
      id: 'chart1',
      kind: 'chart',
      at: { r: rows[0]!, c: cols[4]!, dx: 0, dy: 0 },
      width: 420,
      height: 280,
      type,
      range: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[2]! },
    });
  });
  return { h, onClose, write, cols };
}

describe('the Chart Editor', () => {
  it('says so when the chart is gone', async () => {
    const { write } = await open();
    act(() => void write(null));
    expect(screen.getByText(CHART_GONE)).toBeTruthy();
  });

  it('changes the type, draws a scatter series as a line, and reads a new range', async () => {
    const { h, cols } = await open();
    const series = screen.getByRole('group', { name: 'Series' });
    // A scatter's first column of numbers is its x: Index and Pareto are its series.
    expect(within(series).getByText('Index')).toBeTruthy();
    expect(within(series).queryByText('Cost')).toBeNull();
    fireEvent.click(within(series).getByRole('switch', { name: 'Draw Pareto as a Line' }));
    expect(chartOf(h)!.series).toEqual({ [cols[2]!]: { line: true } });
    fireEvent.click(within(series).getByRole('switch', { name: 'Draw Pareto as a Line' }));
    expect(chartOf(h)!.series).toBeUndefined();
    const range = screen.getByRole<HTMLInputElement>('textbox', { name: 'Data Range' });
    expect(range.value).toBe('A1:C3');
    fireEvent.change(range, { target: { value: 'nonsense' } });
    fireEvent.blur(range);
    expect(screen.getByRole('alert').textContent).toBe(CHART_RANGE);
    fireEvent.change(range, { target: { value: 'A1:B3' } });
    fireEvent.keyDown(range, { key: 'Enter' });
    expect(chartOf(h)!.range).toMatchObject({ c2: cols[1] });
    fireEvent.change(screen.getByRole('combobox', { name: 'Chart Type' }), {
      target: { value: 'column' },
    });
    expect(chartOf(h)!.type).toBe('column');
    expect(screen.queryByRole('switch', { name: /as a Line/ })).toBeNull();
  });

  it('sets the titles when left, the legend, palette, axis, labels and alt text, and closes', async () => {
    const { h, onClose } = await open('line');
    fireEvent.click(screen.getByRole('tab', { name: 'Customise' }));
    const title = screen.getByRole('textbox', { name: 'Chart Title' });
    fireEvent.change(title, { target: { value: 'Value' } });
    expect(chartOf(h)!.title).toBeUndefined();
    fireEvent.blur(title);
    expect(chartOf(h)!.title).toBe('Value');
    const x = screen.getByRole('textbox', { name: 'Horizontal Axis Title' });
    fireEvent.change(x, { target: { value: 'Cost' } });
    fireEvent.keyDown(x, { key: 'Enter' });
    const y = screen.getByRole('textbox', { name: 'Vertical Axis Title' });
    fireEvent.change(y, { target: { value: 'Typed' } });
    fireEvent.keyDown(y, { key: 'Escape' });
    fireEvent.blur(y);
    expect(chartOf(h)).toMatchObject({ xTitle: 'Cost' });
    expect(chartOf(h)!.yTitle).toBeUndefined();
    fireEvent.change(screen.getByRole('combobox', { name: 'Legend' }), {
      target: { value: 'none' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Palette' }), {
      target: { value: 'vivid' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Value Axis' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Data Labels' }));
    const alt = screen.getByRole('textbox', { name: 'Alt Text' });
    fireEvent.change(alt, { target: { value: 'Index by cost' } });
    fireEvent.blur(alt);
    expect(chartOf(h)).toMatchObject({
      legend: 'none',
      palette: 'vivid',
      axis: false,
      values: true,
      alt: 'Index by cost',
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Legend' }), {
      target: { value: 'bottom' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Palette' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Value Axis' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Data Labels' }));
    fireEvent.change(title, { target: { value: ' ' } });
    fireEvent.blur(title);
    const now = chartOf(h)!;
    expect([now.legend, now.palette, now.axis, now.values, now.title]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(screen.getByRole('group', { name: 'Series Colours' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Customise' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Setup' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says No data for a chart whose cells are gone', async () => {
    const { h, write } = await open();
    act(() => {
      const { range: _r, ...rest } = chartOf(h)!;
      write(rest);
    });
    expect(screen.getByText('No data')).toBeTruthy();
  });
});
