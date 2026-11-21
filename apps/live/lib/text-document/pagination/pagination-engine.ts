// Laying the writing onto pages and into columns (docs/specs/034-text-documents/page-layout.md "Laying out",
// "Columns"), as arithmetic over the blocks' measured lines. The writing fills a box from its top down: a page's text
// area, or one column of a section's part of a page (its region). A full box hands on to the next column, and past
// the last to the next page. The writing is drawn as one strip: where a block must stand elsewhere than the strip
// would put it, a spacer (signed) takes the strip there; a paragraph whose lines cross columns is drawn as a box of
// columns of its own. Pure; the plugin measures the blocks and draws the spacers, columns and boxes.
import {
  PAGE_GAP_PX,
  type BlockMetrics,
  type Cross,
  type LayoutChange,
  type LineBox,
  type PageFrame,
  type PageStart,
  type Pagination,
} from './pagination';
import {
  copyPage,
  frozen,
  restartPage,
  shifted,
  thawed,
  type PageRecord,
} from './pagination-records';

// A line within half a pixel of the foot still fits: measured rectangles round.
const FIT_TOLERANCE_PX = 0.5;
// Two tops this close are the same place.
const SAME_PX = 0.01;

export type PaginateOptions = {
  /** The browser draws a box of columns in rows (`column-wrap`): a paragraph may cross from a page's columns onto the next page. */
  readonly wrap?: boolean;
};

const linesOf = (block: BlockMetrics): readonly LineBox[] =>
  block.atom || block.lines.length === 0 ? [{ top: 0, bottom: block.height }] : block.lines;

const columnsOf = (frame: PageFrame): number => frame.columns?.count ?? 1;

// Where the writing stands in its box: the bottom of what was placed last and its space after.
type Cursor = { readonly y: number; readonly mb: number; readonly empty: boolean };
// Where the drawn strip stands: the bottom of the last block in it and its space after (page coordinates).
type Strip = { readonly y: number; readonly mb: number };

type Region = {
  readonly frame: PageFrame;
  readonly top: number;
  readonly count: number;
  readonly first: number;
  column: number;
  // Each column's bottom with its last block's space after.
  bottoms: number[];
};

// The block being laid: where the strip stood before it, where it stands, its column and whether it began at a box top.
type Placed = {
  readonly block: number;
  readonly strip: Strip;
  readonly top: number;
  readonly column: number;
  readonly atPageTop: boolean;
};

type OnBox = { readonly block: number; readonly before: Cursor; readonly strip: Strip };

type State = {
  i: number;
  s: number;
  pages: number;
  frame: PageFrame;
  cursor: Cursor;
  strip: Strip;
  onBox: OnBox[];
  region: Region | null;
  placed: Placed | null;
  cross: Cross | null;
  page: PageRecord;
};

const PAGE_TOP: Cursor = { y: 0, mb: 0, empty: true };

class Engine {
  readonly blocks: readonly BlockMetrics[];
  readonly frameOf: (block: number) => PageFrame;
  readonly change: LayoutChange | undefined;
  readonly wrap: boolean;
  readonly parity: boolean;
  readonly restart: number;
  // The pages laid before the one being filled, and the previous layout's pages after the change by their start.
  readonly done: PageStart[];
  readonly previous = new Map<string, { index: number; pagesBefore: number }>();
  state: State;
  // Balancing: the foot of the columns being tried; a box past the last column fails the try.
  trial: { foot: number; failed: boolean } | null = null;
  // Where the region began on this page, to lay it again balanced.
  snapshot: State | null = null;
  settledAt: number | null = null;

