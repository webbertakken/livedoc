// Page setup (docs/specs/034-text-documents/page-layout.md "Page setup"): Google's paper sizes, the paper a page has
// either way round, orientation, and a saved default read back checked.
import { describe, expect, it } from 'vitest';
import { Columns, PAGE_SIDE_MAX_PT, PAPER, PAPER_ORDER, PageSetup } from './sections';

const IN = 72;
const MM = 72 / 25.4;

describe('PAPER', () => {
  it('lists Google paper sizes in its order, portrait', () => {
    expect(PAPER_ORDER).toEqual([
      'letter',
      'tabloid',
      'legal',
      'statement',
      'executive',
      'folio',
      'a3',
      'a4',
      'a5',
      'b4',
      'b5',
    ]);
    for (const name of PAPER_ORDER) expect(PAPER[name].width).toBeLessThan(PAPER[name].height);
  });

  it('holds each size as Google gives it', () => {
    expect(PAPER.letter).toEqual({ width: 8.5 * IN, height: 11 * IN });
    expect(PAPER.tabloid).toEqual({ width: 11 * IN, height: 17 * IN });
    expect(PAPER.legal).toEqual({ width: 8.5 * IN, height: 14 * IN });
    expect(PAPER.statement).toEqual({ width: 5.5 * IN, height: 8.5 * IN });
    expect(PAPER.executive).toEqual({ width: 7.25 * IN, height: 10.5 * IN });
    expect(PAPER.folio).toEqual({ width: 8.5 * IN, height: 13 * IN });
    expect(PAPER.a3.width).toBeCloseTo(297 * MM, 2);
    expect(PAPER.a3.height).toBeCloseTo(420 * MM, 2);
    expect(PAPER.a4).toEqual({ width: 595.276, height: 841.89 });
    expect(PAPER.a5.width).toBeCloseTo(148 * MM, 2);
    expect(PAPER.b4.height).toBeCloseTo(353 * MM, 2);
    expect(PAPER.b5.width).toBeCloseTo(176 * MM, 2);
  });
});

describe('PageSetup.paperOf', () => {
  it('names the paper a page has, portrait or landscape', () => {
    expect(PageSetup.paperOf(PageSetup.of('a4'))).toBe('a4');
    expect(PageSetup.paperOf(PageSetup.oriented(PageSetup.of('legal'), 'landscape'))).toBe('legal');
  });

  it('reads a file rounding as the paper, within half a point', () => {
    expect(PageSetup.paperOf({ ...PageSetup.of('a4'), width: 595.3, height: 841.9 })).toBe('a4');
    expect(PageSetup.paperOf({ ...PageSetup.of('a4'), width: 596, height: 841.9 })).toBeNull();
  });

  it('names no paper for a size a file brings that is none of them', () => {
    expect(PageSetup.paperOf({ ...PageSetup.of('letter'), width: 400, height: 600 })).toBeNull();
  });
});

describe('PageSetup.oriented', () => {
  it('lays the longer side across for landscape and keeps the margins', () => {
    const setup = {
      ...PageSetup.of('letter'),
      margins: { top: 10, bottom: 20, left: 30, right: 40 },
    };
    const landscape = PageSetup.oriented(setup, 'landscape');
    expect(landscape).toEqual({ ...setup, width: 792, height: 612, orientation: 'landscape' });
    expect(PageSetup.oriented(landscape, 'portrait')).toEqual(setup);
  });

  it('reads a setup whose orientation contradicts its sides as its sides say', () => {
    const odd = { ...PageSetup.of('letter'), orientation: 'landscape' as const };
    expect(PageSetup.oriented(odd, 'portrait')).toEqual({ ...odd, orientation: 'portrait' });
    expect(PageSetup.oriented(odd, 'landscape')).toEqual({
      ...odd,
      width: 792,
      height: 612,
    });
  });
});

describe('PageSetup.withPaper', () => {
  it('takes the paper in the setup orientation, keeping margins and colour', () => {
    const setup = {
      ...PageSetup.oriented(PageSetup.of('letter'), 'landscape'),
      pageColor: '#fce5cd',
    };
    expect(PageSetup.withPaper(setup, 'a5')).toEqual({
      ...setup,
      width: PAPER.a5.height,
      height: PAPER.a5.width,
    });
  });
});

