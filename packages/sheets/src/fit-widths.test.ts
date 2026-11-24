import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { cellKey } from './sheet';
import { fitColumnsWrite, fittedWidths, FIT_MAX_PX, FIT_MIN_PX } from './fit-widths';
import { textWidth } from './text/text-measure';

// docs/specs/029-sheets/sheet-store.md "Shaping a sheet": columns fitted to what their cells show.
describe('fittedWidths', () => {
  it('fits each column to its widest shown value, within bounds, skipping empty columns', () => {
    const b = book({ A1: 'Deal', A2: 'Enterprise renewal', B1: '7', D1: 'x'.repeat(200) });
    const s = b.sheets[0]!;
    const w = fittedWidths(b.wb, s.id, [0, 1, 2, 3]);
    expect(w.get(0)).toBe(Math.round(18 * (40 / 3) * 0.56 + 18));
    expect(w.get(1)).toBe(FIT_MIN_PX);
    expect(w.has(2)).toBe(false);
    expect(w.get(3)).toBe(FIT_MAX_PX);
  });

  it('measures the shown value, bold and its size, and leaves a cell merged across columns out', () => {
    const b = book({ A1: 'A long title over the whole table', A2: '1234.5', B2: 'Total' });
    const s = b.sheets[0]!;
    const { rows, cols } = s.layout;
    s.cells.set(cellKey(rows[1]!, cols[0]!), {
      ...s.cells.get(cellKey(rows[1]!, cols[0]!))!,
      format: { nf: 'currency', dp: 2, cur: '£' },
    });
    s.cells.set(cellKey(rows[1]!, cols[1]!), {
      ...s.cells.get(cellKey(rows[1]!, cols[1]!))!,
      format: { b: true, fs: 18 },
    });
    const merged = {
      ...s,
      layout: { ...s.layout, merges: [{ r1: rows[0]!, c1: cols[0]!, r2: rows[0]!, c2: cols[3]! }] },
    };
    b.wb.updateSheet(merged);
    const w = fittedWidths(b.wb, s.id, [0, 1]);
    // "£1,234.50" in Inter's tabular figures (the £ measured as a figure), wider than nine characters at 0.56 em.
    expect(w.get(0)).toBe(Math.round(textWidth('£1,234.50', 40 / 3, { tabular: true }) + 18));
    expect(w.get(0)).toBeGreaterThan(Math.round(9 * (40 / 3) * 0.56 + 18));
    expect(w.get(1)).toBe(Math.round(5 * 24 * 0.56 * 1.08 + 18));
  });

  // sheet.md "The grid": Fit to Data leaves a column room for its numbers' digits as drawn, in tabular figures.
  it('leaves a number room for its tabular figures', () => {
    const b = book({ A1: '8888888888', B1: 'Deal' });
    const s = b.sheets[0]!;
    const w = fittedWidths(b.wb, s.id, [0, 1]);
    // Ten of Inter's tabular figures, 0.65 em each at 13.33 px, past ten characters at 0.56 em.
    expect(w.get(0)).toBe(Math.round(10 * 0.65 * (40 / 3) + 18));
    // Text keeps the estimate it had.
    expect(w.get(1)).toBe(FIT_MIN_PX);
  });

  it('leaves room for a dropdown chip', () => {
    const b = book({ A1: 'Won' });
    const s = b.sheets[0]!;
    const { rows, cols } = s.layout;
    b.wb.updateSheet({
      ...s,
      layout: {
        ...s.layout,
        rules: [
          {
            id: 'v',
            r1: rows[0]!,
            c1: cols[0]!,
            r2: rows[5]!,
            c2: cols[0]!,
            is: 'list',
            opts: [{ v: 'Won' }],
          },
        ],
      },
    });
    expect(fittedWidths(b.wb, s.id, [0]).get(0)).toBe(Math.round(3 * (40 / 3) * 0.56 + 18 + 48));
    expect(fittedWidths(b.wb, s.id, [0], () => true).size).toBe(0);
  });

  it('is nothing for a sheet the workbook lacks', () => {
    const b = book({ A1: 'x' });
    expect(fittedWidths(b.wb, 'gone', [0]).size).toBe(0);
    expect(fitColumnsWrite(b.wb, 'gone', [0])).toBeNull();
  });
});

describe('fitColumnsWrite', () => {
  it('sets columns of one width together, and is null when none holds a value', () => {
    const b = book({ A1: 'ab', B1: 'cd', C1: 'A much longer value' });
    const s = b.sheets[0]!;
    const write = fitColumnsWrite(b.wb, s.id, [0, 1, 2]) as {
      changes: { ids: string[]; px: number }[];
    };
    expect(write.changes.map((ch) => ch.ids.length)).toEqual([2, 1]);
    expect(fitColumnsWrite(b.wb, s.id, [5])).toBeNull();
  });
});
