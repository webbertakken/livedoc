// Kept content checked as it arrives at the store (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown
// content): every item one whole element or one attribute of its standard's places, with the bindings it needs and no
// DOCTYPE; every entry's name safe, neither LiveDoc's own nor one the office packages drop; every relationship's
// target inside the package, of a type not dropped; every anchor whole. The first refusal is answered, named.
import {
  escapeXmlAttribute,
  isDroppedOdfEntry,
  isDroppedOoxmlPart,
  isDroppedOoxmlRelationship,
  isSafeEntryName,
  parseXml,
  resolvePartName,
  type Relationship,
  type XmlBindings,
} from '@livedoc/office-packages';
import type {
  KeptContent,
  KeptPart,
  KeptPlace,
  KeptRelationship,
  KeptStandard,
  StoredAt,
} from './kept-content';
import { isWrittenOdfEntry } from './ods-kept-read';
import { isWrittenXlsxPart } from './xlsx-kept-read';

export type KeptRejection =
  'kept_item_invalid' | 'kept_part_invalid' | 'kept_relationship_invalid' | 'kept_anchor_invalid';

/** A refusal: its name, what it was about (`items[3]`), and why, for the log. */
export type KeptRefusal = { rejection: KeptRejection; at: string; why: string };

const PLACES: Readonly<Record<KeptStandard, ReadonlySet<KeptPlace>>> = {
  odf: new Set<KeptPlace>([
    'scripts',
    'styles',
    'common-styles',
    'settings',
    'spreadsheet-before',
    'spreadsheet-after',
    'table-before',
    'table-after',
    'table-attribute',
    'cell',
    'cell-after',
    'cell-attribute',
  ]),
  ooxml: new Set<KeptPlace>([
    'workbook',
    'workbook-attribute',
    'stylesheet',
    'sheet-attribute',
    'worksheet',
    'worksheet-attribute',
  ]),
};

const NAME = /^[A-Za-z_][\w.-]*$/;
const ATTRIBUTE = /^(?:[A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*="[^"<]*"$/;
const MEDIA_TYPE = /^[\w.+;= /-]{0,255}$/;
const TEXT_MAX = 2048;

// Text with no control characters, up to the length a type or a target holds.
const plain = (text: string): boolean =>
  text.length > 0 && text.length <= TEXT_MAX && [...text].every((ch) => ch.charCodeAt(0) >= 0x20);

function bindingsValid(ns: XmlBindings): boolean {
  return Object.entries(ns).every(
    ([prefix, uri]) => (prefix === '' || (NAME.test(prefix) && prefix !== 'xmlns')) && plain(uri),
  );
}

const declarations = (ns: XmlBindings): string =>
  Object.entries(ns)
    .map(([prefix, uri]) => ` xmlns${prefix ? `:${prefix}` : ''}="${escapeXmlAttribute(uri)}"`)
    .join('');

/** Why a kept item's XML is not one whole element (or, at an attribute's place, one attribute); null when it is. */
export function keptItemFault(place: KeptPlace, xml: string, ns: XmlBindings): string | null {
  if (!bindingsValid(ns)) return 'bindings';
  if (place.endsWith('-attribute')) {
    if (!ATTRIBUTE.test(xml) || xml.startsWith('xmlns')) return 'not one attribute';
    const parsed = parseXml(`<k${declarations(ns)} ${xml}/>`);
    return parsed.ok ? null : parsed.rejection;
  }
  const head = `<k${declarations(ns)}>`;
  const parsed = parseXml(`${head}${xml}</k>`);
  if (!parsed.ok) return parsed.rejection;
  const [only, ...more] = parsed.root.children;
  const whole =
    more.length === 0 &&
    typeof only === 'object' &&
    only.start === head.length &&
    only.end === head.length + xml.length;
  return whole ? null : 'not one element';
}

function relationshipFault(rel: Relationship, source: string): string | null {
  if (!NAME.test(rel.id)) return 'id';
  if (!plain(rel.type) || isDroppedOoxmlRelationship(rel.type)) return 'type';
  if (!plain(rel.target)) return 'target';
  if (rel.external) return null;
  const name = resolvePartName(source, rel.target);
  return name !== undefined && isSafeEntryName(name) ? null : 'target';
}

function partFault(part: KeptPart, standard: KeptStandard): string | null {
  if (!isSafeEntryName(part.name)) return 'name';
  const own = standard === 'odf' ? isWrittenOdfEntry(part.name) : isWrittenXlsxPart(part.name);
  const dropped = standard === 'odf' ? isDroppedOdfEntry(part.name) : isDroppedOoxmlPart(part.name);
  if (own || dropped) return 'name';
  // A folder entry (an embedded object's) is ODF's alone, and empty.
  if (part.name.endsWith('/') && (standard !== 'odf' || part.data.byteLength > 0)) return 'name';
  if (!MEDIA_TYPE.test(part.type)) return 'type';
  if (standard === 'odf' && part.rels.length > 0) return 'relationships';
  const faults = part.rels.map((rel) => relationshipFault(rel, part.name));
  return faults.find((fault) => fault !== null) ?? null;
}

function anchorWhole(at: StoredAt): boolean {
  if ((at.r === undefined) !== (at.c === undefined)) return false;
  return at.r === undefined || at.sheet !== undefined;
}

function keptRelationshipFault(rel: KeptRelationship<StoredAt>): string | null {
  if ((rel.from === 'sheet') !== (rel.at.sheet !== undefined) || rel.at.r !== undefined)
    return 'source';
  return relationshipFault(rel, '');
}

/** The first reason kept content may not be stored, named; null when every item, entry and relationship holds. */
export function keptRefusal(kept: KeptContent<StoredAt>): KeptRefusal | null {
  const places = PLACES[kept.standard];
  for (const [i, item] of kept.items.entries()) {
    const at = `items[${i}]`;
    if (!anchorWhole(item.at)) return { rejection: 'kept_anchor_invalid', at, why: 'anchor' };
    const fault = places.has(item.place) ? keptItemFault(item.place, item.xml, item.ns) : 'place';
    if (fault) return { rejection: 'kept_item_invalid', at, why: fault };
  }
  if (kept.standard === 'odf' && kept.relationships.length > 0)
    return { rejection: 'kept_relationship_invalid', at: 'relationships', why: 'odf' };
  for (const [i, rel] of kept.relationships.entries()) {
    const fault = keptRelationshipFault(rel);
    if (fault)
      return { rejection: 'kept_relationship_invalid', at: `relationships[${i}]`, why: fault };
  }
  const names = new Set<string>();
  for (const [i, part] of kept.parts.entries()) {
    const fault = names.has(part.name) ? 'twice' : partFault(part, kept.standard);
    if (fault) return { rejection: 'kept_part_invalid', at: `parts[${i}]`, why: fault };
    names.add(part.name);
  }
  return null;
}
