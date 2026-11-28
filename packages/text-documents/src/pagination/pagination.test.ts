// Laying the writing onto pages (docs/specs/034-text-documents/page-layout.md "Laying out").
import { describe, expect, it } from 'vitest';
import { pageCount, pageFrame, type BlockMetrics } from './pagination';
import { paginate } from './pagination-engine';

const LINE = 20;
// A text area five lines high: 50 px from one page's text foot to the next one's text top (19 + 12 + 19); a page and
// its gap 150 px.
const page = { width: 400, height: 138, top: 19, bottom: 19, left: 20, textHeight: 100 };
const frame = () => page;

const para = (lines: number, rules: Partial<BlockMetrics> = {}): BlockMetrics => ({
  height: lines * LINE,
  marginTop: 0,
  marginBottom: 0,
  lines: Array.from({ length: lines }, (_, i) => ({ top: i * LINE, bottom: (i + 1) * LINE })),
  ...rules,
});

const starts = (blocks: readonly BlockMetrics[]) =>
  paginate(blocks, frame).starts.map(({ block, line, gap, blank }) => [block, line, gap, blank]);

describe('pageFrame', () => {
  it('reads a setup as its height, margins and text area in CSS pixels', () => {
    const setup = {
      width: 612,
      height: 792,
      orientation: 'portrait' as const,
      margins: { top: 72, bottom: 36, left: 72, right: 72 },
    };
    expect(pageFrame(setup)).toEqual({
      width: 612 / 0.75,
      height: 792 / 0.75,
      top: 72 / 0.75,
      bottom: 36 / 0.75,
      left: 72 / 0.75,
      textHeight: (792 - 108) / 0.75,
    });
  });
});

describe('paginate', () => {
  it('keeps writing that fits on one page', () => {
    expect(starts([para(2), para(3)])).toEqual([[0, 0, 0, 0]]);
  });

  it('breaks a paragraph between two of its lines where the page fills (page-layout.md "A page fills")', () => {
    // 0-40, 40-80, then 80-120: its second line crosses the foot.
    expect(starts([para(2), para(2), para(2)])).toEqual([
      [0, 0, 0, 0],
      [2, 1, 50, 0],
    ]);
  });

  it('moves a lone first line on with its paragraph when it prevents single lines', () => {
    expect(starts([para(2), para(2), para(2, { widowControl: true })])).toEqual([
      [0, 0, 0, 0],
      [2, 0, 70, 0],
    ]);
  });

  it('never leaves a last line alone at the head of a page', () => {
    // Six lines: five fit, the sixth would be alone, so the fifth goes with it.
    expect(starts([para(6, { widowControl: true })])).toEqual([
      [0, 0, 0, 0],
      [0, 4, 70, 0],
    ]);
  });

  it('moves a paragraph that keeps its lines together whole', () => {
    expect(starts([para(3), para(3, { keepTogether: true })])).toEqual([
      [0, 0, 0, 0],
      [1, 0, 90, 0],
    ]);
  });

  it('moves a paragraph that keeps with the next on with it, and a run of them as one', () => {
    const heading = para(1, { keepWithNext: true });
    expect(starts([para(2), heading, heading, para(2, { keepTogether: true })])).toEqual([
      [0, 0, 0, 0],
      [1, 0, 110, 0],
    ]);
  });

  it('lets a keep rule give way when keeping it would leave a page empty', () => {
    const heading = para(1, { keepWithNext: true });
    // The run from the page's top is taller than the page.
    expect(starts([heading, heading, heading, para(3, { keepTogether: true })])).toEqual([
      [0, 0, 0, 0],
      [3, 0, 90, 0],
    ]);
    // A paragraph taller than the page breaks where the page fills.
    expect(starts([para(7, { keepTogether: true })])).toEqual([
      [0, 0, 0, 0],
      [0, 5, 50, 0],
    ]);
  });

  it('starts a page at a paragraph with a page break before, unless it is at a page top', () => {
    expect(
      starts([para(1, { breakBefore: true }), para(1), para(1, { breakBefore: true })]),
    ).toEqual([
      [0, 0, 0, 0],
      [2, 0, 110, 0],
    ]);
  });

  it('starts a page at a Word page break inside a paragraph, or after it when nothing follows', () => {
    // A page break after the second line: the third starts the next page whatever the rules.
    expect(starts([para(4, { forced: [2], widowControl: true })])).toEqual([
      [0, 0, 0, 0],
      [0, 2, 100 - 40 + 50, 0],
    ]);
    expect(starts([para(1, { breakAfter: true }), para(1)])).toEqual([
      [0, 0, 0, 0],
      [1, 0, 100 - 20 + 50, 0],
    ]);
  });

  it('keeps space before at the top of a page and lets space after fall in the margin', () => {
    const spaced = { ...para(2, { widowControl: true }), marginTop: 10, marginBottom: 30 };
    // 10-50, then max(30, 10) = 30 apart: 80-120 does not fit; the gap starts after the first's space after.
    expect(starts([spaced, spaced])).toEqual([
      [0, 0, 0, 0],
      [1, 0, 100 - 80 + 50, 0],
    ]);
    // On the new page the second starts 10 px down (10-50), so the third is again at 80-120 and moves on.
    expect(starts([spaced, spaced, spaced])[2]).toEqual([2, 0, 100 - 80 + 50, 0]);
  });

  it('starts a new page after a section break on the next page, and leaves a blank page for an odd page', () => {
    const atom = (startsSection: BlockMetrics['startsSection']): BlockMetrics => ({
      height: 10,
      marginTop: 0,
      marginBottom: 0,
      lines: [],
      atom: true,
      startsSection,
    });
    expect(starts([para(1), atom('continuous'), para(1)])).toEqual([[0, 0, 0, 0]]);
    expect(starts([para(1), atom('next-page'), para(1)])).toEqual([
      [0, 0, 0, 0],
      [2, 0, 120, 0],
    ]);
    // The next page would be page 2: an odd page start leaves it blank.
    const odd = paginate([para(1), atom('odd-page'), para(1)], frame);
    expect(odd.starts[1]).toEqual({ block: 2, line: 0, gap: 120 + 150, blank: 1 });
    expect(pageCount(odd)).toBe(3);
    // An even page start on page 2 needs none.
    expect(starts([para(1), atom('even-page'), para(1)])[1]).toEqual([2, 0, 120, 0]);
  });

  it('moves content kept from a file whole, and places it at a page top even when it is taller', () => {
    const kept: BlockMetrics = {
      height: 150,
      marginTop: 0,
      marginBottom: 0,
      lines: [],
      atom: true,
    };
    expect(starts([para(2), kept, para(1)])).toEqual([
      [0, 0, 0, 0],
      [1, 0, 110, 0],
      [2, 0, 50 - 50, 0],
    ]);
  });

  it('places at least one line on an empty page however tall it is', () => {
    const tall: BlockMetrics = {
      height: 260,
      marginTop: 0,
      marginBottom: 0,
      lines: [
        { top: 0, bottom: 130 },
        { top: 130, bottom: 260 },
      ],
    };
    expect(starts([tall])).toEqual([
      [0, 0, 0, 0],
      [0, 1, -30 + 50, 0],
    ]);
  });
});

