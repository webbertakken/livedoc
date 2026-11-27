// Column Stats and Clean-up Suggestions (data-tools.md "Column Stats", "Clean-up Suggestions", D465, D466).
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite } from '../store';
import { bins, columnStats, statsBars } from './column-stats';
import { cleanUpSuggestions, suggestionRange } from './clean-up-suggestions';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };

describe('columnStats', () => {
  it('counts, sums and lists a column’s values below its ignored rows', () => {
    const b = book({ A1: 'n', A2: '3', A3: '1', A4: '3', A6: 'x', A7: '5', B9: 'end' });
    const s = columnStats(b.wb, b.sheets[0]!.id, 0, 1)!;
    expect([s.count, s.empty, s.unique]).toEqual([5, 3, 4]);
    expect(s.numbers).toEqual({ sum: 12, average: 3, median: 3, min: 1, max: 5 });
    expect(s.mostlyNumbers).toBe(true);
    expect(s.frequency).toEqual([
      { text: '3', count: 2 },
      { text: '1', count: 1 },
      { text: 'x', count: 1 },
      { text: '5', count: 1 },
    ]);
    expect(s.histogram).toHaveLength(10);
    expect(s.histogram!.reduce((n, x) => n + x.count, 0)).toBe(4);
  });

  it('reads text case aside, with no numbers and no histogram', () => {
    const b = book({ A1: 'Red', A2: 'red', A3: 'Blue', A4: '2' });
    const s = columnStats(b.wb, b.sheets[0]!.id, 0, 0)!;
    expect([s.unique, s.mostlyNumbers, s.histogram]).toEqual([3, false, null]);
    expect(s.frequency[0]).toEqual({ text: 'Red', count: 2 });
    expect(s.numbers).toMatchObject({ sum: 2, median: 2 });
    expect(columnStats(b.wb, b.sheets[0]!.id, 1, 0)).toMatchObject({ count: 0, numbers: null });
    expect(columnStats(b.wb, 'nope', 0, 0)).toBeNull();
    expect(columnStats(b.wb, b.sheets[0]!.id, 999, 0)).toBeNull();
  });

  it('bins numbers evenly, one bin when all are equal, none for none', () => {
    expect(bins([0, 10], 2)).toEqual([
      { from: 0, to: 5, count: 1 },
      { from: 5, to: 10, count: 1 },
    ]);
    expect(bins([4, 4])).toEqual([{ from: 4, to: 4, count: 2 }]);
    expect(bins([])).toEqual([]);
  });

  it('keeps the most frequent as bars and sums the rest as Other', () => {
    const f = Array.from({ length: 12 }, (_, i) => ({ text: `v${i}`, count: 12 - i }));
    const bars = statsBars(f);
    expect(bars).toHaveLength(10);
    expect(bars[9]).toEqual({ text: 'Other', count: 3 + 2 + 1 });
    expect(statsBars(f.slice(0, 3))).toHaveLength(3);
  });
});

describe('cleanUpSuggestions', () => {
  it('finds duplicates, extra spaces and numbers stored as text below the frozen rows', () => {
    const b = book({
      A1: 'Name',
      B1: 'n',
      A2: 'a',
      B2: '1',
      A3: 'a',
      B3: '1',
      A4: ' b ',
      B4: "'7",
      A5: 'c',
      B5: '9',
    });
    b.sheets[0]!.layout.frozenRows = 1;
    const id = b.sheets[0]!.id;
    expect(suggestionRange(b.wb, id)).toEqual({ r1: 1, c1: 0, r2: 4, c2: 1 });
    const found = cleanUpSuggestions(b.wb, id);
    expect(found.map((s) => [s.kind, s.count])).toEqual([
      ['duplicates', 1],
      ['spaces', 1],
      ['textNumbers', 1],
    ]);
    const fix = found[2]!;
    const r = applySheetWrite(b.sheets[0]!, fix.write, ctx);
    b.wb.updateSheet(r.sheet, r.touched);
    expect(b.wb.value(id, 3, 1)).toBe(7);
  });

  it('finds nothing on a clean or empty sheet', () => {
    const b = book({ A1: 'x', A2: 'y' });
    expect(cleanUpSuggestions(b.wb, b.sheets[0]!.id)).toEqual([]);
    const e = book({});
    expect(cleanUpSuggestions(e.wb, e.sheets[0]!.id)).toEqual([]);
    expect(suggestionRange(e.wb, 'nope')).toBeNull();
  });

  it('leaves a column of text alone, and text formatted as text', () => {
    const b = book({ A1: 'a', A2: 'b', A3: "'7" });
    expect(cleanUpSuggestions(b.wb, b.sheets[0]!.id)).toEqual([]);
  });
});
