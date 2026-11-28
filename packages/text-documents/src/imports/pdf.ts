// A PDF imported as a text document (docs/specs/034-text-documents/files-and-print.md "Opening", "A PDF imported"):
// what the PDF engine hands over, page by page, read into a new ODF document. A tagged page reads by its tags; any
// other by its lines' geometry, the reading order guessed. Pure: the engine runs where PDFs are parsed, and hands
// over text and numbers only.
import type { Block, Paragraph } from '../model/blocks';
import { ListDefinition, type ListPlace } from '../model/lists';
import { PageSetup } from '../model/sections';
import { Tables, type Table } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import type { ReportBuilder } from '../report';
import { importStyles } from './import-styles';

/** A line of a page as the engine laid it: its text and box, in page space (points, y up). */
export type PdfImportLine = {
  readonly text: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** An element of a page's tags: its standard type, its alternative text, and its kids (elements and text). */
export type PdfImportNode = {
  readonly type: string;
  readonly alt: string;
  readonly kids: readonly (PdfImportNode | string)[];
};

export type PdfImportPage = (
  | { readonly reading: 'tags'; readonly nodes: readonly PdfImportNode[] }
  | { readonly reading: 'geometry'; readonly lines: readonly PdfImportLine[] }
  | { readonly reading: 'none' }
) & {
  /** The engine read less than the page holds. */
  readonly cut: boolean;
};

/** How far below a paragraph a line may start and still join it, in its lines' heights. */
export const PDF_JOIN_GAP = 0.5;
/** How much taller than the body text a paragraph's lines are to make it a heading; also the most two joined
 *  lines' heights differ by. */
export const PDF_HEADING_RATIO = 1.2;
/** The deepest level a tagged list is read to. */
const LIST_LEVEL_MAX = 8;

const CONTAINERS = new Set([
  'Document',
  'DocumentFragment',
  'Part',
  'Art',
  'Sect',
  'Div',
  'NonStruct',
  'Private',
  'TOC',
  'BlockQuote',
  'Index',
  'Aside',
  'THead',
  'TBody',
  'TFoot',
]);
const FIGURES = new Set(['Figure', 'Formula', 'Form']);
const HEADING = /^H([1-6])?$/;
const ORDERED_LABEL = /^\(?[0-9a-zA-Z]{1,4}[.)]$/;

const isNode = (kid: PdfImportNode | string): kid is PdfImportNode => typeof kid !== 'string';
// The engine hands each marked run over trimmed, so runs are joined by a space, none before closing punctuation.
const textOf = (node: PdfImportNode | string): string =>
  (isNode(node) ? node.kids.map(textOf).join(' ') : node)
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?)\]}])/g, '$1')
    .trim();

type Builder = {
  readonly paragraph: (style: string, text: string, extra?: Partial<Paragraph>) => Paragraph;
  readonly normal: string;
  readonly heading: (level: number) => string;
  readonly table: (rows: readonly (readonly string[])[], headerRows: number) => Table;
  readonly list: (kind: 'bullet' | 'number') => string;
};

