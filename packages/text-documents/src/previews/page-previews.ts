// A text document's pages as pictures for agents (docs/specs/034-text-documents/agents-and-sync.md "Page previews"):
// the body laid out by the editor's own arithmetic (`paginate`) over blocks measured from the bundled faces' widths,
// each page asked drawn as SVG and labelled approximate. Pure.
import type { Block } from '../model/blocks';
import type { TextDocument } from '../model/text-document';
import { paginate } from '../pagination/pagination-engine';
import { pageCount, pageFrame, type PageFrame, type PageStart } from '../pagination/pagination';
import { previewBody, type PreviewBlock } from './preview-blocks';
import { pageSvg, type PlacedBlock } from './preview-svg';

/** The most pages one preview draws: three pages fit a reply's picture budget legibly (safe range 1 to 5). */
export const TEXT_PREVIEW_PAGES_MAX = 3;
/**
 * The most blocks a preview lays out: about 250 pages of ordinary writing, laid out in well under a second
 * (safe range 1,000 to 20,000).
 */
export const TEXT_PREVIEW_BLOCKS_MAX = 5_000;

export type PagePreview = {
  readonly number: number;
  readonly width: number;
  readonly height: number;
  readonly svg: string;
};

export type PagePreviews =
  | { readonly ok: true; readonly pages: readonly PagePreview[]; readonly pageCount: number }
  | {
      readonly ok: false;
      readonly code: 'page_not_found' | 'document_too_large';
      readonly message: string;
    };

type Ask = { readonly from: number; readonly to: number };

type Place = { readonly block: number; readonly line: number };

const before = (a: Place, b: Place) =>
  a.block < b.block || (a.block === b.block && a.line < b.line);

type Page = { frame: PageFrame; section: number; placed: PlacedBlock[] };

// The lines from `from` up to `to` (or the end) placed down one column from its top.
function placeRun(
  blocks: readonly PreviewBlock[],
  from: Place,
  to: Place | undefined,
  top: number,
  left: number,
): PlacedBlock[] {
  const placed: PlacedBlock[] = [];
  let y = top;
  let below = 0;
  for (let b = from.block; b < blocks.length; b += 1) {
    const block = blocks[b]!;
    const fromLine = b === from.block ? from.line : 0;
    if (to && !before({ block: b, line: fromLine }, to)) break;
    const lines = block.metrics.lines;
    const toLine = to && to.block === b ? to.line : lines.length;
    // A paragraph's space before is kept at the top of a column; the space between two is the larger.
    if (fromLine === 0)
      y += placed.length === 0 ? block.metrics.marginTop : Math.max(below, block.metrics.marginTop);
    const offset = lines[fromLine]?.top ?? 0;
    placed.push({ block, fromLine, toLine, top: y - offset, left });
    y += (toLine < lines.length ? lines[toLine]!.top : block.metrics.height) - offset;
    below = block.metrics.marginBottom;
  }
  return placed;
}

/** Each page with its blocks and lines, as the layout's starts and column starts cut them. */
function placePages(
  blocks: readonly PreviewBlock[],
  starts: readonly PageStart[],
  frameOf: (block: number) => PageFrame,
): Page[] {
  const pages: Page[] = [];
  starts.forEach((start, p) => {
    const frame = frameOf(start.block);
    const section = blocks[start.block]?.section ?? 0;
    for (let n = 0; n < start.blank; n += 1) pages.push({ frame, section, placed: [] });
    const next = starts[p + 1];
    const cuts = [{ block: start.block, line: start.line, column: 1 }, ...(start.columns ?? [])];
    const step = (frame.columns?.width ?? 0) + (frame.columns?.gap ?? 0);
    const placed = cuts.flatMap((cut, n) =>
      placeRun(blocks, cut, cuts[n + 1] ?? next, frame.top, frame.left + (cut.column - 1) * step),
    );
    pages.push({ frame, section, placed });
  });
  return pages;
}

// The body measured from the bundled faces and laid onto pages by the editor's arithmetic.
function layout(doc: TextDocument, body: readonly Block[]) {
  const { blocks, sections, sources } = previewBody(doc, body);
  const frames = sections.map(pageFrame);
  const frameOf = (block: number) => frames[blocks[block]?.section ?? 0]!;
  const laid = paginate(
    blocks.map((b) => b.metrics),
    frameOf,
  );
  return { blocks, sections, sources, frameOf, laid };
}

/** Pages `ask.from` to `ask.to` of a document tab's body, drawn; or why not. */
export function pagePreviews(doc: TextDocument, body: readonly Block[], ask: Ask): PagePreviews {
  if (body.length > TEXT_PREVIEW_BLOCKS_MAX)
    return {
      ok: false,
      code: 'document_too_large',
      message: `A preview lays out at most ${TEXT_PREVIEW_BLOCKS_MAX} blocks; this document tab holds ${body.length}.`,
    };
  const { blocks, sections, frameOf, laid } = layout(doc, body);
  const count = pageCount(laid);
  if (ask.from > count || ask.to > count)
    return {
      ok: false,
      code: 'page_not_found',
      message: `This document tab has ${count} page${count === 1 ? '' : 's'}.`,
    };
  const pages = placePages(blocks, laid.starts, frameOf);
  const out: PagePreview[] = [];
  for (let number = ask.from; number <= ask.to; number += 1) {
    const page = pages[number - 1]!;
    out.push({
      number,
      width: page.frame.width,
      height: page.frame.height,
      svg: pageSvg(page.frame, page.placed, sections[page.section]?.pageColor),
    });
  }
  return { ok: true, pages: out, pageCount: count };
}

/** The body block each page starts in, page by page (blank pages left out): what the agreement measure compares. */
export function previewPageStarts(doc: TextDocument, body: readonly Block[]): number[] {
  const { sources, laid } = layout(doc, body);
  return laid.starts.map((start) => sources[start.block] ?? 0);
}
