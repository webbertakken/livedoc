// SPARKLINE's chart: read from its data and options, drawn as shapes, and found for a cell (charts.md "Sparklines").
import { describe, expect, it } from 'vitest';
import { SPARKLINE_POINTS_MAX } from '../limits';
import { book } from '../testing/book';
import { renderWindow } from '../engine/render';
import { readSparkline, type Sparkline } from './sparkline-read';
import { SPARK_ACCENT, SPARK_MUTED, sparklineShapes, type SparkShape } from './sparkline-shapes';

const chart = (data: unknown[][], options: unknown[][] = []) =>
  readSparkline(data as never, options as never) as Sparkline;
const rects = (shapes: SparkShape[]) => shapes.filter((s) => s.k === 'rect');

describe('readSparkline', () => {
  it('reads values across rows, a line by default', () => {
    expect(
      chart([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    ).toEqual({ kind: 'line', values: [1, 2, 3, 4, 5, 6], options: {} });
  });

  it('skips empty cells and other values unless told otherwise (D71)', () => {
    expect(chart([[1, null, 'x', true, 2]]).values).toEqual([1, 2]);
    const zero = chart(
      [[1, null, 'x']],
      [
        ['empty', 'zero'],
        ['nan', 'convert'],
      ],
    );
    expect(zero.values).toEqual([1, 0, 0]);
  });

  it('reads option names in any case, numbers and booleans as written or as text', () => {
    const c = chart(
      [[1]],
      [
        ['CHARTTYPE', 'Column'],
        ['ymin', '2'],
        ['ymax', 9],
        ['axis', 'TRUE'],
        ['rtl', 1],
        ['color', ' #FF0000 '],
        ['negcolor', 'red'],
        ['lowcolor', 'url(x)'],
        ['highcolor', 3],
        ['linewidth', 'thick'],
        ['axiscolor'],
        [7, 'x'],
        ['unknown', 'x'],
      ],
    );
    expect(c.kind).toBe('column');
    expect(c.options).toEqual({
      ymin: 2,
      ymax: 9,
      axis: true,
      rtl: true,
      color: '#FF0000',
      negcolor: 'red',
    });
    expect(
      chart(
        [[1]],
        [
          ['axis', 'yes'],
          ['rtl', false],
        ],
      ).options,
    ).toEqual({ rtl: false });
  });

  it('reads two columns as x then y for a line, keeping xmin to xmax', () => {
    const c = chart(
      [
        [1, 10],
        [2, 20],
        [3, 30],
        [null, 40],
      ],
      [
        ['xmin', 2],
        ['xmax', 3],
      ],
    );
    expect(c).toMatchObject({ values: [20, 30], xs: [2, 3] });
    expect(
      chart(
        [
          [1, 10],
          [5, 20],
        ],
        [['xmax', 2]],
      ).values,
    ).toEqual([10]);
    expect(
      chart(
        [
          [1, 10],
          [2, 20],
        ],
        [['charttype', 'column']],
      ).values,
    ).toEqual([1, 10, 2, 20]);
  });

  it('gives an error in the data or options, or an unknown chart type, as its value', () => {
    expect(readSparkline([[1, { e: '#DIV/0!' }]], [])).toEqual({ e: '#DIV/0!' });
    expect(readSparkline([[1]], [['color', { e: '#N/A' }]])).toEqual({ e: '#N/A' });
    expect(readSparkline([[1]], [['charttype', 'pie']])).toMatchObject({ e: '#VALUE!' });
    expect(readSparkline([[1]], [['charttype', null]])).toMatchObject({ kind: 'line' });
    expect(readSparkline([[1]], [['charttype', 3]])).toMatchObject({ e: '#VALUE!' });
    expect(readSparkline([[null]], [['empty', true]])).toMatchObject({ values: [] });
  });

  it('draws at most SPARKLINE_POINTS_MAX values, the first ones', () => {
    const many = [Array.from({ length: SPARKLINE_POINTS_MAX + 5 }, (_, i) => i)];
    const c = chart(many);
    expect(c.values).toHaveLength(SPARKLINE_POINTS_MAX);
    expect(c.values[0]).toBe(0);
  });
});

describe('sparklineShapes', () => {
  it('draws a line through the room, in the cell ink or the accent, scaled to the data', () => {
    const [path] = sparklineShapes(chart([[0, 10, 5]]), 104, 24);
    expect(path).toEqual({ k: 'path', d: 'M2 22L52 2L102 12', paint: SPARK_ACCENT, width: 1 });
    expect(sparklineShapes(chart([[0, 1]]), 104, 24, '#123')[0]).toMatchObject({ paint: '#123' });
    const set = chart(
      [[0, 1]],
      [
        ['color', 'red'],
        ['linewidth', 3],
      ],
    );
    expect(sparklineShapes(set, 104, 24, '#123')[0]).toMatchObject({ paint: 'red', width: 3 });
  });

  it('clips a line to ymin and ymax, mirrors it right to left, and centres a flat or single line', () => {
    const clipped = chart(
      [[0, 20]],
      [
        ['ymin', 5],
        ['ymax', 10],
        ['rtl', true],
      ],
    );
    expect(sparklineShapes(clipped, 104, 24)[0]).toMatchObject({ d: 'M102 22L2 2' });
    expect(sparklineShapes(chart([[3, 3]]), 104, 24)[0]).toMatchObject({ d: 'M2 12L102 12' });
    expect(sparklineShapes(chart([[3]]), 104, 24)[0]).toMatchObject({ d: 'M52 12h0.1' });
  });

  it('places a paired line by its x values', () => {
    const c = chart([
      [0, 1],
      [3, 2],
      [4, 3],
    ]);
    expect(sparklineShapes(c, 104, 24)[0]).toMatchObject({ d: 'M2 22L77 12L102 2' });
  });

  it('draws columns up from 0, down for negatives, with the axis when asked', () => {
    const c = chart(
      [[2, -2]],
      [
        ['charttype', 'column'],
        ['axis', true],
      ],
    );
    const shapes = sparklineShapes(c, 104, 24);
    expect(rects(shapes)).toEqual([
      { k: 'rect', x: 7, y: 2, w: 40, h: 10, paint: SPARK_ACCENT },
      { k: 'rect', x: 57, y: 12, w: 40, h: 10, paint: SPARK_ACCENT },
    ]);
    expect(shapes[2]).toEqual({ k: 'path', d: 'M2 12H102', paint: SPARK_MUTED, width: 1 });
    const red = chart(
      [[1]],
      [
        ['charttype', 'column'],
        ['axis', true],
        ['axiscolor', 'red'],
      ],
    );
    expect(sparklineShapes(red, 104, 24).at(-1)).toMatchObject({ paint: 'red' });
  });

  it('skips a zero column and mirrors columns right to left', () => {
    const c = chart(
      [[0, 4]],
      [
        ['charttype', 'column'],
        ['rtl', true],
      ],
    );
    expect(rects(sparklineShapes(c, 104, 24))).toEqual([
      { k: 'rect', x: 7, y: 2, w: 40, h: 20, paint: SPARK_ACCENT },
    ]);
  });

  it('paints columns in the help order, the later rule winning (D71)', () => {
    const c = chart(
      [[-1, 5, 3, 1]],
      [
        ['charttype', 'column'],
        ['color', 'gray'],
        ['negcolor', 'red'],
        ['lowcolor', 'blue'],
        ['highcolor', 'green'],
        ['lastcolor', 'black'],
      ],
    );
    expect(rects(sparklineShapes(c, 104, 24)).map((r) => r.paint)).toEqual([
      'blue',
      'green',
      'gray',
      'black',
    ]);
    const first = chart(
      [[1, 2]],
      [
        ['charttype', 'column'],
        ['firstcolor', 'pink'],
      ],
    );
    expect(rects(sparklineShapes(first, 104, 24))[0]!.paint).toBe('pink');
  });

  it('scales columns to ymin and ymax', () => {
    const c = chart(
      [[5, 10]],
      [
        ['charttype', 'column'],
        ['ymin', 5],
        ['ymax', 10],
      ],
    );
    expect(rects(sparklineShapes(c, 104, 24))).toEqual([
      { k: 'rect', x: 57, y: 2, w: 40, h: 20, paint: SPARK_ACCENT },
    ]);
  });

  it('draws win/loss at one height each way, nothing for 0', () => {
    const c = chart([[3, -9, 0]], [['charttype', 'winloss']]);
    const r = rects(sparklineShapes(c, 92, 24));
    expect(r.map((x) => [x.y, x.h])).toEqual([
      [2, 10],
      [12, 10],
    ]);
  });

  it('draws a bar of shares of max, in two colours by turns (each value its turn), negatives as 0', () => {
    const c = chart(
      [[1, 1, -3, 2]],
      [
        ['charttype', 'bar'],
        ['max', 8],
      ],
    );
    expect(rects(sparklineShapes(c, 84, 24))).toEqual([
      { k: 'rect', x: 2, y: 2, w: 10, h: 20, paint: SPARK_ACCENT },
      { k: 'rect', x: 12, y: 2, w: 10, h: 20, paint: SPARK_ACCENT, opacity: 0.5 },
      { k: 'rect', x: 22, y: 2, w: 20, h: 20, paint: SPARK_ACCENT, opacity: 0.5 },
    ]);
    const set = chart(
      [[1, 1]],
      [
        ['charttype', 'bar'],
        ['color1', 'red'],
        ['color2', 'blue'],
        ['rtl', true],
      ],
    );
    expect(rects(sparklineShapes(set, 84, 24))).toEqual([
      { k: 'rect', x: 42, y: 2, w: 40, h: 20, paint: 'red' },
      { k: 'rect', x: 2, y: 2, w: 40, h: 20, paint: 'blue' },
    ]);
  });

  it('fills a bar to its sum by default, stops at max, and draws nothing of no total', () => {
    const over = chart(
      [[6, 6]],
      [
        ['charttype', 'bar'],
        ['max', 8],
      ],
    );
    expect(rects(sparklineShapes(over, 84, 24)).map((r) => r.w)).toEqual([60, 20]);
    expect(sparklineShapes(chart([[0, -1]], [['charttype', 'bar']]), 84, 24)).toEqual([]);
    expect(
      rects(sparklineShapes(chart([[1, 3]], [['charttype', 'bar']]), 84, 24)).map((r) => r.w),
    ).toEqual([20, 60]);
  });

  it('draws no columns for values all 0', () => {
    expect(sparklineShapes(chart([[0, 0]], [['charttype', 'column']]), 104, 24)).toEqual([]);
  });

  it('draws nothing without values or room', () => {
    expect(sparklineShapes(chart([[]]), 104, 24)).toEqual([]);
    expect(sparklineShapes(chart([[1, 2]]), 4, 24)).toEqual([]);
    expect(sparklineShapes(chart([[1, 2]]), 104, 3)).toEqual([]);
  });
});

describe('SPARKLINE in a sheet', () => {
  const at = (b: ReturnType<typeof book>, a1: string) => {
    const sheet = b.sheets[0]!;
    return b.wb.sparklineOf(sheet.id, Number(a1.slice(1)) - 1, a1.charCodeAt(0) - 65);
  };

  it('is empty text with its chart beside it', () => {
    const b = book({ A1: '1', B1: '3', C1: '=sparkline(A1:B1, {"charttype","column"})' });
    expect(b.v('C1')).toBe('');
    expect(at(b, 'C1')).toEqual({ kind: 'column', values: [1, 3], options: {} });
  });

  it('draws through IF only where IF takes it, and follows a change', () => {
    const b = book({
      A1: '1',
      B1: '=IF(A1>0, SPARKLINE({1,2}), "")',
      B2: '=IF(A1>5, SPARKLINE({1,2}), "")',
    });
    expect(at(b, 'B1')).toMatchObject({ values: [1, 2] });
    expect(at(b, 'B2')).toBeNull();
    b.set('A1', '9');
    expect(at(b, 'B2')).toMatchObject({ values: [1, 2] });
  });

  it('has no chart when the value is not its empty text, or for any other cell', () => {
    const b = book({
      A1: '=SPARKLINE({1})&"x"',
      A2: '=1+1',
      A3: '5',
      B1: '=SPARKLINE({1}, {"charttype","pie"})',
    });
    expect(at(b, 'A1')).toBeNull();
    expect(at(b, 'A2')).toBeNull();
    expect(at(b, 'A3')).toBeNull();
    expect(at(b, 'A4')).toBeNull();
    expect(b.v('B1')).toMatchObject({ e: '#VALUE!' });
    expect(at(b, 'B1')).toBeNull();
  });

  it('keeps a chart once worked out until the workbook changes', () => {
    const b = book({ A1: '=SPARKLINE({1,2})' });
    expect(at(b, 'A1')).toBe(at(b, 'A1'));
  });
});

describe('a SPARKLINE in a rendered window', () => {
  it('carries its shapes sized to the cell, merged cells summed, and keeps the cell even without text', () => {
    const b = book({ A1: '=SPARKLINE({1,3}, {"charttype","bar"})', A2: '=SPARKLINE({"x"})' });
    const s = b.sheets[0]!;
    const { rows, cols } = s.layout;
    b.wb.updateSheet({
      ...s,
      layout: { ...s.layout, merges: [{ r1: rows[0]!, c1: cols[0]!, r2: rows[0]!, c2: cols[1]! }] },
    });
    const sheet = s;
    const model = renderWindow(b.wb, sheet.id, { width: 600, height: 200 }, 'en-GB')!;
    const a1 = model.cells.find((c) => c.r === 0 && c.c === 0)!;
    const width = model.colWidths[0]! + model.colWidths[1]!;
    expect(a1.spark?.at(-1)).toMatchObject({ k: 'rect', x: round(2 + ((width - 4) * 1) / 4) });
    expect(model.cells.some((c) => c.r === 1 && c.c === 0)).toBe(false);
  });
});

const round = (n: number) => Math.round(n * 10) / 10;