/** A tagged page's blocks, in the tree's order. */
function tagBlocks(nodes: readonly PdfImportNode[], b: Builder): Block[] {
  const blocks: Block[] = [];
  const item = (node: PdfImportNode, list: string, level: number) => {
    // The label is the list's own marker; the body's parts are read as the item's, a nested list a level down.
    const body = node.kids
      .flatMap((kid) => (isNode(kid) && kid.type === 'LBody' ? kid.kids : [kid]))
      .filter((kid) => !(isNode(kid) && kid.type === 'Lbl'));
    const nested = body.filter((kid): kid is PdfImportNode => isNode(kid) && kid.type === 'L');
    const text = textOf({
      ...node,
      kids: body.filter((kid) => !nested.includes(kid as PdfImportNode)),
    });
    const place: ListPlace = { id: list, level };
    if (text) blocks.push(b.paragraph(b.normal, text, { list: place }));
    for (const inner of nested) listOf(inner, list, Math.min(level + 1, LIST_LEVEL_MAX - 1));
  };
  const listOf = (node: PdfImportNode, id: string | null, level: number) => {
    const items = node.kids.filter((kid): kid is PdfImportNode => isNode(kid) && kid.type === 'LI');
    const label = items[0]?.kids.find(
      (kid): kid is PdfImportNode => isNode(kid) && kid.type === 'Lbl',
    );
    const list = id ?? b.list(label && ORDERED_LABEL.test(textOf(label)) ? 'number' : 'bullet');
    for (const li of items) item(li, list, level);
  };
  const tableOf = (node: PdfImportNode) => {
    const rows: PdfImportNode[] = [];
    const collect = (parent: PdfImportNode) => {
      for (const kid of parent.kids.filter(isNode))
        if (kid.type === 'TR') rows.push(kid);
        else if (CONTAINERS.has(kid.type)) collect(kid);
    };
    collect(node);
    const cells = rows.map((row) =>
      row.kids.filter(
        (kid): kid is PdfImportNode => isNode(kid) && (kid.type === 'TH' || kid.type === 'TD'),
      ),
    );
    const usable = cells.filter((row) => row.length > 0);
    if (usable.length === 0) return;
    const header = usable.findIndex((row) => !row.every((cell) => cell.type === 'TH'));
    blocks.push(
      b.table(
        usable.map((row) => row.map(textOf)),
        header === -1 ? usable.length : header,
      ),
    );
  };
  const walk = (node: PdfImportNode) => {
    const heading = HEADING.exec(node.type);
    if (heading) {
      const text = textOf(node);
      if (text) blocks.push(b.paragraph(b.heading(Number(heading[1] ?? 1)), text));
    } else if (node.type === 'L') listOf(node, null, 0);
    else if (node.type === 'Table') tableOf(node);
    else if (FIGURES.has(node.type)) {
      if (node.alt.trim()) blocks.push(b.paragraph(b.normal, `[${node.alt.trim()}]`));
    } else if (CONTAINERS.has(node.type) || node.kids.some((kid) => isNode(kid) && !isInline(kid)))
      for (const kid of node.kids) {
        if (isNode(kid)) walk(kid);
        else if (kid.trim()) blocks.push(b.paragraph(b.normal, textOf(kid)));
      }
    else {
      const text = textOf(node);
      if (text) blocks.push(b.paragraph(b.normal, text));
    }
  };
  for (const node of nodes) walk(node);
  return blocks;
}

// Elements that sit inside a paragraph's text rather than make blocks of their own.
const INLINE = new Set([
  'Span',
  'Link',
  'Quote',
  'Code',
  'Reference',
  'BibEntry',
  'Note',
  'Annot',
  'Ruby',
  'Warichu',
  'Em',
  'Strong',
  'Sub',
  'Lbl',
]);
const isInline = (node: PdfImportNode): boolean => INLINE.has(node.type);

type GeometryParagraph = {
  text: string;
  left: number;
  right: number;
  /** The last line's top and bottom. */
  top: number;
  bottom: number;
  /** The tallest line's height. */
  height: number;
};

const heightOf = (line: PdfImportLine) => line.top - line.bottom;

/** Whether `line` carries on the paragraph above it (files-and-print.md "A PDF imported"). */
function joins(paragraph: GeometryParagraph, line: PdfImportLine): boolean {
  const height = heightOf(line);
  const larger = Math.max(height, paragraph.height);
  const smaller = Math.min(height, paragraph.height);
  return (
    line.top < paragraph.top &&
    paragraph.bottom - line.top <= PDF_JOIN_GAP * larger &&
    line.left < paragraph.right &&
    line.right > paragraph.left &&
    larger <= PDF_HEADING_RATIO * smaller
  );
}

function joinedText(above: string, line: string): string {
  if (/[a-z]-$/.test(above) && /^[a-z]/.test(line)) return `${above.slice(0, -1)}${line}`;
  return `${above} ${line}`;
}

