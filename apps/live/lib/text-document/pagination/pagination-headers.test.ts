// Headers and footers on the pages (docs/specs/034-text-documents/page-layout.md "Headers and footers"): which one a
// page shows, where it is drawn, and how a tall one pushes the body.
import { describe, expect, it } from 'vitest';
import type { LiveHeaders, PageSetup } from '@livedoc/text-documents';
import { pageFrame, type BlockMetrics } from './pagination';
import { pageGeometries, pageNumbers, pagesSaid } from './pagination-draw';
import { paginate } from './pagination-engine';
import { pageAtPoint, pageLayout, pageStories, pushedFrame, storyKey } from './pagination-headers';

const PX = 4 / 3;
// A page 300 pt high, its margins 36 pt (48 px), header and footer margins 18 pt (24 px): 24 px of room each.
const setup: PageSetup = {
  width: 300,
  height: 300,
  orientation: 'portrait',
  margins: { top: 36, bottom: 36, left: 30, right: 30, header: 18, footer: 18 },
};

const resolved = (headers: LiveHeaders) => ({
  header: headers.header ?? {},
  footer: headers.footer ?? {},
  differentFirst: headers.differentFirst === true,
  differentOddEven: headers.differentOddEven === true,
});

describe('pageStories', () => {
  const all = resolved({
    header: { default: { story: 'h' }, first: { story: 'h1' }, even: { story: 'h2' } },
    footer: { default: { story: 'f' } },
    differentFirst: true,
    differentOddEven: true,
  });

  it('shows the first page header on the section’s first page ("Which one a page shows")', () => {
    expect(pageStories(all, true, 1)).toEqual({ header: 'h1' });
  });

  it('shows the even page header on an even page, the default on an odd one', () => {
    expect(pageStories(all, false, 2)).toEqual({ header: 'h2' });
    expect(pageStories(all, false, 3)).toEqual({ header: 'h', footer: 'f' });
  });

  it('shows the default where the switches are off, and none where a slot is empty', () => {
    const plain = resolved({ header: { default: { story: 'h' }, first: { story: 'h1' } } });
    expect(pageStories(plain, true, 2)).toEqual({ header: 'h' });
    expect(pageStories(resolved({}), true, 1)).toEqual({});
  });
});

describe('storyKey', () => {
  it('names a story at a width, to the hundredth of a pixel', () => {
    expect(storyKey('7', 320.123)).toBe('7@320.12');
  });
});

describe('pushedFrame', () => {
  const frame = pageFrame(setup);

  it('keeps the frame while the header and footer fit their room ("Drawn")', () => {
    expect(pushedFrame(frame, setup, 24, 10)).toEqual(frame);
    expect(pushedFrame(frame, setup, 0, 0)).toEqual(frame);
  });

  it('pushes the body’s first line down by what a header overflows, its foot up by a footer’s', () => {
    const pushed = pushedFrame(frame, setup, 40, 30);
    expect(pushed.top).toBe(24 + 40);
    expect(pushed.bottom).toBe(24 + 30);
    expect(pushed.textHeight).toBe(frame.height - 64 - 54);
  });

  it('never leaves a text area of no height', () => {
    expect(pushedFrame(frame, setup, 1000, 1000).textHeight).toBe(1);
  });
});

