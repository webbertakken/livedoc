// A document tab's body as a page preview lays it out (docs/specs/034-text-documents/agents-and-sync.md "Page
// previews"): each block measured as the editor's layout reads one (`BlockMetrics`), from lines broken by the bundled
// faces' widths, with what to draw of it. Paragraphs, tables of them, inline pictures as boxes and section breaks;
// what a preview does not draw takes no room. Lengths in CSS pixels. Pure.
import type { Block, Paragraph } from '../model/blocks';
import { ListMarkers, type ListMarker } from '../model/list-markers';
import type { BorderLine, ParagraphProps, TextProps } from '../model/props';
import { Columns, type PageSetup, type Section } from '../model/sections';
import { Styles } from '../model/styles';
import type { Table } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import type { BlockMetrics } from '../pagination/pagination';
import { DocumentFonts } from '@livedoc/document';
import { PREVIEW_ADVANCES } from './preview-advances';
import { breakLines, type Look, type Piece, type Placed } from './preview-lines';

const PX_PER_PT = 96 / 72;
/** A line's height over its largest size when the paragraph gives no spacing (default: CSS's normal for Arial). */
export const PREVIEW_LINE_HEIGHT = 1.2;
/** A run's font when nothing gives one: Google's. */
const DEFAULT_FONT = 'Arial';
/** A paragraph's size when nothing gives one, in points: Google's Normal text. */
const DEFAULT_SIZE_PT = 11;
/** A list level's indent and hanging when its list gives none, in points: 0.5 in a level, as Google's lists. */
const LIST_INDENT_PT = 36;
const LIST_HANGING_PT = 18;
/** Super- and subscript are drawn at this share of the size. */
const SCRIPT_SHARE = 0.65;

/** A line as drawn: its top and height within its block or cell, its baseline, and its pieces from `x`. */
export type DrawnLine = {
  readonly top: number;
  readonly height: number;
  readonly baseline: number;
  readonly x: number;
  readonly pieces: readonly Placed[];
};

/** A paragraph border as drawn: its width, colour and its distance from the writing, in pixels. */
export type DrawnBorder = {
  readonly width: number;
  readonly color: string;
  readonly space: number;
};

export type DrawnMarker = { readonly marker: ListMarker; readonly x: number; readonly look: Look };

/** A cell's box, from the table's left, and its lines from the box. */
export type DrawnCell = {
  readonly x: number;
  readonly width: number;
  /** How many rows it covers, its own first. */
  readonly rows: number;
  readonly background?: string;
  readonly lines: readonly DrawnLine[];
};

export type DrawnRow = {
  readonly top: number;
  readonly height: number;
  readonly cells: readonly DrawnCell[];
};

export type Drawn =
  | {
      readonly kind: 'paragraph';
      readonly lines: readonly DrawnLine[];
      readonly marker?: DrawnMarker;
      /** Its background, across the line between its indents (`#rrggbb`). */
      readonly shading?: string;
      /** Its top and bottom borders, widths in pixels. */
      readonly borders?: { readonly top?: DrawnBorder; readonly bottom?: DrawnBorder };
      /** Where its box starts and how wide it is, from the column's left. */
      readonly box?: { readonly x: number; readonly width: number };
    }
  | { readonly kind: 'table'; readonly x: number; readonly rows: readonly DrawnRow[] }
  | { readonly kind: 'none' };

export type PreviewBlock = {
  readonly metrics: BlockMetrics;
  /** The section it is laid out in, by its place among the tab's sections. */
  readonly section: number;
  readonly drawn: Drawn;
};

export type PreviewBody = {
  readonly blocks: readonly PreviewBlock[];
  readonly sections: readonly PageSetup[];
  /** Each block's place in the body (a table of contents' entries share their contents'). */
  readonly sources: readonly number[];
};

const px = (pt: number) => pt * PX_PER_PT;

/** The width a section's writing takes: one column's. */
export const textWidthOf = (setup: PageSetup): number =>
  px(
    Columns.of(setup).count > 1
      ? Columns.width(setup)
      : setup.width - setup.margins.left - setup.margins.right,
  );