/** A page's lines gathered into paragraphs, in the file's order. */
function geometryParagraphs(lines: readonly PdfImportLine[]): GeometryParagraph[] {
  const out: GeometryParagraph[] = [];
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const last = out.at(-1);
    if (last && joins(last, line)) {
      last.text = joinedText(last.text, text);
      last.left = Math.min(last.left, line.left);
      last.right = Math.max(last.right, line.right);
      last.top = line.top;
      last.bottom = line.bottom;
      last.height = Math.max(last.height, heightOf(line));
    } else
      out.push({
        text,
        left: line.left,
        right: line.right,
        top: line.top,
        bottom: line.bottom,
        height: heightOf(line),
      });
  }
  return out;
}

/** The body text's height: the median line height, each line weighted by its characters. */
export function bodyHeight(pages: readonly PdfImportPage[]): number {
  const lines = pages.flatMap((page) => (page.reading === 'geometry' ? page.lines : []));
  const weighted = lines
    .map((line) => ({ height: heightOf(line), weight: line.text.trim().length }))
    .filter((line) => line.weight > 0 && line.height > 0)
    .sort((a, b) => a.height - b.height);
  const total = weighted.reduce((sum, line) => sum + line.weight, 0);
  let seen = 0;
  for (const line of weighted) {
    seen += line.weight;
    if (seen * 2 >= total) return line.height;
  }
  return 0;
}

const rounded = (height: number) => Math.round(height * 2) / 2;

export function readPdfImport(
  pages: readonly PdfImportPage[],
  report: ReportBuilder,
): TextDocument {
  const { blank, styles, normal, heading } = importStyles();
  const lists: Record<string, ListDefinition> = {};
  const width = PageSetup.room(blank.section.setup).across;
  const paragraph = (style: string, text: string, extra: Partial<Paragraph> = {}): Paragraph => ({
    type: 'paragraph',
    style,
    props: {},
    inlines: text ? [{ type: 'run', text, props: {} }] : [],
    ...extra,
  });
  const builder: Builder = {
    paragraph,
    normal,
    heading,
    list: (kind) => {
      const id = `L${Object.keys(lists).length + 1}`;
      lists[id] = ListDefinition.of(kind);
      return id;
    },
    table: (rows, headerRows) => {
      const columns = Math.max(...rows.map((row) => row.length));
      const empty = Tables.of({ rows: rows.length, columns, width, style: normal });
      return {
        ...empty,
        headerRows: Math.min(headerRows, rows.length),
        rows: empty.rows.map((row, r) => ({
          ...row,
          cells: row.cells.map((cell, c) => ({
            ...cell,
            blocks: [paragraph(normal, rows[r]![c] ?? '')],
          })),
        })),
      };
    },
  };

  const body = bodyHeight(pages);
  const geometry = pages.map((page) =>
    page.reading === 'geometry' ? geometryParagraphs(page.lines) : [],
  );
  // Headings by their height, the tallest first.
  const headingHeights = [
    ...new Set(
      geometry
        .flat()
        .flatMap((p) =>
          body > 0 && p.height >= PDF_HEADING_RATIO * body ? [rounded(p.height)] : [],
        ),
    ),
  ].sort((a, b) => b - a);
  const styleOf = (p: GeometryParagraph): string => {
    const rank =
      body > 0 && p.height >= PDF_HEADING_RATIO * body
        ? headingHeights.indexOf(rounded(p.height))
        : -1;
    return rank < 0 ? normal : heading(Math.min(rank + 1, 3));
  };

  const blocks = pages.flatMap((page, index): Block[] => {
    if (page.cut) report.drop('pdf-text-cut', 'page');
    report.drop('pdf-pictures', 'page');
    if (page.reading === 'tags') return tagBlocks(page.nodes, builder);
    if (page.reading === 'geometry' && geometry[index]!.length > 0)
      return geometry[index]!.map((p) => paragraph(styleOf(p), p.text));
    report.drop('pdf-no-text', 'page');
    return [];
  });
  return { ...blank, styles, lists, body: blocks.length > 0 ? blocks : blank.body };
}
