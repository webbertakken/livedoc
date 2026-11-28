// Pictures in cells read from XLSX (docs/specs/029-sheets/standard-mapping.md "Pictures in the file", "Pictures in a
// cell", D634): a cell whose `vm` names, through `xl/metadata.xml`'s value metadata and its `XLRICHVALUE` future
// metadata, a rich value of the `_localImage` structure whose relationship embeds a picture of the package that
// qualifies (PNG, JPEG, GIF or WebP within its pixels) is read as its picture, its alt text from `Text`; one that does
// not qualify leaves its cell empty, named (`picture_unread`, unreadable); a cell of any other rich value keeps its
// cached value. The rich data parts are never kept: the writer writes them anew.
import {
  attributeOf,
  childElement,
  childElements,
  parseXml,
  RELATIONSHIP_TYPES,
  resolvePartName,
  textContent,
  type OoxmlPackage,
  type Relationship,
  type XmlElement,
} from '@livedoc/office-packages';
import { readablePicture, type ReadCellPicture } from './file-pictures';
import type { FileCell, FileLoss, FileSheet } from './workbook-file';
import {
  LOCAL_IMAGE,
  LOCAL_IMAGE_KEY,
  RICH_DATA_NS,
  RICH_VALUE_EXT,
  RICH_VALUE_REL_NS,
} from './xlsx-cell-pictures';
import { OFFICE_RELATIONSHIPS_NS } from './xlsx-parts';

/** A cell naming a rich value: its sheet's index, the cell as read, and its 1-based `vm`. */
export type RichCell = { sheet: number; cell: FileCell; vm: number };

const ALT_MAX = 1000;

const kids = (element: XmlElement | undefined, ns: string, local: string): XmlElement[] =>
  element ? childElements(element).filter((e) => e.uri === ns && e.local === local) : [];

function parsedPart(pkg: OoxmlPackage, part: string | undefined): XmlElement | null {
  const bytes = part === undefined ? undefined : pkg.parts.get(part);
  if (!bytes) return null;
  const parsed = parseXml(new TextDecoder().decode(bytes), part);
  return parsed.ok ? parsed.root : null;
}

// The package part the workbook's relationship of the type names, or undefined.
function partFrom(main: string, rels: readonly Relationship[], type: string): string | undefined {
  const rel = rels.find((r) => r.type === type);
  return rel && resolvePartName(main, rel.target);
}

// Each value metadata block's rich value index (the `XLRICHVALUE` block's `rvb i`), by `vm` - 1; null for another.
function richValueIndexes(metadata: XmlElement, ns: string): (number | null)[] {
  const types = kids(childElement(metadata, ns, 'metadataTypes'), ns, 'metadataType').map((t) =>
    attributeOf(t, '', 'name'),
  );
  const future = kids(metadata, ns, 'futureMetadata').find(
    (f) => attributeOf(f, '', 'name') === 'XLRICHVALUE',
  );
  const blocks = kids(future, ns, 'bk').map((bk) => {
    const ext = kids(childElement(bk, ns, 'extLst'), ns, 'ext').find(
      (e) => attributeOf(e, '', 'uri') === RICH_VALUE_EXT,
    );
    const rvb = ext && childElement(ext, RICH_DATA_NS, 'rvb');
    const i = rvb ? Number(attributeOf(rvb, '', 'i')) : NaN;
    return Number.isInteger(i) && i >= 0 ? i : null;
  });
  return kids(childElement(metadata, ns, 'valueMetadata'), ns, 'bk').map((bk) => {
    const rc = childElement(bk, ns, 'rc');
    const t = Number(rc && attributeOf(rc, '', 't'));
    const v = Number(rc && attributeOf(rc, '', 'v'));
    if (types[t - 1] !== 'XLRICHVALUE' || !Number.isInteger(v)) return null;
    return blocks[v] ?? null;
  });
}

