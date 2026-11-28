// docs/specs/029-sheets/review.md "In the grid", D653: the comments panel's rows, by sheet then reading order, a
// deleted cell's last, each labelled by its sheet and range and grouped by its sheet.
import { describe, expect, it } from 'vitest';
import type { SheetThread } from '@livedoc/document';
import { CELL_DELETED, sheetCommentRows, sheetGroups } from './sheet-comment-rows';

const sheets = [
  { id: 's1', title: 'Budget', layout: { rows: ['r0', 'r1', 'r2'], cols: ['c0', 'c1'] } },
  { id: 's2', title: 'Notes', layout: { rows: ['q0'], cols: ['d0'] } },
];
const priya = { userId: 'u-p', name: 'Priya', handle: 'priya' };
const thread = (
  id: string,
  sheetId: string,
  r1: string,
  c1: string,
  r2 = r1,
  c2 = c1,
): SheetThread => ({
  id,
  sheetId,
  anchor: { r1, c1, r2, c2 },
  resolved: false,
  comments: [{ id: `${id}c`, text: id, at: 1, author: { key: 'k', name: 'Ada', colour: '#000' } }],
  v: 1,
});

describe('sheetCommentRows', () => {
  it('lists by sheet, then rows and columns, a deleted cell’s last, labelled by sheet and range', () => {
    const rows = sheetCommentRows(
      [
        thread('late', 's2', 'q0', 'd0'),
        thread('gone', 's1', 'rX', 'c0'),
        thread('b', 's1', 'r1', 'c0', 'r2', 'c1'),
        thread('a', 's1', 'r0', 'c1'),
        thread('stray', 'sX', 'r0', 'c0'),
        {
          ...thread('c', 's1', 'r1', 'c1'),
          resolved: true,
          comments: [{ ...thread('c', 's1', 'r1', 'c1').comments[0]!, assignee: priya }],
        },
      ],
      sheets,
    );
    expect(rows.map((r) => [r.id, r.label, r.deleted, r.group])).toEqual([
      ['a', 'Budget!B1', false, 's1'],
      ['b', 'Budget!A2:B3', false, 's1'],
      ['c', 'Budget!B2', false, 's1'],
      ['gone', 'Budget (deleted cell)', true, 's1'],
      ['late', 'Notes!A1', false, 's2'],
    ]);
    expect(rows[2]).toMatchObject({ resolved: true, assignee: priya });
    expect(rows[0]!.comments[0]).toMatchObject({ text: 'a', authorId: 'k' });
    expect(CELL_DELETED).toMatch(/deleted/);
  });

  it('names each sheet by its title', () => {
    expect(sheetGroups(sheets)).toEqual([
      { id: 's1', label: 'Budget' },
      { id: 's2', label: 'Notes' },
    ]);
  });
});
