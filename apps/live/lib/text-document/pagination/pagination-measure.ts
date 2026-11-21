// The writing measured for laying out (docs/specs/034-text-documents/page-layout.md "Laying out"): a block's box,
// margins and lines in CSS pixels as if no page spacer were inside it, its keep rules from its style and its own
// formatting, and the place in a paragraph where one of its lines starts. Reads the drawn page; writes nothing.
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
  KEPT_BLOCK,
  SECTION_BREAK,
  Styles,
  type ParagraphProps,
  type SectionStart,
} from '@livedoc/text-documents';
import type { TextFormatting } from '../text-document-formatting';
import type { BlockMetrics } from './pagination';
import { groupLines, naturalOf, withoutSpacers, type Span } from './pagination-lines';

/** A page spacer's class: between blocks, or inside a paragraph between two of its lines. */
export const PAGE_GAP_CLASS = 'text-document-page-gap';

// A Word page or column break kept from the file, drawn as a line break (text-document-schema.ts).
const PAGE_BREAK_MARK = 'br[data-page-break]';
const COLUMN_BREAK_MARK = 'br[data-column-break]';

export type BlockRules = Pick<
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

/** How a block moves between pages: a paragraph by its keep rules, a section break and kept content whole. */
export function rulesOf(node: PmNode, formatting: TextFormatting): BlockRules {
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

// The page spacers inside an element, from its top, in CSS pixels.
function spacersIn(element: HTMLElement, top: number, ratio: number): Span[] {
  return [...element.querySelectorAll<HTMLElement>(`.${PAGE_GAP_CLASS}`)].map((spacer) => {
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
): { metrics: BlockMetrics; inset: number } {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const spacers = spacersIn(element, box.top, ratio);
  const height = box.height / ratio - spacers.reduce((sum, s) => sum + s.bottom - s.top, 0);
  let lines: BlockMetrics['lines'] = [];
  const forced: number[] = [];
  const columnForced: number[] = [];
  let breakAfter = false;
  let columnBreakAfter = false;
  if (!rules.atom) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].map((r) => ({
      top: (r.top - box.top) / ratio,
      bottom: (r.bottom - box.top) / ratio,
    }));
    lines = groupLines(
      withoutSpacers(rects, spacers),
      px(style.borderTopWidth) + px(style.paddingTop),
      height - px(style.borderBottomWidth) - px(style.paddingBottom),
    );
    // A Word page or column break starts the page or column at the line after its own, or the next block when it
    // ends the paragraph.
    const lineAfter = (mark: Element): number | null => {
      const r = mark.getBoundingClientRect();
      const middle = naturalOf(((r.top + r.bottom) / 2 - box.top) / ratio, spacers);
      const own = lines.findIndex((line) => middle >= line.top && middle < line.bottom);
      return own >= 0 && own + 1 < lines.length ? own + 1 : null;
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
      ...rules,
    },
    inset: (box.left - left) / ratio,
  };
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
