import { describe, expect, it } from 'vitest';
import {
  type OfficeVersion,
  VERSION_NO_COLOUR,
  versionDay,
  versionGroups,
  versionLabel,
} from './office-version-list';

// docs/specs/012-collaboration/review-surfaces.md "Version history": newest first, grouped by day (Today, Yesterday,
// then the date), a name over its time, editors with their colours, "Restored from …", Only show named versions.

const at = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  new Date(year, month - 1, day, hour, minute).getTime();
const now = at(11, 27, 9);
const ada = { key: 'k-ada', name: 'Ada', color: '#0284c7' };
const version = (
  over: Partial<OfficeVersion> & { id: string; takenAt: number },
): OfficeVersion => ({
  kind: 'automatic',
  name: null,
  restoredFrom: null,
  editors: [],
  ...over,
});

describe('versionDay', () => {
  it('says Today, Yesterday, the date, and the year when not this one', () => {
    expect(versionDay(at(11, 27, 0, 1), now)).toBe('Today');
    expect(versionDay(at(11, 26, 23, 59), now)).toBe('Yesterday');
    expect(versionDay(at(11, 3, 12), now)).toBe('3 November');
    expect(versionDay(at(12, 31, 12, 0, 2025), now)).toBe('31 December 2025');
    expect(versionDay(at(1, 1, 8), at(1, 2, 8))).toBe('Yesterday');
  });
});

describe('versionGroups', () => {
  const versions = [
    version({ id: 'a', takenAt: at(11, 26, 14, 5), editors: [ada] }),
    version({ id: 'b', takenAt: at(11, 27, 8, 30), kind: 'named', name: 'Draft', editors: [ada] }),
    version({
      id: 'c',
      takenAt: at(11, 27, 8, 45),
      restoredFrom: 'a',
      editors: [
        ada,
        { key: 'k-ada', name: 'Ada', color: '#0284c7' },
        { key: null, name: null, color: 'blue' },
      ],
    }),
    version({ id: 'd', takenAt: at(11, 20, 10), restoredFrom: 'gone' }),
    version({ id: 'e', takenAt: at(11, 27, 8, 50), restoredFrom: 'b' }),
  ];

  it('lists newest first, grouped by day, a name over its time', () => {
    const groups = versionGroups(versions, now, false);
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Today', ['e', 'c', 'b']],
      ['Yesterday', ['a']],
      ['20 November', ['d']],
    ]);
    const [today] = groups;
    expect(today!.rows[2]).toMatchObject({ title: 'Draft', time: '08:30', named: true });
    expect(today!.rows[1]).toMatchObject({ title: '08:45', time: null, named: false });
  });

  it('names each editor once, an unrecorded one as Someone in grey', () => {
    const c = versionGroups(versions, now, false)[0]!.rows[1]!;
    expect(c.editors).toEqual([
      { name: 'Ada', colour: '#0284c7' },
      { name: 'Someone', colour: VERSION_NO_COLOUR },
    ]);
  });

  it('says which version a restore brought back', () => {
    const rows = versionGroups(versions, now, false).flatMap((g) => g.rows);
    const by = (id: string) => rows.find((r) => r.id === id)!.restoredFrom;
    expect(by('c')).toBe('Restored from Yesterday, 14:05');
    expect(by('e')).toBe('Restored from Draft');
    expect(by('d')).toBe('Restored from an earlier version');
    expect(by('a')).toBeNull();
  });

  it('keeps the named versions alone when asked', () => {
    expect(versionGroups(versions, now, true)).toEqual([
      { label: 'Today', rows: [expect.objectContaining({ id: 'b' })] },
    ]);
    expect(versionGroups([], now, false)).toEqual([]);
  });

  it('labels a version by its name, else its day and time', () => {
    expect(versionLabel(versions[1]!, now)).toBe('Draft');
    expect(versionLabel(versions[3]!, now)).toBe('20 November, 10:00');
  });
});