describe('PageSetup.equal', () => {
  it('compares sides, orientation, margins and colour', () => {
    const a = PageSetup.of('a4');
    expect(PageSetup.equal(a, { ...a, margins: { ...a.margins } })).toBe(true);
    expect(PageSetup.equal(a, { ...a, pageColor: '#000000' })).toBe(false);
    expect(PageSetup.equal(a, { ...a, margins: { ...a.margins, top: 1 } })).toBe(false);
    expect(PageSetup.equal(a, PageSetup.oriented(a, 'landscape'))).toBe(false);
  });
});

describe('PageSetup.parse', () => {
  it('reads back a setup it kept', () => {
    const setup = { ...PageSetup.of('a5'), pageColor: '#d9ead3' };
    expect(PageSetup.parse(JSON.parse(JSON.stringify(setup)))).toEqual(setup);
  });

  it('keeps only the sides, orientation, margins and colour', () => {
    const setup = PageSetup.of('a4');
    expect(PageSetup.parse({ ...setup, columns: { count: 2, gap: 36 }, extra: 1 })).toEqual(setup);
  });

  it.each([
    ['nothing', null],
    ['a string', 'a4'],
    ['a side past the largest page', { ...PageSetup.of('a4'), width: PAGE_SIDE_MAX_PT + 1 }],
    ['no height', { ...PageSetup.of('a4'), height: undefined }],
    ['an unknown orientation', { ...PageSetup.of('a4'), orientation: 'sideways' }],
    [
      'a negative margin',
      { ...PageSetup.of('a4'), margins: { top: -1, bottom: 0, left: 0, right: 0 } },
    ],
    [
      'margins with no room for text',
      { ...PageSetup.of('a4'), margins: { top: 0, bottom: 0, left: 300, right: 300 } },
    ],
    ['a colour that is not #rrggbb', { ...PageSetup.of('a4'), pageColor: 'red' }],
  ])('refuses %s', (_name, raw) => {
    expect(PageSetup.parse(raw)).toBeNull();
  });
});

describe('Columns (page-layout.md "Columns")', () => {
  const letter = PageSetup.of('letter');
  const two = { ...letter, columns: { count: 2, gap: 36 } };

  it('reads a section with none as one column with the 0.5 in gap', () => {
    expect(Columns.of(letter)).toEqual({ count: 1, gap: 36 });
    expect(Columns.of({ ...letter, columns: { count: 1, gap: 10 } })).toEqual({
      count: 1,
      gap: 36,
    });
    expect(Columns.of(two)).toEqual({ count: 2, gap: 36 });
  });

  it('shares the text width between the columns, less the gaps', () => {
    // Letter less 1 in each side: 6.5 in = 468 pt.
    expect(Columns.width(letter)).toBe(468);
    expect(Columns.width(two)).toBe((468 - 36) / 2);
    expect(Columns.width({ ...letter, columns: { count: 3, gap: 18 } })).toBe((468 - 36) / 3);
  });

  it('allows a gap up to what leaves each column 0.5 in wide', () => {
    expect(Columns.mostGap(letter, 2)).toBe(468 - 72);
    expect(Columns.mostGap(letter, 3)).toBe((468 - 108) / 2);
    expect(Columns.mostGap(letter, 1)).toBe(0);
  });

  it('compares count, gap and line, ignoring them on one column', () => {
    expect(Columns.equal({ count: 2, gap: 36 }, { count: 2, gap: 36 })).toBe(true);
    expect(Columns.equal({ count: 2, gap: 36 }, { count: 2, gap: 36, separator: true })).toBe(
      false,
    );
    expect(Columns.equal({ count: 2, gap: 36 }, { count: 2, gap: 20 })).toBe(false);
    expect(Columns.equal({ count: 1, gap: 36 }, { count: 1, gap: 20, separator: true })).toBe(true);
    expect(Columns.equal({ count: 1, gap: 36 }, { count: 3, gap: 36 })).toBe(false);
  });

  it('sets columns on a setup, one column as none', () => {
    expect(Columns.onto(letter, { count: 3, gap: 20 }).columns).toEqual({ count: 3, gap: 20 });
    expect('columns' in Columns.onto(two, { count: 1, gap: 36 })).toBe(false);
  });
});