// The face a run's lines break by: the served face the editor draws its font in, where the previews carry its widths.
function faceOf(font: string | undefined): string | undefined {
  const drawn = DocumentFonts.drawnIn(font ?? DEFAULT_FONT);
  return drawn !== undefined && Object.hasOwn(PREVIEW_ADVANCES, drawn) ? drawn : undefined;
}

function lookOf(props: TextProps): Look {
  const size = px(props.size ?? DEFAULT_SIZE_PT);
  const face = faceOf(props.font);
  const scripted = props.vertical === 'super' || props.vertical === 'sub';
  return {
    size: scripted ? size * SCRIPT_SHARE : size,
    ...(face ? { face } : {}),
    bold: props.bold === true,
    italic: props.italic === true,
    ...(props.underline ? { underline: true } : {}),
    ...(props.strike ? { strike: true } : {}),
    ...(props.color ? { color: props.color } : {}),
    ...(props.highlight ? { highlight: props.highlight } : {}),
    stack: DocumentFonts.stack(props.font ?? DEFAULT_FONT),
  };
}

type Context = { readonly doc: TextDocument };

const textPropsOf = (
  ctx: Context,
  paragraph: Paragraph,
  inline: { style?: string; props: TextProps },
) => ({
  ...Styles.textPropsOf(ctx.doc.styles, ctx.doc.defaults, paragraph.style, inline.style),
  ...paragraph.text,
  ...inline.props,
});

function piecesOf(ctx: Context, paragraph: Paragraph, width: number): Piece[] {
  // One look object a run, so its words join again on a line.
  const pieces: Piece[] = [];
  for (const inline of paragraph.inlines) {
    if (inline.type === 'run' || inline.type === 'field') {
      const look = lookOf(textPropsOf(ctx, paragraph, inline));
      const text = inline.props.transform === 'uppercase' ? inline.text.toUpperCase() : inline.text;
      if (text !== '') pieces.push({ kind: 'text', text, look });
    } else if (inline.type === 'picture' && inline.placement === undefined) {
      const scale = Math.min(1, width / Math.max(px(inline.width), 1));
      pieces.push({
        kind: 'box',
        width: px(inline.width) * scale,
        height: px(inline.height) * scale,
        alt: inline.alt ?? '',
      });
    }
  }
  return pieces;
}

function lineHeightOf(props: ParagraphProps, pieces: readonly Placed[], emptySize: number): number {
  const sizes = pieces.flatMap((p) => (p.kind === 'text' ? [p.look.size] : []));
  const boxes = pieces.flatMap((p) => (p.kind === 'box' ? [p.height] : []));
  const size = sizes.length > 0 ? Math.max(...sizes) : boxes.length > 0 ? 0 : emptySize;
  const rule = props.lineHeight;
  const text =
    rule === undefined
      ? size * PREVIEW_LINE_HEIGHT
      : rule.rule === 'multiple'
        ? size * rule.value
        : rule.rule === 'exact'
          ? px(rule.pt)
          : Math.max(px(rule.pt), size * PREVIEW_LINE_HEIGHT);
  return rule?.rule === 'exact' ? text : Math.max(text, ...boxes);
}

const baselineOf = (height: number, pieces: readonly Placed[], emptySize: number) => {
  const sizes = pieces.flatMap((p) => (p.kind === 'text' ? [p.look.size] : []));
  const size = sizes.length > 0 ? Math.max(...sizes) : emptySize;
  // The largest size's text sits centred in the line, its descent about a fifth of its size.
  return height - (height - size) / 2 - size * 0.2;
};

type Laid = {
  lines: DrawnLine[];
  height: number;
  props: ParagraphProps;
  indent: number;
  look: Look;
  box: { x: number; width: number };
};