describe('pageLayout', () => {
  const headers: LiveHeaders = {
    header: { default: { story: 'h' }, first: { story: 'h1' } },
    footer: { default: { story: 'f' } },
    differentFirst: true,
  };
  const layout = (heights: Map<string, number> = new Map()) =>
    pageLayout({ setups: [setup, setup], sectionOf: [0, 0, 1, 1], headers: [headers], heights });
  const width = (300 - 60) * PX;

  it('places a page’s header at its margin and the section’s text width, its footer at the foot', () => {
    expect(layout().storiesOf(1, 0, 2)).toEqual({
      header: { story: 'h', key: storyKey('h', width), left: 30 * PX, width, margin: 18 * PX },
      footer: { story: 'f', key: storyKey('f', width), left: 30 * PX, width, margin: 18 * PX },
      section: 0,
      slot: 'default',
      first: false,
      place: { left: 30 * PX, width, header: 18 * PX, footer: 18 * PX },
    });
  });

  it('says the section and slot a page’s header is in, to make one where it shows none', () => {
    expect(layout().storiesOf(0, 0, 1)).toMatchObject({ section: 0, slot: 'first', first: true });
    expect(layout().storiesOf(2, 0, 3)).toMatchObject({ section: 1, slot: 'default' });
  });

  it('shows no footer on a first page whose first page footer is empty', () => {
    expect(layout().storiesOf(0, 0, 1).footer).toBeUndefined();
  });

  it('counts a page its section’s first when it starts with the section’s first line ("A page’s section")', () => {
    expect(layout().storiesOf(0, 0, 1).header?.story).toBe('h1');
    expect(layout().storiesOf(1, 0, 2).header?.story).toBe('h');
    expect(layout().storiesOf(0, 3, 2).header?.story).toBe('h');
  });

  it('links a later section without its own to the previous section’s, its own switches off', () => {
    // Section 2 starts at block 2 and has no headers: the previous section's default, not its first page header.
    expect(layout().storiesOf(2, 0, 3).header?.story).toBe('h');
  });

  it('pushes a page by its own header’s height, read by the story at its width', () => {
    const heights = new Map([[storyKey('h1', width), 50]]);
    expect(layout(heights).frameOf(0, 0, 1).top).toBe(24 + 50);
    expect(layout(heights).frameOf(1, 0, 2).top).toBe(48);
  });

  it('says whether parity matters: a section with different odd and even pages', () => {
    expect(layout().oddEven).toBe(false);
    expect(
      pageLayout({
        setups: [setup],
        sectionOf: [0],
        headers: [{ differentOddEven: true }],
        heights: new Map(),
      }).oddEven,
    ).toBe(true);
  });
});

// The engine with a page's own frame: a pushed page holds fewer lines, page 1 starts its writing lower.
describe('paginate with headers', () => {
  const LINE = 20;
  const para = (lines: number): BlockMetrics => ({
    height: lines * LINE,
    marginTop: 0,
    marginBottom: 0,
    lines: Array.from({ length: lines }, (_, i) => ({ top: i * LINE, bottom: (i + 1) * LINE })),
  });
  // 100 px of text a page, 19 px margins; a header pushing pages by `push` px.
  const base = { width: 400, height: 138, top: 19, bottom: 19, left: 20, textHeight: 100 };
  const pushed = (push: number) => ({ ...base, top: 19 + push, textHeight: 100 - push });

  it('starts page 1’s writing below a tall header, the gap its push', () => {
    const { starts } = paginate([para(5)], () => base, undefined, {
      pageFrameOf: () => pushed(40),
    });
    expect(starts.map((s) => [s.block, s.line, s.gap])).toEqual([
      [0, 0, 40],
      [0, 3, 19 + 12 + 59 + (100 - 40 - 60)],
    ]);
  });

  it('pushes only the pages whose header is tall: page 1 alone', () => {
    const { starts } = paginate([para(10)], () => base, undefined, {
      pageFrameOf: (_block, _line, number) => (number === 1 ? pushed(40) : base),
    });
    // Page 1 holds 3 lines (60 px), page 2 five, page 3 the last two.
    expect(starts.map((s) => [s.block, s.line])).toEqual([
      [0, 0],
      [0, 3],
      [0, 8],
    ]);
  });

  it('settles only where the page’s number keeps its parity when odd and even pages differ', () => {
    const frameOf = (_b: number, _l: number, n: number) => (n % 2 === 0 ? pushed(40) : base);
    const blocks = [para(2), para(2), para(2), para(2), para(2), para(2)];
    const previous = paginate(blocks, () => base, undefined, {
      pageFrameOf: frameOf,
      oddEven: true,
    });
    const grown = [para(2), para(7), ...blocks.slice(2)];
    const full = paginate(grown, () => base, undefined, { pageFrameOf: frameOf, oddEven: true });
    const incremental = paginate(
      grown,
      () => base,
      { previous, first: 1, last: 1, delta: 0 },
      { pageFrameOf: frameOf, oddEven: true },
    );
    expect(incremental.starts).toEqual(full.starts);
  });
});