describe('paginate, incrementally (page-layout.md "The layout is incremental")', () => {
  // A long document: paragraphs of 1 to 4 lines, some keeping with the next.
  const document = Array.from({ length: 120 }, (_, i) =>
    para((i % 4) + 1, { widowControl: i % 3 === 0, keepWithNext: i % 7 === 0 }),
  );

  it('lays out from the page before the change and settles where pages start as before', () => {
    const previous = paginate(document, frame);
    // One paragraph grows by a line and the next shrinks by one: later pages start as before.
    const changed = document.map((block, i) => (i === 60 ? para(2) : i === 61 ? para(1) : block));
    const full = paginate(changed, frame);
    const since = paginate(changed, frame, { previous, first: 60, last: 61, delta: 0 });
    expect(since.starts).toEqual(full.starts);
    expect(since.laidFrom).toBeGreaterThan(0);
    expect(since.settledAt).not.toBeNull();
    expect(since.settledAt! - since.laidFrom).toBeLessThan(4);
  });

  it('maps the tail through paragraphs added or removed', () => {
    const previous = paginate(document, frame);
    const added = [...document.slice(0, 30), para(2), para(1), ...document.slice(30)];
    const since = paginate(added, frame, { previous, first: 30, last: 31, delta: 2 });
    expect(since.starts).toEqual(paginate(added, frame).starts);
    const removed = [...document.slice(0, 30), ...document.slice(33)];
    const after = paginate(removed, frame, { previous, first: 30, last: 29, delta: -3 });
    expect(after.starts).toEqual(paginate(removed, frame).starts);
  });

  it('always equals laying out from the start, whatever changes', () => {
    // A fixed sequence of pseudo-random edits: a paragraph's lines and rules changed, added or removed.
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    let blocks = document;
    let previous = paginate(blocks, frame);
    for (let round = 0; round < 60; round++) {
      const at = next(blocks.length);
      const made = para(next(6) + 1, {
        widowControl: next(2) === 0,
        keepWithNext: next(4) === 0,
        keepTogether: next(5) === 0,
        breakBefore: next(9) === 0,
      });
      const kind = next(3);
      const changed =
        kind === 0
          ? blocks.map((block, i) => (i === at ? made : block))
          : kind === 1
            ? [...blocks.slice(0, at), made, ...blocks.slice(at)]
            : [...blocks.slice(0, at), ...blocks.slice(at + 1)];
      const change =
        kind === 0
          ? { previous, first: at, last: at, delta: 0 }
          : kind === 1
            ? { previous, first: at, last: at, delta: 1 }
            : { previous, first: at, last: at - 1, delta: -1 };
      const since = paginate(changed, frame, change);
      expect(since.starts).toEqual(paginate(changed, frame).starts);
      blocks = changed;
      previous = since;
    }
  });

  it('lays out to the end when nothing settles', () => {
    const previous = paginate(document, frame);
    const shifted = [para(3), ...document.slice(1)];
    const since = paginate(shifted, frame, { previous, first: 0, last: 0, delta: 0 });
    expect(since.starts).toEqual(paginate(shifted, frame).starts);
  });
});

