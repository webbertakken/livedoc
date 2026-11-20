// docs/specs/034-text-documents/text-and-paragraphs.md "Tab stops": the list's rules and where a tab goes.
import { describe, expect, it } from 'vitest';
import { TAB_STOP_MAX_PT, TAB_STOPS_MAX, TabStops, type TabStop } from './tab-stops';

const left = (position: number): TabStop => ({ position, align: 'start' });

describe('TabStops.normalise', () => {
  it('sorts, keeps one stop per position, drops those out of range and past the most', () => {
    const many = Array.from({ length: TAB_STOPS_MAX + 2 }, (_, i) => left(i + 1));
    expect(TabStops.normalise(many)).toEqual({ stops: many.slice(0, TAB_STOPS_MAX), dropped: 2 });
    expect(
      TabStops.normalise([
        left(72),
        left(36),
        { position: 36.001, align: 'end' },
        left(TAB_STOP_MAX_PT + 1),
        left(Number.NaN),
      ]),
    ).toEqual({ stops: [left(36), left(72)], dropped: 3 });
  });
});

describe('TabStops.merge and difference', () => {
  const inherited = [left(36), { position: 216, align: 'center' } as TabStop];

  it('takes the cleared stops away and sets its own over the inherited, as Word reads `w:tabs`', () => {
    expect(
      TabStops.merge(inherited, {
        clears: [36],
        sets: [{ position: 216, align: 'end' }, left(100)],
      }),
    ).toEqual([left(100), { position: 216, align: 'end' }]);
  });

  it('writes the least that reads back as the own list', () => {
    const own: TabStop[] = [left(36), { position: 300, align: 'decimal', char: ',' }];
    const entries = TabStops.difference(inherited, own);
    expect(entries).toEqual({ clears: [216], sets: [own[1]] });
    expect(TabStops.merge(inherited, entries)).toEqual(own);
    expect(TabStops.difference(inherited, [])).toEqual({ clears: [36, 216], sets: [] });
  });
});

describe('TabStops.equal and shift', () => {
  it('compares stops by position, alignment, leader and decimal character', () => {
    expect(TabStops.equal([left(36)], [{ position: 36.0001, align: 'start' }])).toBe(true);
    expect(TabStops.equal([left(36)], [{ ...left(36), leader: 'dot' }])).toBe(false);
    expect(
      TabStops.equal(
        [{ position: 1, align: 'decimal' }],
        [{ position: 1, align: 'decimal', char: '.' }],
      ),
    ).toBe(true);
    expect(TabStops.equal(undefined, [])).toBe(false);
    expect(TabStops.equal([left(1)], [left(1), left(2)])).toBe(false);
  });

  it('moves every stop', () => {
    expect(TabStops.shift([left(36), left(1.0004)], 10)).toEqual([left(46), left(11)]);
  });
});

describe('TabStops.next', () => {
  it('goes to the first stop past where the tab starts, passing one exactly there', () => {
    const stops = [left(72), { position: 200, align: 'end' } as TabStop];
    expect(TabStops.next(stops, 10)).toEqual(left(72));
    expect(TabStops.next(stops, 72)).toEqual(stops[1]);
  });

  it('goes to the default stops past the last, every half inch or the document interval', () => {
    expect(TabStops.next([left(50)], 60)).toEqual(left(72));
    expect(TabStops.next([], 0)).toEqual(left(36));
    expect(TabStops.next([], 36)).toEqual(left(72));
    expect(TabStops.next([], 10, { interval: 28.35 })).toEqual(left(28.35));
    expect(TabStops.next([], 10, { interval: 0 })).toEqual(left(36));
  });

  it('goes to a hanging indent before any later stop', () => {
    expect(TabStops.next([left(100)], 0, { hanging: 36 })).toEqual(left(36));
    expect(TabStops.next([left(20)], 0, { hanging: 36 })).toEqual(left(20));
    expect(TabStops.next([], 40, { hanging: 36 })).toEqual(left(72));
  });
});

describe('TabStops.width', () => {
  it('gives the room to the stop, less the text after it by its alignment, never below 0', () => {
    expect(TabStops.width(left(72), 22, 30)).toBe(50);
    expect(TabStops.width({ position: 72, align: 'center' }, 22, 30)).toBe(35);
    expect(TabStops.width({ position: 72, align: 'end' }, 22, 30)).toBe(20);
    expect(TabStops.width({ position: 72, align: 'decimal' }, 22, 12)).toBe(38);
    expect(TabStops.width({ position: 72, align: 'end' }, 60, 30)).toBe(0);
  });
});
