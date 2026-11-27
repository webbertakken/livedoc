// docs/specs/029-sheets/pivot-tables.md "Errors and limits": a source or an output past its cap shows #REF! with "This
// pivot table is too large", and a source past the recalculation's read budget its "too large" error. The caps are
// lowered here so the test stays small.
import { describe, expect, it, vi } from 'vitest';
import { book } from '../testing/book';
import { err } from '../formula/values';
import type { Sheet } from '../sheet';
import { PIVOT_TOO_LARGE } from './pivot-resolve';

vi.mock('./pivot-resolve', async (load) => ({
  ...(await load<typeof import('./pivot-resolve')>()),
  PIVOT_SOURCE_CELLS_MAX: 12,
  PIVOT_OUTPUT_CELLS_MAX: 5,
}));
vi.mock('../limits', async (load) => ({
  ...(await load<typeof import('../limits')>()),
  RECALC_READS_MAX: 10,
}));

function pivotOver(rows: number, cols: number, groups: number) {
  const data: Record<string, string> = { A1: 'Name', B1: 'Units', C1: 'More' };
  for (let r = 2; r <= rows; r++) Object.assign(data, { [`A${r}`]: `n${r}`, [`B${r}`]: String(r) });
  const b = book({ Report: {}, Data: data }, { rows: 12, cols: 4 });
  const [report, src] = b.sheets as [Sheet, Sheet];
  const next = {
    ...report,
    layout: {
      ...report.layout,
      objects: [
        {
          id: 'pivot01',
          kind: 'pivot' as const,
          at: { r: report.layout.rows[0]!, c: report.layout.cols[0]! },
          source: {
            r1: src.layout.rows[0]!,
            c1: src.layout.cols[0]!,
            r2: src.layout.rows[rows - 1]!,
            c2: src.layout.cols[cols - 1]!,
            s: src.id,
          },
          ...(groups ? { rows: [{ col: src.layout.cols[0]! }] } : {}),
        },
      ],
    },
  };
  b.sheets[0] = next;
  b.wb.updateSheet(next);
  return b.v('A1', 'Report');
}

describe('a pivot table past its limits', () => {
  it('shows #REF! for a source past its cells', () => {
    expect(pivotOver(5, 3, 1)).toEqual(err('#REF!', PIVOT_TOO_LARGE));
  });

  it('shows #REF! for an output past its cells', () => {
    expect(pivotOver(5, 1, 1)).toEqual(err('#REF!', PIVOT_TOO_LARGE));
  });

  it('shows the recalculation’s error past its read budget, and lands within it', () => {
    expect(pivotOver(6, 2, 0)).toEqual(
      err('#NUM!', 'This sheet is too large to recalculate at once'),
    );
    expect(pivotOver(3, 2, 1)).toBe('Name');
  });
});