  constructor(
    blocks: readonly BlockMetrics[],
    frameOf: (block: number) => PageFrame,
    change: LayoutChange | undefined,
    options: PaginateOptions,
  ) {
    this.blocks = blocks;
    this.frameOf = frameOf;
    this.change = change;
    this.wrap = options.wrap ?? false;
    this.parity = blocks.some(
      (b) => b.startsSection === 'odd-page' || b.startsSection === 'even-page',
    );
    this.restart =
      change && change.previous.starts.length > 0
        ? restartPage(change.previous.starts, change.first - 1)
        : 0;
    const kept = change ? change.previous.starts.slice(0, this.restart + 1) : [];
    const first = kept.pop();
    this.done = kept;
    const page: PageRecord = first
      ? { ...thawed(first), columns: [], spacers: [], crosses: [], rules: [] }
      : { block: 0, line: 0, gap: 0, blank: 0, columns: [], spacers: [], crosses: [], rules: [] };
    const pages = this.done.reduce((count, start) => count + 1 + start.blank, 0) + 1 + page.blank;
    this.state = {
      i: page.block,
      s: page.line,
      pages,
      frame: frameOf(page.block),
      cursor: PAGE_TOP,
      strip: { y: 0, mb: 0 },
      onBox: [],
      region: null,
      placed: null,
      cross: null,
      page,
    };
    // A page laid again from inside a paragraph: the paragraph goes on from the page's top.
    if (page.line > 0) {
      const lines = linesOf(blocks[page.block]!);
      this.state.placed = {
        block: page.block,
        strip: this.state.strip,
        top: -(lines[page.line]?.top ?? 0),
        column: 0,
        atPageTop: true,
      };
    }
    if (change) {
      let before = 0;
      change.previous.starts.forEach((start, index) => {
        before += start.blank;
        if (start.block > change.last - change.delta)
          this.previous.set(`${start.block}:${start.line}:${start.blank}`, {
            index,
            pagesBefore: before,
          });
        before += 1;
      });
    }
    this.enterPage();
  }

  get foot(): number {
    const { state } = this;
    return this.trial && state.region ? this.trial.foot : state.frame.textHeight;
  }

  save(): State {
    const { state } = this;
    return {
      ...state,
      onBox: [...state.onBox],
      region: state.region && { ...state.region, bottoms: [...state.region.bottoms] },
      cross: state.cross,
      page: copyPage(state.page),
    };
  }

  restore(saved: State): void {
    this.state = {
      ...saved,
      onBox: [...saved.onBox],
      region: saved.region && { ...saved.region, bottoms: [...saved.region.bottoms] },
      page: copyPage(saved.page),
    };
  }

  // The page the writing stands on begins: a region there when its first block is in a section of columns.
  enterPage(): void {
    const { state } = this;
    state.region = null;
    this.snapshot = null;
    const frame = this.frameOf(state.i);
    if (state.i < this.blocks.length && columnsOf(frame) > 1) this.startRegion(frame, 0);
  }

  startRegion(frame: PageFrame, top: number): void {
    const { state } = this;
    const count = columnsOf(frame);
    state.region = {
      frame,
      top,
      count,
      first: state.i,
      column: 0,
      bottoms: Array.from({ length: count }, () => top),
    };
    // A region begun at a block's start, with no box of columns open, can be laid again balanced.
    this.snapshot = state.s === 0 && !state.cross ? this.save() : null;
  }

  // Where the writing stops in the region's columns (the next section starts under the longest); its line between
  // drawn to the foot of the longest column.
  closeRegion(): number {
    const { region, cursor, page } = this.state;
    if (!region) return cursor.y + cursor.mb;
    const others = region.bottoms.filter((_, c) => c !== region.column);
    page.rules.push({
      block: region.first,
      top: region.top,
      bottom: Math.max(cursor.y, ...others),
      count: region.count,
    });
    this.state.region = null;
    this.snapshot = null;
    return Math.max(cursor.y + cursor.mb, ...others);
  }

  // The spacer before block `block` that takes the strip to `height`: the page's start gap, or one of its spacers.
  setSpacer(block: number, height: number): void {
    const { page } = this.state;
    if (page.block === block && page.line === 0 && !page.carried) {
      page.gap = height;
      return;
    }
    const at = page.spacers.findIndex((s) => s.block === block);
    if (at >= 0) page.spacers[at] = { block, height };
    else page.spacers.push({ block, height });
  }

  dropSpacer(block: number): void {
    const { page } = this.state;
    page.spacers = page.spacers.filter((s) => s.block !== block);
  }