// A rich value as a picture: its relationship index and alt text, or null when it is not a `_localImage`.
type LocalImage = { rel: number; alt?: string };

function localImages(values: XmlElement, structures: XmlElement): (LocalImage | null)[] {
  const shapes = kids(structures, RICH_DATA_NS, 's').map((s) => ({
    type: attributeOf(s, '', 't'),
    keys: kids(s, RICH_DATA_NS, 'k').map((k) => attributeOf(k, '', 'n')),
  }));
  return kids(values, RICH_DATA_NS, 'rv').map((rv) => {
    const shape = shapes[Number(attributeOf(rv, '', 's'))];
    if (shape?.type !== LOCAL_IMAGE) return null;
    const vs = kids(rv, RICH_DATA_NS, 'v').map((v) => textContent(v));
    const rel = Number(vs[shape.keys.indexOf(LOCAL_IMAGE_KEY)]);
    if (!Number.isInteger(rel) || rel < 0) return null;
    const text = shape.keys.includes('Text') ? vs[shape.keys.indexOf('Text')] : undefined;
    return { rel, ...(text ? { alt: text.slice(0, ALT_MAX) } : {}) };
  });
}

/**
 * The workbook's cells naming rich values, each read as its picture where it is one (`readPicture` set, its cached
 * `#VALUE!` dropped), a `_localImage` whose picture does not qualify left empty and named in `losses`.
 */
export function readXlsxCellPictures(
  pkg: OoxmlPackage,
  // The workbook's relationships.
  rels: readonly Relationship[],
  ns: string,
  sheets: readonly FileSheet[],
  cells: readonly RichCell[],
  losses: FileLoss[],
): void {
  if (cells.length === 0) return;
  const main = pkg.mainPart;
  const metadataPart = partFrom(main, rels, RELATIONSHIP_TYPES.sheetMetadata);
  const metadata = parsedPart(pkg, metadataPart);
  const values = parsedPart(pkg, partFrom(main, rels, RELATIONSHIP_TYPES.richValue));
  const structures = parsedPart(pkg, partFrom(main, rels, RELATIONSHIP_TYPES.richValueStructure));
  const relsPart = partFrom(main, rels, RELATIONSHIP_TYPES.richValueRel);
  const relValues = parsedPart(pkg, relsPart);
  if (!metadata || !values || !structures || !relValues || !relsPart) return;
  const indexes = richValueIndexes(metadata, ns);
  const images = localImages(values, structures);
  const relIds = kids(relValues, RICH_VALUE_REL_NS, 'rel').map((rel) =>
    attributeOf(rel, OFFICE_RELATIONSHIPS_NS, 'id'),
  );
  // A part without relationships names no bytes.
  const relsOf = pkg.relationships.get(relsPart) ?? [];
  const read = new Map<number, ReadCellPicture | null>();
  const pictureOf = (rel: number): ReadCellPicture | null => {
    if (read.has(rel)) return read.get(rel)!;
    const target = relsOf.find(
      (r) => r.id === relIds[rel] && r.type === RELATIONSHIP_TYPES.image && !r.external,
    );
    const name = target && resolvePartName(relsPart, target.target);
    const bytes = name ? pkg.parts.get(name) : undefined;
    const readable = bytes ? readablePicture(bytes) : null;
    const picture = readable && bytes ? { bytes, ...readable } : null;
    read.set(rel, picture);
    return picture;
  };
  for (const { sheet, cell, vm } of cells) {
    const index = indexes[vm - 1];
    const image = index === undefined || index === null ? null : images[index];
    if (!image) continue;
    const picture = pictureOf(image.rel);
    delete cell.value;
    if (!picture) {
      losses.push({ k: 'picture_unread', sheet: sheets[sheet]!.name, why: 'unreadable' });
      continue;
    }
    cell.readPicture = { ...picture, ...(image.alt ? { alt: image.alt } : {}) };
  }
}