describe('paginate, by section (page-layout.md "Each page is drawn at its section\'s setup")', () => {
  // A second section on a shorter page: three lines high, margins 10 px.
  const short = { width: 400, height: 80, top: 10, bottom: 10, left: 20, textHeight: 60 };
  const sectionAt = 2;
  const frameOf = (block: number) => (block >= sectionAt ? short : page);

  it('fills each page by the setup of the section its first line is in', () => {
    const atom: BlockMetrics = {
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      lines: [],
      atom: true,
      startsSection: 'next-page',
    };
    const laid = paginate([para(1), atom, para(5)], frameOf).starts;
    // From the first page's foot (19) and gap to the short page's top margin (10); then three lines a page.
    expect(laid.map(({ block, line, gap }) => [block, line, gap])).toEqual([
      [0, 0, 0],
      [2, 0, 100 - 20 + 19 + 12 + 10],
      [2, 3, 60 - 60 + 10 + 12 + 10],
    ]);
  });

  it('gives a blank page the height of the section after it', () => {
    const atom: BlockMetrics = {
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      lines: [],
      atom: true,
      startsSection: 'odd-page',
    };
    const laid = paginate([para(1), atom, para(1)], frameOf).starts;
    expect(laid[1]).toEqual({
      block: 2,
      line: 0,
      gap: 100 - 20 + 19 + 12 + 10 + 80 + 12,
      blank: 1,
    });
  });
});

