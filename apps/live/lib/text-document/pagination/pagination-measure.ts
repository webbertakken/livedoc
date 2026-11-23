// The writing measured for laying out (docs/specs/034-text-documents/page-layout.md "Laying out"): a block's box,
// margins and lines in CSS pixels as if no page spacer were inside it (a table's lines its rows), its keep rules from
// its style and its own formatting, and the place in a paragraph where one of its lines starts. Reads the drawn page; writes nothing.
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
  KEPT_BLOCK,
  SECTION_BREAK,
  Styles,
  TABLE,
  type ParagraphProps,
  type SectionStart,
} from '@livedoc/text-documents';
import type { TextFormatting } from '../text-document-formatting';
import type { BlockMetrics } from './pagination';
import { PLACED_PICTURE_CLASS, PLACED_ROOM_CLASS } from '../text-document-picture-placed';
import { groupLines, holdLines, naturalOf, withoutSpacers, type Span } from './pagination-lines';
import type { NoteMark } from './pagination-notes';
import { measuringRange } from './pagination-range';
import { measureTable, type TableLine } from './pagination-tables';

/** A page spacer's class: between blocks, or inside a paragraph between two of its lines. */
export const PAGE_GAP_CLASS = 'text-document-page-gap';

// A Word page or column break kept from the file, drawn as a line break (text-document-schema.ts).
const PAGE_BREAK_MARK = 'br[data-page-break]';
const COLUMN_BREAK_MARK = 'br[data-column-break]';
// A footnote's mark (text-document-schema.ts), naming its note's story.
const NOTE_MARK = 'sup[data-footnote]';

/** A block's rules, and a table's node: its header rows repeat, and its rows may or may not break. */
export type BlockRules = { readonly table?: PmNode } & Pick<
  BlockMetrics,
  | 'atom'
  | 'keepWithNext'
  | 'keepTogether'
  | 'widowControl'
  | 'breakBefore'
  | 'columnBreakBefore'
  | 'startsSection'
>;

const SECTION_STARTS: readonly SectionStart[] = [
  'next-page',
  'continuous',
  'even-page',
  'odd-page',
];

/**
 * How a block moves between pages: a paragraph by its keep rules, a section break and kept content whole, a table
 * between its rows, or whole in a section of columns (`inColumns`; tables.md "Laying out across pages").
 */
export function rulesOf(node: PmNode, formatting: TextFormatting, inColumns = false): BlockRules {
  if (node.type.name === TABLE) {
    return inColumns ? { atom: true } : { table: node };
  }
  if (node.type.name === SECTION_BREAK) {
    const start = (node.attrs as { start: unknown }).start;
    return {
      atom: true,
      startsSection: SECTION_STARTS.includes(start as SectionStart)
        ? (start as SectionStart)
        : 'next-page',
    };
  }
  if (node.type.name === KEPT_BLOCK || node.type.name !== 'paragraph') return { atom: true };
  const attrs = node.attrs as { style: string | null; props: ParagraphProps | null };
  const style = attrs.style ?? Styles.idOfRole(formatting.styles, 'normal');
  const props = {
    ...Styles.paragraphPropsOf(formatting.styles, formatting.defaults, style),
    ...attrs.props,
  };
  return {
    ...(props.keepWithNext ? { keepWithNext: true } : {}),
    ...(props.keepTogether ? { keepTogether: true } : {}),
    ...(props.widowControl ? { widowControl: true } : {}),
    ...(props.pageBreakBefore ? { breakBefore: true } : {}),
    ...(props.columnBreakBefore ? { columnBreakBefore: true } : {}),
  };
}

const px = (value: string) => Number.parseFloat(value) || 0;

// What is drawn out of a paragraph's lines (objects.md "In the editor"): a placed picture and its room.
const PLACED = `.${PLACED_PICTURE_CLASS}, .${PLACED_ROOM_CLASS}`;

// The rectangles of a paragraph's lines: its contents, less what is placed out of them.
function lineRects(element: HTMLElement): DOMRect[] {
  const range = measuringRange(element.ownerDocument);
  const placed = [...element.querySelectorAll(PLACED)].filter(
    (e) => !e.parentElement?.closest(PLACED),
  );
  if (placed.length === 0) {
    range.selectNodeContents(element);
    return [...range.getClientRects()];
  }
  const rects: DOMRect[] = [];
  range.setStart(element, 0);
  for (const e of placed) {
    range.setEndBefore(e);
    rects.push(...range.getClientRects());
    range.setStartAfter(e);
  }
  range.setEnd(element, element.childNodes.length);
  rects.push(...range.getClientRects());
  return rects;
}

// The foot of the lowest room a paragraph holds for its Wrap and Break pictures, from its top; 0 for none.
function roomsFoot(element: HTMLElement, top: number, ratio: number, spacers: readonly Span[]) {
  let foot = 0;
  for (const room of element.querySelectorAll<HTMLElement>(`:scope > .${PLACED_ROOM_CLASS}`))
    foot = Math.max(foot, naturalOf((room.getBoundingClientRect().bottom - top) / ratio, spacers));
  return foot;
}

// The page spacers inside an element, from its top, in CSS pixels.
function spacersIn(element: HTMLElement, top: number, ratio: number): Span[] {
  // A row breaking across pages has a gap in each cell going on; they stand level, so one is counted.
  return [
    ...element.querySelectorAll<HTMLElement>(`.${PAGE_GAP_CLASS}:not(.${PAGE_GAP_CLASS}-twin)`),
  ].map((spacer) => {
    const r = spacer.getBoundingClientRect();
    return { top: (r.top - top) / ratio, bottom: (r.bottom - top) / ratio };
  });
}