  // A new page starting at block `block`, line `line`. True when it starts where a page started before the change:
  // the rest is the previous layout's. `carried`: a box of columns carries the writing there, no spacer.
  newPage(block: number, line: number, endY: number, blank: number, carried = false): boolean {
    const state = this.state;
    const { frame } = state;
    this.closeRegion();
    const next = this.frameOf(block);
    const blanks = blank * (next.height + PAGE_GAP_PX);
    // From where the writing stops to the next page's text area, inside a paragraph or between blocks; a box of
    // columns carries the writing there itself.
    const across = frame.textHeight + frame.bottom + PAGE_GAP_PX + next.top;
    const gap = carried
      ? 0
      : Math.max(0, across - (line > 0 ? endY : state.strip.y + state.strip.mb)) + blanks;
    this.done.push(frozen(state.page));
    state.pages += blank;
    if (this.change && block > this.change.last) {
      const found = this.previous.get(`${block - this.change.delta}:${line}:${blank}`);
      if (found && (!this.parity || found.pagesBefore % 2 === state.pages % 2)) {
        // The rest is the previous layout's, from this page on, with the spacer this layout takes there.
        this.settledAt = this.done.length;
        const previous = this.change.previous.starts;
        this.done.push({ ...shifted(previous[found.index]!, this.change.delta), gap });
        for (const start of previous.slice(found.index + 1))
          this.done.push(shifted(start, this.change.delta));
        return true;
      }
    }
    state.page = {
      block,
      line,
      gap,
      blank,
      ...(carried ? { carried: true as const } : {}),
      columns: [],
      spacers: [],
      crosses: [],
      rules: [],
    };
    state.frame = next;
    state.pages += 1;
    state.cursor = PAGE_TOP;
    state.onBox = [];
    // The strip in the new page's coordinates, from its text area's top.
    state.strip = { y: state.strip.y - across - blanks, mb: state.strip.mb };
    state.i = block;
    state.s = line;
    this.enterPage();
    return false;
  }

  // The paragraph being laid crosses into another column (or page) at line `line`: it is drawn as a box of columns.
  markCross(line: number): void {
    const state = this.state;
    const { region, placed } = state;
    if (!region || !placed) return;
    if (state.cross && state.cross.block === placed.block) {
      state.cross = { ...state.cross, splits: [...state.cross.splits, line] };
    } else {
      state.cross = {
        block: placed.block,
        top: region.top,
        count: region.count,
        column: placed.column,
        lead: placed.top - region.top,
        splits: [line],
        height: this.foot - region.top,
        rows: 1,
        rowGap: 0,
      };
      // The box stands at the region's top: the strip is taken there before it.
      this.setSpacer(placed.block, region.top - placed.strip.y - placed.strip.mb);
    }
    this.syncCross();
  }

  // The open box of columns as it stands, on the page it began on.
  syncCross(): void {
    const { cross, page } = this.state;
    if (!cross) return;
    const own = page.crosses.findIndex((c) => c.block === cross.block);
    if (own >= 0) page.crosses[own] = cross;
    else if (!page.carried || page.block !== cross.block) page.crosses.push(cross);
    else {
      // It began on an earlier page: update it there.
      for (let q = this.done.length - 1; q >= 0; q--) {
        const crosses = this.done[q]!.crosses;
        const at = crosses?.findIndex((c) => c.block === cross.block) ?? -1;
        if (at >= 0) {
          const updated = [...crosses!];
          updated[at] = cross;
          this.done[q] = { ...this.done[q]!, crosses: updated };
          break;
        }
      }
    }
  }

  // The box is full at block `block`, line `line`, the writing stopping at `endY`: the next column, else the next
  // page. Returns true when the layout settled on a previous page.
  nextBox(block: number, line: number, endY: number): boolean {
    const state = this.state;
    const { region } = state;
    if (region && region.column < region.count - 1) {
      region.bottoms[region.column] = endY;
      region.column += 1;
      state.page.columns.push({ block, line, column: region.column });
      if (line > 0) this.markCross(line);
      state.cursor = { y: region.top, mb: 0, empty: true };
      state.onBox = [];
      state.i = block;
      state.s = line;
      return false;
    }
    if (this.trial) {
      this.trial.failed = true;
      return false;
    }
    if (region && line > 0) {
      const placed = state.placed!;
      const top = state.cross?.block === block ? state.cross.top : region.top;
      if ((this.wrap && top === 0) || placed.atPageTop) {
        // A box of columns carries the paragraph onto the next page, its rows pages.
        this.markCross(line);
        state.cross = { ...state.cross!, rows: state.cross!.rows + 1 };
        const next = this.frameOf(block);
        state.cross = { ...state.cross, rowGap: state.frame.bottom + PAGE_GAP_PX + next.top };
        this.syncCross();
        return this.newPage(block, line, endY, 0, true);
      }
      // Else it moves whole to the next page: what this page holds of it goes.
      state.page.columns = state.page.columns.filter((c) => c.block !== block);
      state.page.crosses = state.page.crosses.filter((c) => c.block !== block);
      this.dropSpacer(block);
      state.cross = null;
      state.strip = placed.strip;
      return this.newPage(block, 0, placed.strip.y + placed.strip.mb, 0);
    }
    return this.newPage(block, line, endY, 0);
  }

