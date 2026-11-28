// pivot-tables.md "Details" (Webber's ruling 2026-11-28): a Participant's or a Viewer's details as a table, cut at
// 1,000 rows with a line saying so.
import { describe, expect, it } from 'vitest';
import { pivotDetailsCut, PIVOT_DETAILS_SHOWN } from './pivot-details-table';

describe('pivotDetailsCut', () => {
  it('says nothing when every row is drawn', () => {
    expect(pivotDetailsCut({ header: ['A'], rows: [['1']], total: 1 })).toBeNull();
  });

  it('says how many rows were drawn of how many', () => {
    const rows = Array.from({ length: PIVOT_DETAILS_SHOWN }, () => ['x']);
    expect(pivotDetailsCut({ header: ['A'], rows, total: 2500 })).toBe(
      'Showing the first 1,000 of 2,500 rows',
    );
  });
});
