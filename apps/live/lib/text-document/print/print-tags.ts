// A text document's PDF's structure (docs/specs/034-text-documents/files-and-print.md "Downloading", PDF: "alt text
// tagged"; plan 0019 blueprint "PR 14f2"): the captured items mapped back to the writing they were drawn from, and
// tagged by its blocks. A heading is H1 to H6 and an outline entry; a list paragraph an LI of one L with its marker
// as Lbl; a table its rows and cells (header cells TH); a picture a Figure with its alt text (a decorative one an
// artifact); a link its words and box inside a Link; a table of contents a TOC of TOCI; anything else a P. What the
// writing did not draw (headers, footers, page numbers, line numbers, the watermark, notes) is an artifact.
import type { Node as PmNode, ResolvedPos } from 'prosemirror-model';
import type {
  LaidOutHeading,
  LaidOutItemRef,
  LaidOutRole,
  LaidOutTag,
} from '@livedoc/pdf-documents/laid-out';
import type { Style } from '@livedoc/text-documents';
import { PICTURE } from '@livedoc/text-documents';
import { headingLevel, UNTITLED_HEADING } from '../text-document-outline';
import type { CapturedPage } from './capture-pages';

/** Where a drawn node stands in the writing: its position, or null where the writing did not draw it. */
export type PositionOf = (node: Node) => number | null;

type Kid = LaidOutTag | LaidOutItemRef;

/** A block and what was drawn of it, in drawn order: items, and links and figures holding theirs. */
/** A picture drawn among a textblock's items, by its position: tagged once all its items are known. */
type FigureAt = { readonly figure: number };
type Placed = Kid | FigureAt;
const isFigureAt = (placed: Placed): placed is FigureAt => 'figure' in placed;

type Drawn = { refs: Placed[]; links: Map<Element, LaidOutTag & { kids: Kid[] }> };

const LIST_MARKER = '.text-document-list-marker';

export type PrintStructure = {
  readonly tags: readonly LaidOutTag[];
  readonly outline: readonly LaidOutHeading[];
};

