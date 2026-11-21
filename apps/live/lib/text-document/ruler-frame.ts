// The frame the ruler measures in (docs/specs/034-text-documents/editing-surface.md "The ruler", "In a section of
// columns"): the text area cut into the section's columns, the caret's column, and that column's start and end, from
// which its indents and tab stops are measured. Lengths are points from the page's left edge.
import { Columns, type Margins, type PageSetup } from '@livedoc/text-documents';

export type RulerSpan = { readonly start: number; readonly end: number };

export type RulerFrame = {
  readonly width: number;
  readonly margins: Margins;
  readonly spans: readonly RulerSpan[];
  /** The caret's column, counted from 0. */
  readonly column: number;
  /** The caret's column's start: the ruler's zero. */
  readonly origin: number;
  /** The caret's column's end. */
  readonly end: number;
};

/** The text area as the section's columns cut it; one span pageless or with one column. */
export function rulerSpans(setup: PageSetup, pageless: boolean): RulerSpan[] {
  const { count, gap } = pageless ? { count: 1, gap: 0 } : Columns.of(setup);
  const width = count > 1 ? Columns.width(setup) : Columns.textWidth(setup);
  return Array.from({ length: count }, (_, c) => {
    const start = setup.margins.left + c * (width + gap);
    return { start, end: start + width };
  });
}

/** The column a point falls in; in a gap the nearer, before the first or past the last that one. */
export function columnAt(spans: readonly RulerSpan[], pt: number): number {
  let best = 0;
  let distance = Infinity;
  spans.forEach(({ start, end }, c) => {
    const away = pt < start ? start - pt : pt > end ? pt - end : 0;
    if (away < distance) {
      best = c;
      distance = away;
    }
  });
  return best;
}

/** The ruler's frame at the caret's column, clamped to the section's count. */
export function rulerFrame(setup: PageSetup, pageless: boolean, column: number): RulerFrame {
  const spans = rulerSpans(setup, pageless);
  const at = Math.min(Math.max(column, 0), spans.length - 1);
  const span = spans[at]!;
  return {
    width: setup.width,
    margins: setup.margins,
    spans,
    column: at,
    origin: span.start,
    end: span.end,
  };
}
