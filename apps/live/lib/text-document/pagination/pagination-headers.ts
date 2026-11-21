// Headers and footers on the pages (docs/specs/034-text-documents/page-layout.md "Headers and footers"): which header
// and footer each page shows (its section's, linked to the previous section's where it has none of its own, the first
// page's on the section's first page, the even page's on an even page), where they are drawn, and the page's frame
// with a header or footer taller than its room pushing the body. Pure: heights come measured from the drawn stories.
import {
  HeadersAndFooters,
  type HeaderFooterKind,
  type HeaderFooterSlot,
  type LiveHeaders,
  type LiveStory,
  type PageSetup,
  type ResolvedHeadersOf,
} from '@livedoc/text-documents';
import { PAGE_GAP_PX, pageFrame, type PageFrame } from './pagination';

// Points to CSS pixels.
const PX_PER_PT = 96 / 72;
// The smallest text area a pushed page keeps, so a page always holds a line's start.
const MIN_TEXT_HEIGHT_PX = 1;

/** Each drawn story's height in CSS pixels by its key (`storyKey`); 0 or absent is empty or not yet laid out. */
export type StoryHeights = ReadonlyMap<string, number>;

/** A story laid out at a width: its source and its height are this key's. */
export const storyKey = (story: string, width: number): string =>
  `${story}@${Math.round(width * 100) / 100}`;

/** A header or footer drawn on a page: at the section's left margin and text width, `margin` from its edge (px). */
export type PageStory = {
  readonly story: string;
  readonly key: string;
  readonly left: number;
  readonly width: number;
  readonly margin: number;
};

/** The header and footer story ids a page shows. */
export function pageStories(
  resolved: ResolvedHeadersOf<LiveStory> | undefined,
  first: boolean,
  number: number,
): { header?: string; footer?: string } {
  if (!resolved) return {};
  const slot = HeadersAndFooters.slotOf(resolved, first, number);
  const header = resolved.header[slot]?.story;
  const footer = resolved.footer[slot]?.story;
  return {
    ...(typeof header === 'string' ? { header } : {}),
    ...(typeof footer === 'string' ? { footer } : {}),
  };
}

/** The page's frame with its header (`header` px high) and footer pushing the body where they overflow their room. */
export function pushedFrame(
  frame: PageFrame,
  setup: PageSetup,
  header: number,
  footer: number,
): PageFrame {
  const top =
    header > 0
      ? Math.max(frame.top, HeadersAndFooters.margin(setup, 'header') * PX_PER_PT + header)
      : frame.top;
  const bottom =
    footer > 0
      ? Math.max(frame.bottom, HeadersAndFooters.margin(setup, 'footer') * PX_PER_PT + footer)
      : frame.bottom;
  if (top === frame.top && bottom === frame.bottom) return frame;
  return {
    ...frame,
    top,
    bottom,
    textHeight: Math.max(MIN_TEXT_HEIGHT_PX, frame.height - top - bottom),
  };
}

/** Where a page's header and footer stand, shown or not: the section's left margin and text width, their margins. */
export type StoryPlace = {
  readonly left: number;
  readonly width: number;
  readonly header: number;
  readonly footer: number;
};

/** A page's header and footer, if it shows them, and the section and slot they are (or would be made) in. */
export type PageStories = {
  readonly header?: PageStory;
  readonly footer?: PageStory;
  readonly section: number;
  readonly slot: HeaderFooterSlot;
  readonly place: StoryPlace;
};

/** A page's frame and stories, by the block and line it starts with and its number. */
export type PageLayout = {
  readonly frameOf: (block: number, line: number, number: number) => PageFrame;
  readonly storiesOf: (block: number, line: number, number: number) => PageStories;
  /** A section shows different odd and even pages: a page's number matters to its frame. */
  readonly oddEven: boolean;
};

export function pageLayout(input: {
  readonly setups: readonly PageSetup[];
  readonly sectionOf: readonly number[];
  /** Each section's own headers, the first's first; a section past the list has none of its own. */
  readonly headers: readonly (LiveHeaders | undefined)[];
  readonly heights: StoryHeights;
}): PageLayout {
  const { setups, sectionOf, heights } = input;
  const resolved = HeadersAndFooters.resolve(setups.map((_, s) => input.headers[s]));
  const frames = setups.map(pageFrame);
  const sectionAt = (block: number) => sectionOf[block] ?? 0;

  const storiesOf = (block: number, line: number, number: number): PageStories => {
    const s = sectionAt(block);
    const setup = setups[s]!;
    // The section's first page starts with its first line.
    const first = line === 0 && (block === 0 || sectionAt(block - 1) !== s);
    const ids = pageStories(resolved[s], first, number);
    const left = setup.margins.left * PX_PER_PT;
    const width = (setup.width - setup.margins.left - setup.margins.right) * PX_PER_PT;
    const place = (story: string, kind: 'header' | 'footer'): PageStory => ({
      story,
      key: storyKey(story, width),
      left,
      width,
      margin: HeadersAndFooters.margin(setup, kind) * PX_PER_PT,
    });
    return {
      ...(ids.header ? { header: place(ids.header, 'header') } : {}),
      ...(ids.footer ? { footer: place(ids.footer, 'footer') } : {}),
      section: s,
      slot: HeadersAndFooters.slotOf(resolved[s], first, number),
      place: {
        left,
        width,
        header: HeadersAndFooters.margin(setup, 'header') * PX_PER_PT,
        footer: HeadersAndFooters.margin(setup, 'footer') * PX_PER_PT,
      },
    };
  };

  return {
    storiesOf,
    frameOf: (block, line, number) => {
      const s = sectionAt(block);
      const stories = storiesOf(block, line, number);
      const height = (story: PageStory | undefined) => (story ? (heights.get(story.key) ?? 0) : 0);
      return pushedFrame(frames[s]!, setups[s]!, height(stories.header), height(stories.footer));
    },
    oddEven: resolved.some((r) => r.differentOddEven),
  };
}

/** A place on the pages: the page at `y` (CSS pixels down the pages), and its header or footer margin if there. */
export function pageAtPoint(
  pages: readonly {
    readonly height: number;
    readonly top?: number;
    readonly bottom?: number;
    readonly section?: number;
  }[],
  y: number,
): { index: number; kind: HeaderFooterKind | null } | null {
  let at = 0;
  for (const [index, page] of pages.entries()) {
    if (y >= at && y <= at + page.height) {
      const local = y - at;
      // A blank page shows no header or footer.
      if (page.section === undefined) return { index, kind: null };
      if (local < (page.top ?? 0)) return { index, kind: 'header' };
      if (local > page.height - (page.bottom ?? 0)) return { index, kind: 'footer' };
      return { index, kind: null };
    }
    at += page.height + PAGE_GAP_PX;
  }
  return null;
}