/** The tags and outline of the captured pages, from the writing `doc` with its `styles`. */
export function printStructure(
  pages: readonly CapturedPage[],
  doc: PmNode,
  styles: readonly Style[],
  positionOf: PositionOf,
): PrintStructure {
  // Each textblock's drawn items, by the textblock's position.
  const drawn = new Map<number, Drawn>();
  // Each picture's items, by the picture's position.
  const figures = new Map<number, LaidOutItemRef[]>();
  const firstAt = new Map<number, { page: number; top: number }>();
  pages.forEach((page, pageIndex) => {
    page.sources.forEach((source, index) => {
      if (!source) return;
      const pos = positionOf(source);
      if (pos === null) return;
      const $pos = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
      const ref: LaidOutItemRef = { item: [pageIndex, index] };
      const item = page.items[index]!;
      const picture = pictureAt(doc, pos);
      if (picture !== null && item.kind === 'picture') {
        figures.set(picture, [...(figures.get(picture) ?? []), ref]);
        noteFigure(drawn, $pos, picture);
        return;
      }
      const block = textblockOf($pos);
      if (block === null) return;
      const entry: Drawn = drawn.get(block) ?? { refs: [], links: new Map() };
      drawn.set(block, entry);
      if (!firstAt.has(block) && item.kind === 'text')
        firstAt.set(block, { page: pageIndex, top: item.baseline - item.size });
      const anchor =
        source instanceof Element
          ? source.closest('a[href]')
          : source.parentElement?.closest('a[href]');
      if (anchor) {
        let link = entry.links.get(anchor);
        if (!link) {
          link = { role: 'Link', kids: [] };
          entry.links.set(anchor, link);
          entry.refs.push(link);
        }
        link.kids.push(ref);
        return;
      }
      const marker =
        source instanceof Element
          ? source.closest(LIST_MARKER)
          : source.parentElement?.closest(LIST_MARKER);
      const label: LaidOutTag = { role: 'Lbl', kids: [ref] };
      entry.refs.push(marker ? label : ref);
    });
  });

  const outline: LaidOutHeading[] = [];
  const figureTag = (pos: number): LaidOutTag | null => {
    const refs = figures.get(pos);
    const node = doc.nodeAt(pos);
    if (!refs || !node) return null;
    const alt =
      node.attrs.decorative === true
        ? ''
        : typeof node.attrs.alt === 'string'
          ? node.attrs.alt
          : '';
    // A decorative picture is no one's words: an artifact.
    return node.attrs.decorative === true ? null : { role: 'Figure', alt, kids: refs };
  };
  const kidsOf = (pos: number): Kid[] =>
    (drawn.get(pos)?.refs ?? [])
      .map((placed) => (isFigureAt(placed) ? figureTag(placed.figure) : placed))
      .filter((kid): kid is Kid => kid !== null);

  const textblock = (node: PmNode, pos: number): LaidOutTag | null => {
    const kids = kidsOf(pos);
    if (kids.length === 0) return null;
    const level = headingLevel(node, styles);
    if (level !== null) {
      const first = firstAt.get(pos);
      if (first)
        outline.push({
          title: node.textContent.trim() || UNTITLED_HEADING,
          level,
          page: first.page,
          top: Math.max(0, first.top),
        });
      return { role: `H${level}` as LaidOutRole, kids };
    }
    return { role: 'P', kids };
  };

  const blocks = (parent: PmNode, start: number): LaidOutTag[] => {
    const out: LaidOutTag[] = [];
    let list: (LaidOutTag & { kids: Kid[] }) | null = null;
    parent.forEach((node, offset) => {
      const pos = start + offset;
      if (node.isTextblock) {
        const tag = textblock(node, pos);
        const inList = node.attrs.list !== null && node.attrs.list !== undefined;
        if (!tag) return;
        if (inList && tag.role === 'P') {
          const labels = tag.kids.filter((kid) => 'role' in kid && kid.role === 'Lbl');
          const body = tag.kids.filter((kid) => !('role' in kid && kid.role === 'Lbl'));
          const item: LaidOutTag = {
            role: 'LI',
            kids: [...labels, ...(body.length > 0 ? [{ role: 'LBody' as const, kids: body }] : [])],
          };
          if (!list) {
            list = { role: 'L', kids: [] };
            out.push(list);
          }
          list.kids.push(item);
          return;
        }
        list = null;
        out.push(tag);
        return;
      }
      list = null;
      const inner = blocks(node, pos + 1);
      if (inner.length === 0) return;
      out.push(...containerTags(node, inner));
    });
    return out;
  };
  const tags = blocks(doc, 0);
  return { tags, outline };
}

/** A container's tags around what it holds: a table's rows and cells, a table of contents, anything else as it is. */
function containerTags(node: PmNode, inner: LaidOutTag[]): LaidOutTag[] {
  switch (node.type.name) {
    case 'table':
      return [{ role: 'Table', kids: inner }];
    case 'table_row':
      return [{ role: 'TR', kids: inner }];
    case 'table_cell':
      return [{ role: 'TD', kids: inner }];
    case 'table_header':
      return [{ role: 'TH', kids: inner }];
    case 'table_of_contents':
      return [{ role: 'TOC', kids: inner.map((tag) => ({ ...tag, role: 'TOCI' as const })) }];
    default:
      return inner;
  }
}

/** The position of the textblock holding `$pos`, or null where none does. */
function textblockOf($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1)
    if ($pos.node(depth).isTextblock) return $pos.before(depth);
  return null;
}

/** The picture at or just before `pos`, or null. */
function pictureAt(doc: PmNode, pos: number): number | null {
  for (const at of [pos, pos - 1]) {
    if (at < 0 || at >= doc.content.size) continue;
    if (doc.nodeAt(at)?.type.name === PICTURE) return at;
  }
  return null;
}

/** A figure's place among its textblock's drawn items, the first time one of its items is drawn. */
function noteFigure(drawn: Map<number, Drawn>, $pos: ResolvedPos, picture: number) {
  const block = textblockOf($pos);
  if (block === null) return;
  const entry: Drawn = drawn.get(block) ?? { refs: [], links: new Map() };
  drawn.set(block, entry);
  if (!entry.refs.some((placed) => isFigureAt(placed) && placed.figure === picture))
    entry.refs.push({ figure: picture });
}
