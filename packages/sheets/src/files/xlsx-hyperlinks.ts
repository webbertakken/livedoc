// Cells' links in XLSX (docs/specs/029-sheets/standard-mapping.md "Links in the file", D642): a worksheet's
// `hyperlinks`, one `hyperlink` a linked cell, an address through an external relationship of the sheet and a range
// of the workbook as `location`. Read whole, so no longer kept; written in their schema place, the writer's own
// replacing one a sheet kept before links were read.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  RELATIONSHIP_TYPES,
  type Relationship,
  type XmlElement,
} from '@livedoc/office-packages';
import { cellAddress, readCellAddress } from './xlsx-parts';
import { xlsxLocation, xlsxLocationLink, type FileLink } from './file-links';
import type { FileCell } from './workbook-file';

/** A link the file puts on a cell or a block of cells, zero-based and inclusive. */
export type BlockLink = { r1: number; c1: number; r2: number; c2: number; link: FileLink };

/** What a worksheet's `hyperlinks` read as: each link, and the element read (not kept), when there is one. */
export type XlsxHyperlinksRead = { links: BlockLink[]; read: XmlElement[] };

// A hyperlink's `ref`: a cell, or a block from its top left to its bottom right.
function blockOf(ref: string): Omit<BlockLink, 'link'> | null {
  const [first, last, more] = ref.trim().split(':');
  if (more !== undefined) return null;
  const a = readCellAddress(first ?? '');
  const b = last === undefined ? a : readCellAddress(last);
  if (!a || !b) return null;
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c),
  };
}

/**
 * A worksheet's links: its relationship's target (an address as written) for a hyperlink naming one, else its
 * `location` as a range of a sheet the file holds (`known`), else the location kept as the address `#<location>`.
 * A hyperlink with neither, or with a `ref` that is no cell, is not a link; the element is read whole either way.
 */
export function readXlsxHyperlinks(
  root: XmlElement,
  ns: string,
  relsNs: string,
  rels: readonly Relationship[],
  known: (sheet: string) => boolean,
): XlsxHyperlinksRead {
  const element = childElement(root, ns, 'hyperlinks');
  if (!element) return { links: [], read: [] };
  const links: BlockLink[] = [];
  for (const h of childElements(element)) {
    if (h.uri !== ns || h.local !== 'hyperlink') continue;
    const block = blockOf(attributeOf(h, '', 'ref') ?? '');
    if (!block) continue;
    const id = attributeOf(h, relsNs, 'id');
    const target = id === undefined ? undefined : rels.find((r) => r.id === id)?.target;
    const location = attributeOf(h, '', 'location');
    const link: FileLink | null =
      target !== undefined && target !== ''
        ? { href: location ? `${target}#${location}` : target }
        : location
          ? (xlsxLocationLink(location, known) ?? { href: `#${location}` })
          : null;
    if (link) links.push({ ...block, link });
  }
  return { links, read: [element] };
}

/**
 * Puts each link on the cells of its block a sheet's read holds, and on its top left cell however empty, within
 * `limits` (D642); a later link on a cell wins, as Excel's does.
 */
export function cellsLinked(
  cells: FileCell[],
  links: readonly BlockLink[],
  limits: { rows: number; cols: number },
): void {
  if (links.length === 0) return;
  const byPlace = new Map(cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
  for (const { r1, c1, r2, c2, link } of links) {
    if (r1 >= limits.rows || c1 >= limits.cols) continue;
    const first = byPlace.get(`${r1},${c1}`);
    if (first) first.link = link;
    else {
      const made: FileCell = { r: r1, c: c1, link };
      cells.push(made);
      byPlace.set(`${r1},${c1}`, made);
    }
    // A block's other cells, one pass over the sheet's (Google and Excel write one hyperlink a cell).
    if (r1 === r2 && c1 === c2) continue;
    for (const cell of cells)
      if (cell.r >= r1 && cell.r <= r2 && cell.c >= c1 && cell.c <= c2) cell.link = link;
  }
}

/** A sheet's own `hyperlinks` and the external relationships they name, ids from `nextId`; none for no links. */
export function xlsxHyperlinksOut(
  cells: readonly FileCell[],
  nextId: () => string,
): { xml: string; rels: Relationship[] } | null {
  const linked = cells.filter((cell) => cell.link);
  if (linked.length === 0) return null;
  const rels: Relationship[] = [];
  const each = linked.map((cell) => {
    const link = cell.link!;
    const ref = cellAddress(cell.r, cell.c);
    if ('sheet' in link)
      return `<hyperlink ref="${ref}" location="${escapeXmlAttribute(xlsxLocation(link))}"/>`;
    // A kept location (`#Name`) stays a location; any other address is the sheet's external relationship.
    if (link.href.startsWith('#'))
      return `<hyperlink ref="${ref}" location="${escapeXmlAttribute(link.href.slice(1))}"/>`;
    const id = nextId();
    rels.push({ id, type: RELATIONSHIP_TYPES.hyperlink, target: link.href, external: true });
    return `<hyperlink ref="${ref}" r:id="${id}"/>`;
  });
  return { xml: `<hyperlinks>${each.join('')}</hyperlinks>`, rels };
}
