// Laying the writing onto pages (docs/specs/034-text-documents/page-layout.md "Laying out").
import { describe, expect, it } from 'vitest';
import { PAGE_GAP_PX, pageCount, pageFrame, paginate, type BlockMetrics } from './pagination';

const LINE = 20;
// A text area five lines high; 50 px from one page's text foot to the next one's text top; pages 200 px apart.
const frame = { textHeight: 100, below: 50, stride: 200 };

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
  it('reads a setup as the text area, the room below it and the page stride in CSS pixels', () => {
    const setup = {
      width: 612,
      height: 792,
      orientation: 'portrait' as const,
      margins: { top: 72, bottom: 36, left: 72, right: 72 },
    };
    expect(pageFrame(setup)).toEqual({
      textHeight: (792 - 108) / 0.75,
      below: 36 / 0.75 + PAGE_GAP_PX + 72 / 0.75,
      stride: 792 / 0.75 + PAGE_GAP_PX,
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
    expect(odd.starts[1]).toEqual({ block: 2, line: 0, gap: 120 + 200, blank: 1 });
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