describe('pageGeometries', () => {
  const frame = pageFrame(setup);
  const story = (id: string) => ({ story: id, key: `${id}@1`, left: 40, width: 320, margin: 24 });
  const place = { left: 40, width: 320, header: 24, footer: 24 };
  const layout = {
    frameOf: (_b: number, _l: number, n: number) =>
      n === 1 ? { ...frame, top: frame.top + 10 } : frame,
    storiesOf: (_b: number, _l: number, n: number) =>
      n === 1
        ? { header: story('first'), section: 0, slot: 'first' as const, first: true, place }
        : {
            header: story(`page ${n}`),
            footer: story('f'),
            section: 0,
            slot: 'default' as const,
            first: false,
            place,
          },
  };
  const pagination = {
    starts: [
      { block: 0, line: 0, gap: 0, blank: 0 },
      { block: 3, line: 0, gap: 0, blank: 1 },
    ],
    laidFrom: 0,
    settledAt: null,
  };

  it('numbers pages counting blank ones', () => {
    expect(pageNumbers(pagination)).toEqual([1, 3]);
  });

  it('gives each page its header and footer by its number, a blank page none ("A blank page")', () => {
    const pages = pageGeometries(pagination, { frameOf: () => frame, page: layout });
    expect(pages.map((p) => [p.header?.story, p.footer?.story])).toEqual([
      ['first', undefined],
      [undefined, undefined],
      ['page 3', 'f'],
    ]);
    expect(pagesSaid(pages)).not.toBe(
      pagesSaid(pageGeometries(pagination, { frameOf: () => frame })),
    );
  });

  it('draws a line between columns from the page’s own text area top', () => {
    const columns = { ...frame, columns: { count: 2, width: 100, gap: 20 } };
    const ruled = {
      starts: [
        {
          block: 0,
          line: 0,
          gap: 0,
          blank: 0,
          rules: [{ block: 0, top: 5, bottom: 50, count: 2 }],
        },
      ],
      laidFrom: 0,
      settledAt: null,
    };
    const [page] = pageGeometries(ruled, {
      frameOf: () => columns,
      page: { ...layout, frameOf: () => ({ ...columns, top: 70 }) },
      lineBetween: () => true,
    });
    expect(page!.rules).toEqual([{ top: 75, bottom: 120, xs: [columns.left + 110] }]);
  });
});

describe('pageAtPoint', () => {
  // Two pages 100 px high, 12 px apart, margins 20 px; the second blank.
  const pages = [
    { height: 100, top: 20, bottom: 20, section: 0 },
    { height: 100 },
    { height: 100, top: 30, bottom: 20, section: 1 },
  ];

  it('finds the header or footer margin of the page at a point ("Editing headers and footers")', () => {
    expect(pageAtPoint(pages, 10)).toEqual({ index: 0, kind: 'header' });
    expect(pageAtPoint(pages, 50)).toEqual({ index: 0, kind: null });
    expect(pageAtPoint(pages, 90)).toEqual({ index: 0, kind: 'footer' });
    expect(pageAtPoint(pages, 224 + 25)).toEqual({ index: 2, kind: 'header' });
  });

  it('finds no margin on a blank page, and no page in the ground between pages', () => {
    expect(pageAtPoint(pages, 112 + 5)).toEqual({ index: 1, kind: null });
    expect(pageAtPoint(pages, 105)).toBeNull();
    expect(pageAtPoint(pages, 1000)).toBeNull();
  });
});
