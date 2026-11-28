// What the layout draws (docs/specs/034-text-documents/page-layout.md "Laying out", "Columns"): the spacers that take
// the drawn writing from where it stands to where the layout places the next block (back up too, to a column's top),
// the column each block of a region is in, a paragraph drawn as a box of columns across them, and each page's size
// with its lines between columns, its header and its footer. Spacers are never text and never read.
import { DOMSerializer, type Node as PmNode } from 'prosemirror-model';
import {
  type Cross,
  type HeaderFooterSlot,
  PAGE_GAP_PX,
  type PageFrame,
  type Pagination,
} from '@livedoc/text-documents';
import type { PageLayout, PageStory, StoryPlace } from './pagination-headers';
import type { PageNote } from './pagination-notes';
import type { LineNumberMark } from './pagination-line-numbers';
import { PAGE_GAP_CLASS } from './pagination-measure';

/** What a box of columns draws inside its paragraph: the room before its first line, and each column's start. */
export const COLUMN_MARK_CLASS = 'text-document-column-mark';
/** A paragraph drawn as a box of columns. */
export const COLUMN_CROSS_CLASS = 'text-document-column-cross';

/** A page's size in CSS pixels, the lines between its columns, its header and footer (page coordinates). */
export type PageGeometry = {
  readonly width: number;
  readonly height: number;
  readonly header?: PageStory;
  readonly footer?: PageStory;
  /** Its section and the header slot it shows (none on a blank page, or without headers laid out). */
  readonly section?: number;
  readonly slot?: HeaderFooterSlot;
  /** It is its section's first page. */
  readonly first?: boolean;
  /** Where its header and footer stand, shown or not (none on a blank page). */
  readonly place?: StoryPlace;
  /** Its top and bottom margins as drawn, pushed by a tall header or footer (none on a blank page). */
  readonly top?: number;
  readonly bottom?: number;
  /** The number it shows, and the page count (page-layout.md "Page numbers"); none on a blank page. */
  readonly number?: number;
  readonly count?: number;
  /** The notes its marks bring, drawn at its foot (page-layout.md "Footnotes"); none on a blank page. */
  readonly notes?: readonly PageNote[];
  /** Its lines' numbers, in its left margin (page-layout.md "Line numbers"); none on a blank page. */
  readonly lines?: readonly LineNumberMark[];
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

/** The heights of a page edge's bands: the page's foot and the next page's head; the ground between is fixed. */
export type GapBands = { readonly foot: number; readonly head: number };
/** Where a page edge is drawn across: from the block's left edge back to the page's, and the page's width. */
export type GapAcross = { readonly left: number; readonly width: number };

// The page's foot, the ground and the next page's head, over the block's own background and borders, across the page.
function appendBands(gap: HTMLElement, bands: GapBands, across: GapAcross): void {
  for (const [band, size] of [
    ['paper', bands.foot],
    ['ground', PAGE_GAP_PX],
    ['paper', bands.head],
  ] as const) {
    const part = document.createElement('span');
    part.className = `${PAGE_GAP_CLASS}-${band}`;
    part.style.height = `${Math.max(0, size)}px`;
    part.style.marginLeft = `${-across.left}px`;
    part.style.width = `${across.width}px`;
    gap.append(part);
  }
}

/** The spacer inside a paragraph, `height` high: the page edge between two of its lines. */
export function lineGap(height: number, bands: GapBands, across: GapAcross): () => HTMLElement {
  return () => {
    const gap = document.createElement('span');
    gap.className = `${PAGE_GAP_CLASS} ${PAGE_GAP_CLASS}-inside`;
    gap.setAttribute('aria-hidden', 'true');
    gap.contentEditable = 'false';
    gap.style.height = `${height}px`;
    appendBands(gap, bands, across);
    return gap;
  };
}

/**
 * The spacer inside a table, `height` high: the page edge between two of its rows, a row of one cell across its
 * `columns` (tables.md "Laying out across pages").
 */
export function rowGap(
  height: number,
  bands: GapBands,
  across: GapAcross,
  columns: number,
): () => HTMLElement {
  return () => {
    const gap = document.createElement('tr');
    gap.className = `${PAGE_GAP_CLASS} ${PAGE_GAP_CLASS}-row`;
    gap.setAttribute('aria-hidden', 'true');
    gap.contentEditable = 'false';
    const cell = document.createElement('td');
    cell.colSpan = Math.max(1, columns);
    const inside = document.createElement('div');
    inside.className = `${PAGE_GAP_CLASS}-inside`;
    inside.style.height = `${height}px`;
    appendBands(inside, bands, across);
    cell.append(inside);
    gap.append(cell);
    return gap;
  };
}

/** What a row breaking across pages draws in its first broken cell: the page's edge, and the header rows under it. */
export type CellEdge = {
  readonly bands: GapBands;
  readonly across: GapAcross;
  /** The table's header rows as a table, and how far its left edge is left of the cell's writing, in CSS pixels. */
  readonly header?: { readonly table: PmNode; readonly left: number };
};

/**
 * The spacer inside a cell of a row breaking across pages, `height` high (tables.md "Laying out across pages"): in one
 * cell the page's edge across the page and the header rows repeated under it, raised over the row's cells; in the
 * others plain room, so each cell's writing goes on at the next page's top.
 */
export function cellGap(height: number, edge?: CellEdge): () => HTMLElement {
  return () => {
    const gap = document.createElement('span');
    gap.className = `${PAGE_GAP_CLASS} ${PAGE_GAP_CLASS}-inside ${PAGE_GAP_CLASS}-cell`;
    gap.setAttribute('aria-hidden', 'true');
    gap.contentEditable = 'false';
    gap.style.height = `${height}px`;
    // Room beside the edge, at the same place: the layout counts the edge's alone.
    if (!edge) gap.classList.add(`${PAGE_GAP_CLASS}-twin`);
    if (edge) {
      appendBands(gap, edge.bands, edge.across);
      if (edge.header) {
        const copy = DOMSerializer.fromSchema(edge.header.table.type.schema).serializeNode(
          edge.header.table,
        ) as HTMLElement;
        copy.classList.add(`${PAGE_GAP_CLASS}-header`);
        copy.style.marginLeft = `${-edge.header.left}px`;
        gap.append(copy);
      }
    }
    return gap;
  };
}

/**
 * A table's header row drawn again at the top of a page the table continues on, after its page edge (tables.md
 * "Laying out across pages"): a row of the table as the schema draws it, hidden from reading and never text.
 */
export function headerCopy(row: PmNode): () => HTMLElement {
  return () => {
    const copy = DOMSerializer.fromSchema(row.type.schema).serializeNode(row) as HTMLElement;
    copy.classList.add(PAGE_GAP_CLASS, `${PAGE_GAP_CLASS}-header`);
    copy.setAttribute('aria-hidden', 'true');
    copy.contentEditable = 'false';
    return copy;
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

/** Each page's number, by its start: every page laid out before it counts, blank ones too. */
export function pageNumbers(pagination: Pagination): number[] {
  let number = 0;
  return pagination.starts.map((start) => (number += 1 + start.blank));
}

/**
 * Each page's size in CSS pixels, blank ones too, each by the section of the block it starts with; its lines between
 * columns from its own text area's top; its header and footer (none on a blank page).
 */
export function pageGeometries(
  pagination: Pagination,
  input: {
    readonly frameOf: (block: number) => PageFrame;
    readonly page?: Pick<PageLayout, 'frameOf' | 'storiesOf'>;
    readonly lineBetween?: (block: number) => boolean;
    /** Each page's number as shown, by its start; its physical number when none is given. */
    readonly shown?: readonly number[];
    /** Each page's notes, by its start. */
    readonly notes?: readonly (readonly PageNote[])[];
  },
): PageGeometry[] {
  const { frameOf, page, lineBetween = () => false } = input;
  const numbers = pageNumbers(pagination);
  const count = numbers.at(-1) ?? 0;
  const pages: PageGeometry[] = [];
  for (const [q, start] of pagination.starts.entries()) {
    const number = numbers[q]!;
    const frame = page ? page.frameOf(start.block, start.line, number) : frameOf(start.block);
    const size = { width: round(frame.width), height: round(frame.height) };
    for (let blank = 0; blank < start.blank; blank++) pages.push(size);
    const stories = page ? page.storiesOf(start.block, start.line, number) : null;
    const rules = (start.rules ?? []).flatMap((rule) => {
      const own = frameOf(rule.block);
      const columns = own.columns;
      if (!columns || !lineBetween(rule.block) || rule.bottom <= rule.top) return [];
      // Each line in the middle of a gap, from the page's left edge.
      const xs = Array.from({ length: columns.count - 1 }, (_, c) =>
        round(own.left + (c + 1) * columns.width + c * columns.gap + columns.gap / 2),
      );
      return [{ top: round(frame.top + rule.top), bottom: round(frame.top + rule.bottom), xs }];
    });
    pages.push({
      ...size,
      number: input.shown?.[q] ?? number,
      count,
      top: round(frame.top),
      bottom: round(frame.bottom),
      ...(stories
        ? {
            section: stories.section,
            slot: stories.slot,
            first: stories.first,
            place: stories.place,
            ...(stories.header ? { header: stories.header } : {}),
            ...(stories.footer ? { footer: stories.footer } : {}),
          }
        : {}),
      ...(rules.length > 0 ? { rules } : {}),
      ...(input.notes?.[q]?.length ? { notes: input.notes[q] } : {}),
    });
  }
  return pages;
}

const storySaid = (s: PageStory | undefined) =>
  s ? `${s.key}:${round(s.left)}:${round(s.margin)}` : '';

/** A page list's signature: told again only when a size, a line, a header or a footer changes. */
export const pagesSaid = (pages: readonly PageGeometry[]): string =>
  pages
    .map(
      (p) =>
        `${p.width}x${p.height}${(p.rules ?? []).map((r) => `|${r.top}-${r.bottom}@${r.xs.join(',')}`).join('')}` +
        `|h${storySaid(p.header)}|f${storySaid(p.footer)}|${p.section}:${p.slot}:${p.top}:${p.bottom}#${p.number}` +
        (p.notes ?? []).map((n) => `|n${n.number}:${n.key}:${round(n.left)}`).join('') +
        (p.lines ?? [])
          .map((l) => `|l${l.number}:${round(l.top)}+${round(l.height)}:${round(l.right)}`)
          .join(''),
    )
    .join(',');
