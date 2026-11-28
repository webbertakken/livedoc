// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Line numbers" (Drawn): a numbered block's lines from its drawn top, moved
// down by a page gap inside it, in its column; a box of columns read from its text, column by column.
import { afterEach, describe, expect, it } from 'vitest';
import type { BlockMetrics } from '@livedoc/text-documents';
import { readDrawnLines, type LineReading } from './pagination-line-reading';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

const at = (element: HTMLElement, box: DOMRect) => {
  element.getBoundingClientRect = () => box;
  return element;
};

const para = (lines: number): BlockMetrics => ({
  height: lines * 20,
  marginTop: 0,
  marginBottom: 0,
  lines: Array.from({ length: lines }, (_, i) => ({ top: i * 20, bottom: (i + 1) * 20 })),
});

afterEach(() => {
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
});

const reading = (over: Partial<LineReading>): LineReading => ({
  // The body 100 px down the window, drawn at 200% zoom.
  body: at(document.createElement('div'), rect(10, 100, 800, 2000)),
  ratio: 2,
  metrics: [],
  element: () => document.createElement('p'),
  numbered: () => true,
  gapsInside: new Map(),
  columnOf: new Map(),
  crosses: new Map(),
  pageTops: [0, 500],
  ...over,
});

describe('readDrawnLines', () => {
  it('reads each line from its block’s drawn top, below a page gap inside it moved down by the gap', () => {
    const blocks = [at(document.createElement('p'), rect(10, 140, 100, 80))];
    expect(
      readDrawnLines(
        reading({
          metrics: [para(3)],
          element: (b) => blocks[b]!,
          gapsInside: new Map([[0, [{ line: 2, gap: 100 }]]]),
          columnOf: new Map([[0, 1]]),
        }),
      ),
    ).toEqual([
      { block: 0, column: 1, top: 20, bottom: 40 },
      { block: 0, column: 1, top: 40, bottom: 60 },
      { block: 0, column: 1, top: 160, bottom: 180 },
    ]);
  });

  it('leaves out blocks not numbered and those that move whole', () => {
    expect(
      readDrawnLines(
        reading({
          metrics: [para(1), { ...para(1), atom: true }],
          numbered: (b) => b === 1,
        }),
      ),
    ).toEqual([]);
  });

  it('reads a box of columns from its text, column by column, page by page', () => {
    const box = document.createElement('p');
    box.append('first column', 'second column');
    // Client pixels at 200%: columns 0 and 1 are 300 px apart in the body (600 client px).
    const stretches = [rect(10, 100, 200, 40), rect(10, 140, 200, 40), rect(610, 100, 200, 40)];
    // The first text node draws two stretches, the second one.
    const calls = [stretches.slice(0, 2), stretches.slice(2)];
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => calls.shift() ?? [],
    });
    const lines = readDrawnLines(
      reading({
        metrics: [para(3)],
        element: () => box,
        crosses: new Map([[0, { shift: 0, step: 300, count: 2 }]]),
      }),
    );
    expect(lines.map((l) => [l.column, l.top, l.bottom])).toEqual([
      [0, 0, 20],
      [0, 20, 40],
      [1, 0, 20],
    ]);
  });
});
