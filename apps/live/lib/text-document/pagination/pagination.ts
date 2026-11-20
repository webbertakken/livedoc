// Laying the writing onto pages (docs/specs/034-text-documents/page-layout.md "Laying out"), as arithmetic over the
// blocks' measured lines: where each page starts, and how tall a spacer takes the writing from where it stops on one
// page to the next page's text area. Pure; the plugin measures the blocks and draws the spacers.
import type { PageSetup, SectionStart } from '@livedoc/text-documents';

/** The ground between two pages at 100% zoom, in CSS pixels (default). */
export const PAGE_GAP_PX = 12;
/** The ground above the first page and below the last, in CSS pixels (default). */
export const PAGES_EDGE_PX = 24;
// Points to CSS pixels.
const PX_PER_PT = 96 / 72;
// A line within half a pixel of the foot still fits: measured rectangles round.
const FIT_TOLERANCE_PX = 0.5;

/** A line's box, from the top of its block's border box, in CSS pixels. */
export type LineBox = { readonly top: number; readonly bottom: number };

/** A block as the layout reads it, in CSS pixels, without any spacer the layout put inside it. */
export type BlockMetrics = {
  /** Its border box. */
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  /** Its lines; none for a block that moves whole. */
  readonly lines: readonly LineBox[];
  /** It moves whole: a section break's line, content kept from a file. */
  readonly atom?: boolean;
  readonly keepWithNext?: boolean;
  readonly keepTogether?: boolean;
  /** Prevent single lines: widows and orphans of two. */
  readonly widowControl?: boolean;
  /** A page break before. */
  readonly breakBefore?: boolean;
  /** A page break after it: the next block starts a new page. */
  readonly breakAfter?: boolean;
  /** Lines that start a new page whatever the rules (a page break inside the paragraph before them). */
  readonly forced?: readonly number[];
  /** A section break: where the section it starts begins. */
  readonly startsSection?: SectionStart;
};

/** A page's geometry in CSS pixels: its height, its margins and the text area between them. */
export type PageFrame = {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
  readonly textHeight: number;
};

/**
 * Where a page starts: before block `block` (`line` 0) or before its line `line`; `gap` is the spacer's height that
 * takes the writing there, and `blank` the blank pages before it.
 */
export type PageStart = {
  readonly block: number;
  readonly line: number;
  readonly gap: number;
  readonly blank: number;
};

export type Pagination = {
  readonly starts: readonly PageStart[];
  /** The page the layout started from. */
  readonly laidFrom: number;
  /** The page where it found the previous layout again, or null when it laid out to the end. */
  readonly settledAt: number | null;
};

/** What changed since a previous layout: blocks `first` to `last` (new indices) are new, and `delta` were added. */
export type LayoutChange = {
  readonly previous: Pagination;
  readonly first: number;
  readonly last: number;
  readonly delta: number;
};

/** A page setup's frame. */
export function pageFrame(setup: PageSetup): PageFrame {
  const { top, bottom } = setup.margins;
  return {
    width: setup.width * PX_PER_PT,
    height: setup.height * PX_PER_PT,
    top: top * PX_PER_PT,
    bottom: bottom * PX_PER_PT,
    textHeight: (setup.height - top - bottom) * PX_PER_PT,
  };
}

/** How many pages a layout has, blank ones included. */
export const pageCount = (pagination: Pagination): number =>
  pagination.starts.reduce((count, start) => count + 1 + start.blank, 0);

const linesOf = (block: BlockMetrics): readonly LineBox[] =>
  block.atom || block.lines.length === 0 ? [{ top: 0, bottom: block.height }] : block.lines;

// Where the writing stands on the page: the bottom of what was placed last and its space after.
type Cursor = { readonly y: number; readonly mb: number; readonly empty: boolean };
const PAGE_TOP: Cursor = { y: 0, mb: 0, empty: true };

/** The page to lay out again from: the one before the page holding block `target`'s start. */
function restartPage(starts: readonly PageStart[], target: number): number {
  let holding = 0;
  for (let q = 0; q < starts.length; q++) {
    const start = starts[q]!;
    if (start.block < target || (start.block === target && start.line === 0)) holding = q;
    else break;
  }
  // A page's start may have moved back for a block after it (keep with next): lay out the page before it too.
  return Math.max(0, holding - 1);
}

/**
 * The pages for these blocks. Given what changed since a previous layout, it lays out from shortly before the change
 * and stops at the first page after it that starts where it started before, taking the rest from before.
 */
