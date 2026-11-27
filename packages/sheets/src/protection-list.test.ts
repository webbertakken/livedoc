// docs/specs/029-sheets/data-tools.md "Protected ranges": the panel's list in sheet order then place, each by its
// description else where it stands; and the writes an edit makes as one change.
import { describe, expect, it } from 'vitest';
import { emptyLayout, type IdRange } from './sheet';
import {
  PERMISSION_SHORT,
  protectionRemoval,
  protectionWrites,
  workbookProtections,
} from './protection-list';
import type { Protection } from './protection';

let n = 3;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const one = emptyLayout(rand, 6, 4);
const two = emptyLayout(rand, 6, 4);
const at = (l: typeof one, r1: number, c1: number, r2: number, c2: number): IdRange => ({
  r1: l.rows[r1]!,
  c1: l.cols[c1]!,
  r2: l.rows[r2]!,
  c2: l.cols[c2]!,
});

describe('workbookProtections', () => {
  it('lists each sheet’s, its whole-sheet one first, then by place, labelled by description else where', () => {
    const late: Protection = { id: 'pa', range: at(one, 3, 0, 4, 1), can: 'owner' };
    const early: Protection = {
      id: 'pb',
      range: at(one, 0, 2, 0, 2),
      can: 'warn',
      description: 'Rates',
    };
    const whole: Protection = { id: 'pc', can: 'editors' };
    const other: Protection = { id: 'pd', range: at(two, 1, 1, 2, 2), can: 'editors' };
    const gone: Protection = {
      id: 'pe',
      range: { ...at(two, 0, 0, 0, 0), r1: 'nowhere' },
      can: 'warn',
    };
    const listed = workbookProtections(
      [
        { id: 's1', title: 'Budget', layout: { ...one, protections: [late, early, whole] } },
        { id: 's2', title: 'My data', layout: { ...two, protections: [other, gone] } },
        { id: 's3', title: 'Empty', layout: two },
      ],
      's1',
    );
    expect(listed.map((x) => [x.protection.id, x.where, x.label])).toEqual([
      ['pc', 'Budget', 'Budget'],
      ['pb', 'C1', 'Rates'],
      ['pa', 'A4:B5', 'A4:B5'],
      ['pd', "'My data'!B2:C3", "'My data'!B2:C3"],
    ]);
    expect(PERMISSION_SHORT.owner).toBe('Owner');
  });
});

describe('protectionWrites', () => {
  const p: Protection = { id: 'pa', can: 'warn' };
  it('sets a new or changed protection on its sheet, and moves one between sheets as one change', () => {
    const put = { kind: 'layout', changes: [{ k: 'protection', id: 'pa', protection: p }] };
    expect(protectionWrites({ sheetId: 's1', protection: p })).toEqual([
      { sheetId: 's1', write: put },
    ]);
    expect(
      protectionWrites({ was: { sheetId: 's1', id: 'pa' }, sheetId: 's1', protection: p }),
    ).toEqual([{ sheetId: 's1', write: put }]);
    expect(
      protectionWrites({ was: { sheetId: 's2', id: 'pa' }, sheetId: 's1', protection: p }),
    ).toEqual([
      { sheetId: 's2', write: protectionRemoval('s2', 'pa').write },
      { sheetId: 's1', write: put },
    ]);
  });
});
