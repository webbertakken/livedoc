import { describe, expect, it } from 'vitest';
import { threadAnchorAt, threadPlaceLabel } from './thread-anchor';

// docs/specs/029-sheets/review.md "Where a thread lives" (D653): an anchor follows its ids.
const layout = { rows: ['ra', 'rb', 'rc'], cols: ['ca', 'cb', 'cc'] };
const range = { r1: 'ra', c1: 'ca', r2: 'rb', c2: 'cc' };

describe('threadAnchorAt', () => {
  it('stands on its range, its top-left cell when a corner goes, deleted with its top-left', () => {
    expect(threadAnchorAt(layout, range)).toEqual({ r1: 0, c1: 0, r2: 1, c2: 2 });
    expect(threadAnchorAt({ ...layout, rows: ['ra', 'rc'] }, range)).toEqual({
      r1: 0,
      c1: 0,
      r2: 0,
      c2: 0,
    });
    expect(threadAnchorAt({ ...layout, cols: ['cb', 'cc'] }, range)).toEqual({ deleted: true });
  });
});

describe('threadPlaceLabel', () => {
  it('names the place by sheet and range, a cell alone, and a deleted cell', () => {
    expect(threadPlaceLabel('Budget', layout, range)).toBe('Budget!A1:C2');
    expect(threadPlaceLabel('Budget', layout, { r1: 'rb', c1: 'cb', r2: 'rb', c2: 'cb' })).toBe(
      'Budget!B2',
    );
    expect(threadPlaceLabel('Budget', { ...layout, rows: ['rb'] }, range)).toBe(
      'Budget (deleted cell)',
    );
  });
});