describe('paginate, in columns (page-layout.md "Columns")', () => {
  // Two columns on the five-line page; one more section after it on the same page.
  const columns = { count: 2, width: 190, gap: 20 };
  const twoColumns = { ...page, columns };
  const frameIn =
    (from: number, to = Number.POSITIVE_INFINITY) =>
    (block: number) =>
      block >= from && block <= to ? twoColumns : page;
  const continuous: BlockMetrics = {
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    lines: [],
    atom: true,
    startsSection: 'continuous',
  };

  it('fills the first column down the page, then the next from the top, then the next page', () => {
    const laid = paginate([para(3), para(3), para(3), para(3)], () => twoColumns);
    // 0-60 and 60-100 in column one (the second splits after two lines), its third line tops column two.
    expect(laid.starts[0]!.columns).toEqual([{ block: 1, line: 2, column: 1 }]);
    // Column two: line 3 of the second (0-20), the third (20-80); the fourth would cross onto the next page, which
    // the browser cannot draw here, so it moves there whole.
    expect(laid.starts[1]).toMatchObject({ block: 3, line: 0 });
    expect(laid.starts[1]!.carried).toBeUndefined();
    expect(laid.starts).toHaveLength(2);
  });

  it('draws a paragraph across two columns as a box from the region top, and pulls the next block up', () => {
    const laid = paginate([para(3), para(3), para(1)], () => twoColumns);
    const [first] = laid.starts;
    expect(first!.crosses).toEqual([
      {
        block: 1,
        top: 0,
        count: 2,
        column: 0,
        lead: 60,
        splits: [2],
        height: 100,
        rows: 1,
        rowGap: 0,
      },
    ]);
    // The box stands at the region's top: the strip goes back from 60 to 0.
    expect(first!.spacers).toContainEqual({ block: 1, height: -60 });
    // The box ends at the column foot (100); its tail ends at 20 in column two: the next block goes back 80.
    expect(first!.spacers).toContainEqual({ block: 2, height: -80 });
  });

  it('starts a column at a block that does not fit, pulling it up to the region top', () => {
    const laid = paginate([para(4), para(2, { keepTogether: true })], () => twoColumns);
    expect(laid.starts[0]!.columns).toEqual([{ block: 1, line: 0, column: 1 }]);
    // The first ends at 80; the second stands at 0 in column two.
    expect(laid.starts[0]!.spacers).toEqual([{ block: 1, height: -80 }]);
  });

  it('starts a region where a continuous section leaves the page, and columns there', () => {
    // A one-column line (0-20), then two columns from 20: each column 80 high.
    const laid = paginate([para(1), continuous, para(4), para(2)], frameIn(2));
    expect(laid.starts[0]!.columns).toEqual([{ block: 3, line: 0, column: 1 }]);
    expect(laid.starts[0]!.spacers).toEqual([{ block: 3, height: -80 }]);
    expect(laid.starts[0]!.rules).toEqual([{ block: 2, top: 20, bottom: 100, count: 2 }]);
  });

  it('balances the columns of a section a continuous break ends, the next section under the longest', () => {
    // Six lines in two columns of a region ended by a continuous break: three and three, then a line below.
    const laid = paginate([para(6), continuous, para(1)], frameIn(0, 1));
    const [start] = laid.starts;
    expect(start!.crosses?.[0]).toMatchObject({ block: 0, splits: [3], height: 60 });
    expect(start!.rules).toEqual([{ block: 0, top: 0, bottom: 60, count: 2 }]);
    // The box's foot (60) and the last block after it: no spacer needed, it starts at 60.
    expect(laid.starts).toHaveLength(1);
    expect(start!.spacers ?? []).not.toContainEqual(expect.objectContaining({ block: 2 }));
  });

  it('balances a region of whole paragraphs to the shortest columns that hold them', () => {
    const laid = paginate([para(2), para(2), para(1), continuous, para(1)], frameIn(0, 3));
    // Five lines at 60 high: the first and the second's first line, then the second's last and the third.
    expect(laid.starts[0]!.columns).toEqual([{ block: 1, line: 1, column: 1 }]);
    expect(laid.starts[0]!.rules![0]!.bottom).toBe(60);
  });

  it('carries a paragraph from the last column onto the next page as rows where the browser wraps', () => {
    const blocks = [para(4), para(10)];
    const wrapped = paginate(blocks, () => twoColumns, undefined, { wrap: true });
    expect(wrapped.starts[0]!.crosses?.[0]).toMatchObject({
      block: 1,
      column: 0,
      splits: [1, 6],
      rows: 2,
      rowGap: 50,
    });
    expect(wrapped.starts[1]).toMatchObject({ block: 1, line: 6, carried: true, gap: 0 });
    // Without wrapping it moves whole to the next page.
    const whole = paginate(blocks, () => twoColumns);
    expect(whole.starts[1]).toMatchObject({ block: 1, line: 0 });
    expect(whole.starts[0]!.crosses).toBeUndefined();
  });

  it('carries a paragraph taller than a page of columns anyway, from the page top', () => {
    const laid = paginate([para(12)], () => twoColumns);
    expect(laid.starts[0]!.crosses?.[0]).toMatchObject({ block: 0, splits: [5, 10], rows: 2 });
    expect(laid.starts[1]).toMatchObject({ block: 0, line: 10, carried: true });
  });

  it('equals laying out from the start after edits in columns', () => {
    const blocks = Array.from({ length: 60 }, (_, i) =>
      para((i % 3) + 1, { widowControl: i % 2 === 0 }),
    );
    const previous = paginate(blocks, () => twoColumns, undefined, { wrap: true });
    const changed = blocks.map((b, i) => (i === 30 ? para(5) : b));
    const since = paginate(
      changed,
      () => twoColumns,
      { previous, first: 30, last: 30, delta: 0 },
      { wrap: true },
    );
    expect(since.starts).toEqual(
      paginate(changed, () => twoColumns, undefined, { wrap: true }).starts,
    );
  });
});

describe('paginate, column breaks (page-layout.md "Breaks")', () => {
  const twoColumns = { ...page, columns: { count: 2, width: 190, gap: 20 } };

  it('starts the next column at a column break, and the next page after the last column', () => {
    const laid = paginate(
      [para(1), para(1, { columnBreakBefore: true }), para(1, { columnBreakBefore: true })],
      () => twoColumns,
    );
    expect(laid.starts[0]!.columns).toEqual([{ block: 1, line: 0, column: 1 }]);
    expect(laid.starts[1]).toMatchObject({ block: 2, line: 0 });
  });

  it('starts a new page at a column break in a section of one column', () => {
    expect(starts([para(1), para(1, { columnBreakBefore: true })])).toEqual([
      [0, 0, 0, 0],
      [1, 0, 100 - 20 + 50, 0],
    ]);
  });

  it('starts the next column at the line after a Word column break inside a paragraph', () => {
    const laid = paginate([para(3, { columnForced: [1] })], () => twoColumns);
    expect(laid.starts[0]!.columns).toEqual([{ block: 0, line: 1, column: 1 }]);
    expect(laid.starts[0]!.crosses?.[0]).toMatchObject({ splits: [1] });
    const after = paginate([para(1, { columnBreakAfter: true }), para(1)], () => twoColumns);
    expect(after.starts[0]!.columns).toEqual([{ block: 1, line: 0, column: 1 }]);
  });
});
