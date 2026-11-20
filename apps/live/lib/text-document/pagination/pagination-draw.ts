// What the layout draws (docs/specs/034-text-documents/page-layout.md "Laying out", "Columns"): the spacers that take
// the drawn writing from where it stands to where the layout places the next block (back up too, to a column's top),
// the column each block of a region is in, a paragraph drawn as a box of columns across them, and each page's size
// with its lines between columns. Spacers are never text and never read.
import type { Cross, PageFrame, Pagination } from './pagination';
import { PAGE_GAP_CLASS } from './pagination-measure';

/** What a box of columns draws inside its paragraph: the room before its first line, and each column's start. */
export const COLUMN_MARK_CLASS = 'text-document-column-mark';
/** A paragraph drawn as a box of columns. */
export const COLUMN_CROSS_CLASS = 'text-document-column-cross';

/** A page's size in CSS pixels, and the lines between its columns (page coordinates). */
export type PageGeometry = {
  readonly width: number;
  readonly height: number;
  readonly rules?: readonly {
    readonly top: number;
    readonly bottom: number;
    readonly xs: readonly number[];
  }[];
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The spacer between blocks: `height` down, or back up when negative. Its margins never join the blocks': a spacer
 * of height `h` puts the next block `h` below where the block before it ends with its space after.
 */
export function blockSpacer(height: number): () => HTMLElement {
  return () => {
    const gap = document.createElement('div');
    gap.className = PAGE_GAP_CLASS;
    gap.setAttribute('aria-hidden', 'true');
    gap.contentEditable = 'false';
    if (height >= 0) gap.style.height = `${height}px`;
    else {
      // A pixel high so the margins around it add up rather than join, and that pixel taken back too.
      gap.style.height = '1px';
      gap.style.marginTop = `${height - 1}px`;
    }
    return gap;
  };
}

/** What a box of columns draws before its first line: an empty stretch per column before its own, then its lead. */
export function crossLead(cross: Cross): () => HTMLElement {
  return () => {
    const lead = document.createElement('span');
    lead.className = COLUMN_MARK_CLASS;
    lead.setAttribute('aria-hidden', 'true');
    lead.contentEditable = 'false';
    for (let c = 0; c < cross.column; c++) {
      const full = document.createElement('span');
      full.dataset.full = '';
      lead.append(full);
    }
    const own = document.createElement('span');
    own.style.height = `${round(cross.lead)}px`;
    lead.append(own);
    return lead;
  };
}

/** Where a box of columns starts its next column, inside the paragraph. */
export function crossSplit(): HTMLElement {
  const split = document.createElement('span');
  split.className = `${COLUMN_MARK_CLASS} ${COLUMN_MARK_CLASS}-split`;
  split.setAttribute('aria-hidden', 'true');
  split.contentEditable = 'false';
  return split;
}

/** The attributes that draw a paragraph as a box of columns. */
export const crossAttrs = (cross: Cross): Record<string, string> => ({
  class: COLUMN_CROSS_CLASS,
  ...(cross.rows > 1 ? { 'data-cross-rows': String(cross.rows) } : {}),
  style: [
    `--cross-count: ${cross.count}`,
    `--cross-height: ${round(cross.height)}px`,
    `--cross-row-gap: ${round(cross.rowGap)}px`,
  ].join('; '),
});

/**
 * The column each block of a region is in, past the first, by block: from each page's column starts, back to the
 * first column where a page or another section begins. A paragraph drawn across columns has none of its own.
 */
export function columnPlaces(
  pagination: Pagination,
  sectionOf: readonly number[],
  blockCount: number,
): Map<number, number> {
  const places = new Map<number, number>();
  const { starts } = pagination;
  const crossing = new Set(starts.flatMap((s) => (s.crosses ?? []).map((c) => c.block)));
  starts.forEach((start, q) => {
    const next = starts[q + 1];
    const last = next ? (next.line > 0 ? next.block : next.block - 1) : blockCount - 1;
    const byBlock = new Map<number, { line: number; column: number }[]>();
    for (const c of start.columns ?? []) byBlock.set(c.block, [...(byBlock.get(c.block) ?? []), c]);
    let column = 0;
    let section = sectionOf[start.block];
    for (let b = start.block; b <= last; b++) {
      if (sectionOf[b] !== section) {
        column = 0;
        section = sectionOf[b];
      }
      let after: number | undefined;
      for (const c of byBlock.get(b) ?? []) {
        if (c.line === 0) column = c.column;
        else after = c.column;
      }
      const continued = b === start.block && start.line > 0;
      if (column > 0 && !continued && !crossing.has(b)) places.set(b, column);
      if (after !== undefined) column = after;
    }
  });
  return places;
}

/** Each page's size in CSS pixels, blank pages too, each by the section of the block it starts with; its lines. */
export function pagesOf(
  pagination: Pagination,
  frameOf: (block: number) => PageFrame,
  lineBetween: (block: number) => boolean = () => false,
): PageGeometry[] {
  const pages: PageGeometry[] = [];
  for (const start of pagination.starts) {
    const frame = frameOf(start.block);
    const size = { width: round(frame.width), height: round(frame.height) };
    for (let blank = 0; blank < start.blank; blank++) pages.push(size);
    const rules = (start.rules ?? []).flatMap((rule) => {
      const own = frameOf(rule.block);
      const columns = own.columns;
      if (!columns || !lineBetween(rule.block) || rule.bottom <= rule.top) return [];
      // Each line in the middle of a gap, from the page's left edge.
      const xs = Array.from({ length: columns.count - 1 }, (_, c) =>
        round(own.left + (c + 1) * columns.width + c * columns.gap + columns.gap / 2),
      );
      return [{ top: round(own.top + rule.top), bottom: round(own.top + rule.bottom), xs }];
    });
    pages.push(rules.length > 0 ? { ...size, rules } : size);
  }
  return pages;
}

/** A page list's signature: told again only when a size or a line changes. */
export const pagesSaid = (pages: readonly PageGeometry[]): string =>
  pages
    .map(
      (p) =>
        `${p.width}x${p.height}${(p.rules ?? []).map((r) => `|${r.top}-${r.bottom}@${r.xs.join(',')}`).join('')}`,
    )
    .join(',');