/**
 * A block as the layout reads it. `ratio` is client pixels per CSS pixel (the page's zoom); `left` the text area's
 * left edge in client pixels, from which its inset is read.
 */
export function measureBlock(
  element: HTMLElement,
  rules: BlockRules,
  ratio: number,
  left: number,
): { metrics: BlockMetrics; inset: number; marks: NoteMark[]; places?: TableLine[] } {
  const { table, ...own } = rules;
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const spacers = spacersIn(element, box.top, ratio);
  const height = box.height / ratio - spacers.reduce((sum, s) => sum + s.bottom - s.top, 0);
  let lines: BlockMetrics['lines'] = [];
  const forced: number[] = [];
  const columnForced: number[] = [];
  let breakAfter = false;
  let columnBreakAfter = false;
  const marks: NoteMark[] = [];
  let repeat: BlockMetrics['repeat'];
  let held: number[] = [];
  let places: TableLine[] | undefined;
  if (!rules.atom && element instanceof HTMLTableElement) {
    ({ lines, repeat, held, places } = measureTable(
      element,
      box.top,
      ratio,
      spacers,
      height,
      PAGE_GAP_CLASS,
      table,
    ));
    marks.push(...noteMarks(element, box.top, ratio, spacers, lines));
  } else if (!rules.atom) {
    const rects = lineRects(element).map((r) => ({
      top: (r.top - box.top) / ratio,
      bottom: (r.bottom - box.top) / ratio,
    }));
    lines = holdLines(
      groupLines(
        withoutSpacers(rects, spacers),
        px(style.borderTopWidth) + px(style.paddingTop),
        height - px(style.borderBottomWidth) - px(style.paddingBottom),
      ),
      roomsFoot(element, box.top, ratio, spacers),
    );
    // A Word page or column break starts the page or column at the line after its own, or the next block when it
    // ends the paragraph.
    const lineOf = (mark: Element): number | null => {
      const r = mark.getBoundingClientRect();
      const middle = naturalOf(((r.top + r.bottom) / 2 - box.top) / ratio, spacers);
      const own = lines.findIndex((line) => middle >= line.top && middle < line.bottom);
      return own >= 0 ? own : null;
    };
    const lineAfter = (mark: Element): number | null => {
      const own = lineOf(mark);
      return own !== null && own + 1 < lines.length ? own + 1 : null;
    };
    for (const mark of element.querySelectorAll(PAGE_BREAK_MARK)) {
      const line = lineAfter(mark);
      if (line !== null) forced.push(line);
      else breakAfter = true;
    }
    for (const mark of element.querySelectorAll(COLUMN_BREAK_MARK)) {
      const line = lineAfter(mark);
      if (line !== null) columnForced.push(line);
      else columnBreakAfter = true;
    }
    marks.push(...noteMarks(element, box.top, ratio, spacers, lines));
  }
  return {
    metrics: {
      height,
      marginTop: px(style.marginTop),
      marginBottom: px(style.marginBottom),
      lines,
      ...(forced.length > 0 ? { forced } : {}),
      ...(breakAfter ? { breakAfter } : {}),
      ...(columnForced.length > 0 ? { columnForced } : {}),
      ...(columnBreakAfter ? { columnBreakAfter } : {}),
      ...(repeat ? { repeat } : {}),
      ...(held.length > 0 ? { held } : {}),
      ...own,
    },
    inset: (box.left - left) / ratio,
    marks,
    ...(places ? { places } : {}),
  };
}

// Each footnote's mark on its own line (page-layout.md "Footnotes").
function noteMarks(
  element: HTMLElement,
  top: number,
  ratio: number,
  spacers: readonly Span[],
  lines: BlockMetrics['lines'],
): NoteMark[] {
  const marks: NoteMark[] = [];
  for (const mark of element.querySelectorAll<HTMLElement>(NOTE_MARK)) {
    // A copy of a table's header rows drawn at a page's top is no mark of its own.
    if (mark.closest(`.${PAGE_GAP_CLASS}`)) continue;
    const r = mark.getBoundingClientRect();
    const middle = naturalOf(((r.top + r.bottom) / 2 - top) / ratio, spacers);
    // Raised above its line, a mark is on the last line starting above its middle.
    const line = Math.max(
      0,
      lines.findLastIndex((l) => l.top <= middle),
    );
    const story = mark.dataset.footnote;
    if (story) marks.push({ line, story });
  }
  return marks;
}

// A caret's top within this much of a line's top is on that line, in client pixels.
const LINE_TOLERANCE_PX = 1;

/**
 * Where in the paragraph at `pos` the line starting `lineTop` (CSS pixels from its top, without spacers) begins: the
 * first place whose character is drawn on that line or below.
 */
export function splitPosition(
  view: EditorView,
  pos: number,
  node: PmNode,
  element: HTMLElement,
  lineTop: number,
  ratio: number,
): number {
  const box = element.getBoundingClientRect();
  const spacers = spacersIn(element, box.top, ratio);
  // The line's top on the page now: spacers above it in the paragraph push it down.
  let drawn = lineTop;
  for (const s of spacers)
    if (naturalOf(s.top, spacers) <= lineTop + 0.5) drawn += s.bottom - s.top;
  const target = box.top + drawn * ratio - LINE_TOLERANCE_PX;
  let lo = pos + 1;
  let hi = pos + node.nodeSize - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (view.coordsAtPos(mid, 1).top >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