// A paragraph's lines within `width`, its own indents and alignment applied.
function layParagraph(
  ctx: Context,
  paragraph: Paragraph,
  width: number,
  listIndent?: number,
): Laid {
  const props: ParagraphProps = {
    ...Styles.paragraphPropsOf(ctx.doc.styles, ctx.doc.defaults, paragraph.style),
    ...paragraph.props,
  };
  const look = lookOf(textPropsOf(ctx, paragraph, { props: {} }));
  const start = px(props.indentStart ?? listIndent ?? 0);
  const firstIndent = listIndent !== undefined ? 0 : px(props.indentFirst ?? 0);
  const room = Math.max(1, width - start - px(props.indentEnd ?? 0));
  const broken = breakLines(piecesOf(ctx, paragraph, room), Math.max(1, room - firstIndent), room);
  let top = 0;
  const lines = broken.map((line, n) => {
    const height = lineHeightOf(props, line.pieces, look.size);
    const indent = n === 0 ? firstIndent : 0;
    const spare = room - indent - line.width;
    const shift = props.align === 'center' ? spare / 2 : props.align === 'end' ? spare : 0;
    const drawn: DrawnLine = {
      top,
      height,
      baseline: top + baselineOf(height, line.pieces, look.size),
      x: start + indent + Math.max(0, shift),
      pieces: line.pieces,
    };
    top += height;
    return drawn;
  });
  return { lines, height: top, props, indent: start, look, box: { x: start, width: room } };
}

function paragraphBlock(
  ctx: Context,
  paragraph: Paragraph,
  width: number,
  marker: ListMarker | null,
  section: number,
): PreviewBlock {
  const level = paragraph.list
    ? ctx.doc.lists[paragraph.list.id]?.levels[paragraph.list.level]
    : undefined;
  const listIndent = paragraph.list
    ? (level?.indent ?? LIST_INDENT_PT * (paragraph.list.level + 1))
    : undefined;
  const laid = layParagraph(ctx, paragraph, width, listIndent);
  const { props } = laid;
  return {
    section,
    metrics: {
      height: laid.height,
      marginTop: px(props.spaceBefore ?? 0),
      marginBottom: px(props.spaceAfter ?? 0),
      lines: laid.lines.map((l) => ({ top: l.top, bottom: l.top + l.height })),
      ...(props.keepWithNext ? { keepWithNext: true } : {}),
      ...(props.keepTogether ? { keepTogether: true } : {}),
      ...(props.widowControl ? { widowControl: true } : {}),
      ...(props.pageBreakBefore ? { breakBefore: true } : {}),
      ...(props.columnBreakBefore ? { columnBreakBefore: true } : {}),
    },
    drawn: {
      kind: 'paragraph',
      lines: laid.lines,
      ...decorationOf(props, laid.box),
      ...(marker
        ? {
            marker: {
              marker,
              x: laid.indent - px(level?.hanging ?? LIST_HANGING_PT),
              look: laid.look,
            },
          }
        : {}),
    },
  };
}

const borderOf = (line: BorderLine | undefined): DrawnBorder | undefined =>
  line && line.width > 0
    ? { width: Math.max(1, px(line.width)), color: line.color, space: px(line.space) }
    : undefined;

// What a paragraph draws around its writing: its shading and its top and bottom borders, over its box.
function decorationOf(props: ParagraphProps, box: { x: number; width: number }) {
  const top = borderOf(props.borders?.top);
  const bottom = borderOf(props.borders?.bottom);
  if (!props.shading && !top && !bottom) return {};
  return {
    box,
    ...(props.shading ? { shading: props.shading } : {}),
    ...(top || bottom
      ? { borders: { ...(top ? { top } : {}), ...(bottom ? { bottom } : {}) } }
      : {}),
  };
}

// A cell's writing stacked: its paragraphs, a nested table's read as theirs.
function cellLines(
  ctx: Context,
  blocks: readonly Block[],
  width: number,
): { lines: DrawnLine[]; height: number } {
  const lines: DrawnLine[] = [];
  let top = 0;
  const paragraphs = (all: readonly Block[]): Paragraph[] =>
    all.flatMap((b) =>
      b.type === 'paragraph'
        ? [b]
        : b.type === 'table'
          ? b.rows.flatMap((r) => r.cells.flatMap((c) => paragraphs(c.blocks)))
          : [],
    );
  for (const paragraph of paragraphs(blocks)) {
    const laid = layParagraph(ctx, paragraph, width);
    top += px(laid.props.spaceBefore ?? 0);
    for (const line of laid.lines)
      lines.push({ ...line, top: top + line.top, baseline: top + line.baseline });
    top += laid.height + px(laid.props.spaceAfter ?? 0);
  }
  return { lines, height: top };
}