  // Blank pages before block `at` when the section before it starts on an odd or even page.
  blankBefore(at: number): number {
    const start = this.blocks[at - 1]?.startsSection;
    const next = this.state.pages + 1;
    if (start === 'odd-page') return next % 2 === 0 ? 1 : 0;
    if (start === 'even-page') return next % 2 === 1 ? 1 : 0;
    return 0;
  }

  // The region ends before block `end`: laid again on this page as even as its lines allow, when a continuous
  // section break ends it and it began on this page at a block's start.
  balance(end: number): void {
    const snapshot = this.snapshot;
    const state = this.state;
    if (
      !snapshot ||
      !state.region ||
      snapshot.page.block !== state.page.block ||
      state.page.carried !== snapshot.page.carried
    )
      return;
    const top = state.region.top;
    let best = this.save();
    let lo = 0;
    let hi = Math.ceil(Math.max(...state.region.bottoms, state.cursor.y) - top);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      this.restore(snapshot);
      this.trial = { foot: top + mid, failed: false };
      while (this.state.i < end && !this.trial.failed) this.step();
      const fits = !this.trial.failed && this.state.i >= end;
      this.trial = null;
      if (fits) {
        hi = mid;
        best = this.save();
      } else lo = mid;
    }
    this.restore(best);
  }

  // Lays one stretch: a block's start, or as many of its lines as the box holds.
  step(): boolean {
    let state = this.state;
    const { blocks } = this;
    const i = state.i;
    const block = blocks[i]!;
    const lines = linesOf(block);
    if (state.s === 0) {
      const frame = this.frameOf(i);
      // A region ends where its section does; the next section starts under its longest column.
      if (state.region && frame !== state.region.frame) {
        if (blocks[i - 1]?.startsSection === 'continuous' && state.region.count > 1) {
          this.balance(i);
          state = this.state;
        }
        const bottom = this.closeRegion();
        state.cursor = { y: bottom, mb: 0, empty: state.cursor.empty };
      }
      const startsSection = blocks[i - 1]?.startsSection;
      const sectionBreaks = startsSection !== undefined && startsSection !== 'continuous';
      if (
        !state.cursor.empty &&
        (block.breakBefore || blocks[i - 1]?.breakAfter || sectionBreaks)
      ) {
        if (this.trial) {
          this.trial.failed = true;
          return false;
        }
        return this.newPage(i, 0, state.strip.y + state.strip.mb, this.blankBefore(i));
      }
      if (!state.region && columnsOf(frame) > 1)
        this.startRegion(
          frame,
          state.cursor.empty ? state.cursor.y : state.cursor.y + state.cursor.mb,
        );
      // A column break starts the next column, past the last the next page; in one column, the next page.
      if (!state.cursor.empty && (block.columnBreakBefore || blocks[i - 1]?.columnBreakAfter)) {
        if (state.region) return this.nextBox(i, 0, state.cursor.y + state.cursor.mb);
        if (this.trial) {
          this.trial.failed = true;
          return false;
        }
        return this.newPage(i, 0, state.strip.y + state.strip.mb, 0);
      }
      state.onBox.push({ block: i, before: state.cursor, strip: state.strip });
      const { cursor, strip } = state;
      const top = cursor.empty
        ? cursor.y + block.marginTop
        : cursor.y + Math.max(cursor.mb, block.marginTop);
      const natural = strip.y + Math.max(strip.mb, block.marginTop);
      // A page's first block stands where the page's spacer takes the strip.
      const startsPage = state.page.block === i && state.page.line === 0 && !state.page.carried;
      if (!startsPage) {
        if (Math.abs(top - natural) > SAME_PX)
          this.setSpacer(i, top - strip.y - strip.mb - block.marginTop);
        else this.dropSpacer(i);
      }
      state.placed = {
        block: i,
        strip,
        top,
        column: state.region?.column ?? 0,
        atPageTop: cursor.empty && cursor.y === 0 && (state.region?.column ?? 0) === 0,
      };
      state.cross = null;
    }
    const s = state.s;
    const { cursor } = state;
    const blockTop = s === 0 ? state.placed!.top : cursor.y - lines[s]!.top;
    const bottomOf = (k: number) =>
      blockTop + (k === lines.length - 1 ? block.height : lines[k]!.bottom);
    const foot = this.foot;
    let fit = 0;
    while (s + fit < lines.length && bottomOf(s + fit) <= foot + FIT_TOLERANCE_PX) fit++;
    // A page break inside the paragraph starts the next page at the line after it.
    const forced = block.forced?.find((line) => line > s && line < lines.length);
    if (forced !== undefined && s + fit >= forced) {
      if (this.trial) {
        this.trial.failed = true;
        return false;
      }
      return this.newPage(i, forced, blockTop + lines[forced]!.top, 0);
    }
    // A column break inside the paragraph starts the next column (or page) at the line after it.
    const columnForced = block.columnForced?.find((line) => line > s && line < lines.length);
    if (columnForced !== undefined && s + fit >= columnForced) {
      const endY = blockTop + lines[columnForced]!.top;
      if (state.region) return this.nextBox(i, columnForced, endY);
      if (this.trial) {
        this.trial.failed = true;
        return false;
      }
      return this.newPage(i, columnForced, endY, 0);
    }
    const remaining = lines.length - s;
    if (fit === remaining) return this.finish(blockTop);
    let take = fit;
    if (block.atom || (block.keepTogether && s === 0)) take = 0;
    else if (block.widowControl) {
      if (remaining - take < 2) take = remaining - 2;
      if (take < 2) take = 0;
    }
    // A rule that would leave the box empty gives way.
    if (take <= 0 && cursor.empty) take = Math.max(fit, 1);
    if (take > 0) {
      const line = s + take;
      // The whole block in this box however tall (it fills an empty box).
      if (line >= lines.length) return this.finish(blockTop);
      return this.nextBox(i, line, blockTop + lines[line]!.top);
    }
    // The block moves on, with the run before it keeping with the next, unless that run fills the box from its top.
    const { onBox } = state;
    let k = onBox.length - 1;
    while (
      k > 0 &&
      onBox[k - 1]!.block === onBox[k]!.block - 1 &&
      blocks[onBox[k - 1]!.block]!.keepWithNext
    )
      k -= 1;
    const moved = onBox[k]!.before.empty ? onBox[onBox.length - 1]! : onBox[k]!;
    for (let b = moved.block; b <= i; b++) this.dropSpacer(b);
    state.strip = moved.strip;
    state.cursor = moved.before;
    if (state.cross?.block === i) state.cross = null;
    return this.nextBox(moved.block, 0, moved.before.y + moved.before.mb);
  }

  // The block ends in this box.
  finish(blockTop: number): boolean {
    const state = this.state;
    const block = this.blocks[state.i]!;
    const bottom = blockTop + block.height;
    state.cursor = { y: bottom, mb: block.marginBottom, empty: false };
    if (state.cross && state.cross.block === state.i) {
      // The strip stands at the foot of the box of columns, its margins none.
      state.strip = {
        y: (state.cross.rows === 1 ? state.cross.top : 0) + state.cross.height,
        mb: 0,
      };
      state.cross = null;
    } else state.strip = { y: bottom, mb: block.marginBottom };
    state.i += 1;
    state.s = 0;
    return false;
  }

  run(): Pagination {
    while (this.state.i < this.blocks.length) {
      if (this.step())
        return { starts: this.done, laidFrom: this.restart, settledAt: this.settledAt };
    }
    this.closeRegion();
    this.done.push(frozen(this.state.page));
    return { starts: this.done, laidFrom: this.restart, settledAt: null };
  }
}

/**
 * The pages for these blocks. Given what changed since a previous layout, it lays out from shortly before the change
 * and stops at the first page after it that starts where it started before, taking the rest from before.
 */
export function paginate(
  blocks: readonly BlockMetrics[],
  frameOf: (block: number) => PageFrame,
  change?: LayoutChange,
  options: PaginateOptions = {},
): Pagination {
  return new Engine(blocks, frameOf, change, options).run();
}