export function paginate(
  blocks: readonly BlockMetrics[],
  frameOf: (block: number) => PageFrame,
  change?: LayoutChange,
): Pagination {
  const parity = blocks.some(
    (b) => b.startsSection === 'odd-page' || b.startsSection === 'even-page',
  );
  const restart =
    change && change.previous.starts.length > 0
      ? restartPage(change.previous.starts, change.first - 1)
      : 0;
  const starts: PageStart[] = change
    ? change.previous.starts.slice(0, restart + 1)
    : [{ block: 0, line: 0, gap: 0, blank: 0 }];
  let pages = starts.reduce((count, start) => count + 1 + start.blank, 0);
  let i = starts[starts.length - 1]!.block;
  let s = starts[starts.length - 1]!.line;
  // The page being filled.
  let frame = frameOf(i);
  let cursor = PAGE_TOP;
  // The blocks started on this page, with where the writing stood before each.
  let onPage: { block: number; before: Cursor }[] = [];

  // The previous layout's pages after the change, by their start, with the pages before each.
  const previous = new Map<string, { index: number; pagesBefore: number }>();
  if (change) {
    let before = 0;
    change.previous.starts.forEach((start, index) => {
      before += start.blank;
      if (start.block > change.last - change.delta)
        previous.set(`${start.block}:${start.line}:${start.blank}`, { index, pagesBefore: before });
      before += 1;
    });
  }

  // A new page starting at block `block`, line `line`, the writing stopping at `endY` on this one. True when it
  // starts where a page started before the change: the rest is the previous layout's.
  const newPage = (block: number, line: number, endY: number, blank: number): boolean => {
    // The page it starts has the setup of the section its first line is in.
    const next = frameOf(block);
    starts.push({
      block,
      line,
      gap:
        Math.max(0, frame.textHeight - endY + frame.bottom + PAGE_GAP_PX + next.top) +
        blank * (next.height + PAGE_GAP_PX),
      blank,
    });
    frame = next;
    pages += blank;
    cursor = PAGE_TOP;
    onPage = [];
    if (change && block > change.last) {
      const found = previous.get(`${block - change.delta}:${line}:${blank}`);
      if (found && (!parity || found.pagesBefore % 2 === pages % 2)) {
        for (const start of change.previous.starts.slice(found.index + 1))
          starts.push({ ...start, block: start.block + change.delta });
        return true;
      }
    }
    pages += 1;
    return false;
  };

  // Blank pages before block `i` when the section before it starts on an odd or even page.
  const blankBefore = (at: number): number => {
    const start = blocks[at - 1]?.startsSection;
    const next = pages + 1;
    if (start === 'odd-page') return next % 2 === 0 ? 1 : 0;
    if (start === 'even-page') return next % 2 === 1 ? 1 : 0;
    return 0;
  };

  while (i < blocks.length) {
    const block = blocks[i]!;
    const lines = linesOf(block);
    if (s === 0) {
      const startsSection = blocks[i - 1]?.startsSection;
      const sectionBreaks = startsSection !== undefined && startsSection !== 'continuous';
      if (!cursor.empty && (block.breakBefore || blocks[i - 1]?.breakAfter || sectionBreaks)) {
        const at = starts.length;
        if (newPage(i, 0, cursor.y + cursor.mb, blankBefore(i)))
          return { starts, laidFrom: restart, settledAt: at };
        continue;
      }
      onPage.push({ block: i, before: cursor });
    }
    const top = cursor.empty ? block.marginTop : cursor.y + Math.max(cursor.mb, block.marginTop);
    const blockTop = s === 0 ? top : -lines[s]!.top;
    const bottomOf = (k: number) =>
      blockTop + (k === lines.length - 1 ? block.height : lines[k]!.bottom);
    let fit = 0;
    while (s + fit < lines.length && bottomOf(s + fit) <= frame.textHeight + FIT_TOLERANCE_PX)
      fit++;
    // A page break inside the paragraph starts the next page at the line after it.
    const forced = block.forced?.find((line) => line > s && line < lines.length);
    if (forced !== undefined && s + fit >= forced) {
      const at = starts.length;
      if (newPage(i, forced, blockTop + lines[forced]!.top, 0))
        return { starts, laidFrom: restart, settledAt: at };
      s = forced;
      continue;
    }
    const remaining = lines.length - s;
    if (fit === remaining) {
      cursor = { y: blockTop + block.height, mb: block.marginBottom, empty: false };
      i += 1;
      s = 0;
      continue;
    }
    let take = fit;
    if (block.atom || (block.keepTogether && s === 0)) take = 0;
    else if (block.widowControl) {
      if (remaining - take < 2) take = remaining - 2;
      if (take < 2) take = 0;
    }
    // A rule that would leave the page empty gives way.
    if (take <= 0 && cursor.empty) take = Math.max(fit, 1);
    const at = starts.length;
    if (take > 0) {
      const line = s + take;
      if (line >= lines.length) {
        // The whole block on this page however tall (it fills an empty page).
        cursor = { y: blockTop + block.height, mb: block.marginBottom, empty: false };
        i += 1;
        s = 0;
        continue;
      }
      if (newPage(i, line, blockTop + lines[line]!.top, 0))
        return { starts, laidFrom: restart, settledAt: at };
      s = line;
      continue;
    }
    // The block moves on, with the run before it keeping with the next, unless that run fills the page from its top.
    let k = onPage.length - 1;
    while (
      k > 0 &&
      onPage[k - 1]!.block === onPage[k]!.block - 1 &&
      blocks[onPage[k - 1]!.block]!.keepWithNext
    )
      k -= 1;
    const moved = onPage[k]!.before.empty ? onPage[onPage.length - 1]! : onPage[k]!;
    i = moved.block;
    s = 0;
    if (newPage(moved.block, 0, moved.before.y + moved.before.mb, 0))
      return { starts, laidFrom: restart, settledAt: at };
  }
  return { starts, laidFrom: restart, settledAt: null };
}