function tableBlock(ctx: Context, table: Table, width: number, section: number): PreviewBlock {
  const given = table.columns.map(px);
  const total = given.reduce((a, b) => a + b, 0);
  const scale = total > width ? width / total : 1;
  const columns = given.map((w) => w * scale);
  const lefts = columns.map((_, n) => columns.slice(0, n).reduce((a, b) => a + b, 0));
  // Grid columns taken by cells spanning down from rows above, by row.
  const taken = new Map<number, Set<number>>();
  const rows: DrawnRow[] = [];
  let top = 0;
  table.rows.forEach((row, r) => {
    let column = 0;
    let tallest = 0;
    const cells: DrawnCell[] = [];
    for (const cell of row.cells) {
      while (taken.get(r)?.has(column)) column += 1;
      const span = cell.colSpan ?? 1;
      const down = cell.rowSpan ?? 1;
      const cellWidth = columns.slice(column, column + span).reduce((a, b) => a + b, 0);
      // A side's padding as the cell gives it; none, as the editor draws it, when it gives none.
      const pad = (side: 'top' | 'bottom' | 'left' | 'right') =>
        px(cell.props.padding?.[side] ?? 0);
      const { lines, height } = cellLines(
        ctx,
        cell.blocks,
        Math.max(1, cellWidth - pad('left') - pad('right')),
      );
      for (let below = 1; below < down; below += 1) {
        const set = taken.get(r + below) ?? new Set<number>();
        for (let c = column; c < column + span; c += 1) set.add(c);
        taken.set(r + below, set);
      }
      if (down === 1) tallest = Math.max(tallest, height + pad('top') + pad('bottom'));
      cells.push({
        x: lefts[column] ?? 0,
        width: cellWidth,
        rows: down,
        ...(cell.props.background ? { background: cell.props.background } : {}),
        lines: lines.map((l) => ({
          ...l,
          x: l.x + pad('left'),
          top: l.top + pad('top'),
          baseline: l.baseline + pad('top'),
        })),
      });
      column += span;
    }
    const height =
      row.height === undefined
        ? tallest
        : row.heightRule === 'exact'
          ? px(row.height)
          : Math.max(tallest, px(row.height));
    rows.push({ top, height, cells });
    top += height;
  });
  return {
    section,
    metrics: {
      height: top,
      marginTop: 0,
      marginBottom: 0,
      lines: rows.map((row) => ({ top: row.top, bottom: row.top + row.height })),
    },
    drawn: { kind: 'table', x: px(table.indent ?? 0), rows },
  };
}

const nothing = (section: number): PreviewBlock => ({
  section,
  metrics: { height: 0, marginTop: 0, marginBottom: 0, lines: [], atom: true },
  drawn: { kind: 'none' },
});

/** A document tab's body as a preview lays it out, starting in the document's first section. */
export function previewBody(doc: TextDocument, body: readonly Block[]): PreviewBody {
  const ctx: Context = { doc };
  const sections: PageSetup[] = [doc.section.setup];
  const markers = ListMarkers.of(
    body.map((b) => (b.type === 'paragraph' ? b.list : undefined)),
    doc.lists,
  );
  const blocks: PreviewBlock[] = [];
  const sources: number[] = [];
  body.forEach((block, n) => {
    const section = sections.length - 1;
    const width = textWidthOf(sections[section]!);
    if (block.type === 'paragraph')
      blocks.push(paragraphBlock(ctx, block, width, markers[n] ?? null, section));
    else if (block.type === 'table') blocks.push(tableBlock(ctx, block, width, section));
    else if (block.type === 'contents')
      for (const entry of block.entries)
        blocks.push(paragraphBlock(ctx, entry, width, null, section));
    else if (block.type === 'section') {
      sections.push((block as Section).setup);
      blocks.push({
        ...nothing(sections.length - 1),
        metrics: { ...nothing(0).metrics, startsSection: block.start },
      });
    } else blocks.push(nothing(section));
    while (sources.length < blocks.length) sources.push(n);
  });
  return { blocks, sections, sources };
}
