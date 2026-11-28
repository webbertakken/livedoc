// XLSX's kept content, read (docs/specs/029-sheets/standard-mapping.md "Unknown content"): the workbook's and each
// worksheet's children and root attributes the reader does not read, each `sheet` entry's other attributes, the styles
// part's differential formats and table styles, every relationship of the package, the workbook and the sheets that
// LiveDoc does not write itself, and every part those reach, with its own relationships.
import {
  attributeOf,
  childElements,
  keptXmlOf,
  parseXml,
  RELATIONSHIP_TYPES,
  resolvePartName,
  type OoxmlPackage,
  type Relationship,
  type XmlElement,
  type XmlBindings,
  type XmlParsed,
} from '@livedoc/office-packages';
import {
  keptAttribute,
  keptLocalName,
  type FileAt,
  type KeptContent,
  type KeptItem,
  type KeptPart,
  type KeptPlace,
  type KeptRelationship,
} from './kept-content';
import { OFFICE_RELATIONSHIPS_NS, SPREADSHEETML_NS } from './xlsx-parts';
import { NOTES_RELATIONSHIP, VML_RELATIONSHIP } from './xlsx-notes';
import { PERSONS_RELATIONSHIP, THREADS_RELATIONSHIP } from './xlsx-threads';
import { isReadTabColor } from './xlsx-tab-look';

const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// The relationships LiveDoc writes itself, or that describe what it rewrites (D106): never kept.
const WRITTEN_TYPES: ReadonlySet<string> = new Set([
  `${RELS}/officeDocument`,
  `${RELS}/extended-properties`,
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  `${RELS}/styles`,
  // The theme is the workbook's, read and written (standard-mapping.md "The theme in the file").
  `${RELS}/theme`,
  `${RELS}/sharedStrings`,
  `${RELS}/sheetMetadata`,
  `${RELS}/calcChain`,
  // A cell's rich value is bound by the metadata LiveDoc writes itself: its pictures are read, the rest are cached
  // values (standard-mapping.md "Pictures in a cell", D634).
  RELATIONSHIP_TYPES.richValue,
  RELATIONSHIP_TYPES.richValueStructure,
  RELATIONSHIP_TYPES.richValueTypes,
  RELATIONSHIP_TYPES.richValueRel,
  // A sheet's links are read and written (standard-mapping.md "Links in the file", D642).
  RELATIONSHIP_TYPES.hyperlink,
  // A sheet's notes and the VML drawing showing them are read and written ("Notes in the file", D651).
  NOTES_RELATIONSHIP,
  VML_RELATIONSHIP,
  // A sheet's comment threads and the workbook's persons are read and written ("Comments in the file").
  THREADS_RELATIONSHIP,
  PERSONS_RELATIONSHIP,
]);

// The parts LiveDoc writes, whatever a kept part's relationship says (a link back to a worksheet is not followed).
const WRITTEN_PARTS =
  /^(xl\/workbook\.xml|xl\/theme\/theme1\.xml|xl\/worksheets\/[^/]*\.xml|xl\/styles\.xml|xl\/sharedStrings\.xml|xl\/metadata\.xml|xl\/richData\/[^/]*\.xml|docProps\/(core|app)\.xml)$/;

/** Whether the XLSX writer writes a part of this name itself (relationships and content types too): none is kept. */
export const isWrittenXlsxPart = (name: string): boolean =>
  WRITTEN_PARTS.test(name) || name === '[Content_Types].xml' || name.endsWith('.rels');

// The workbook's and a worksheet's children the reader reads or the writer writes.
export const WORKBOOK_READ: ReadonlySet<string> = new Set(['workbookPr', 'sheets']);
export const WORKSHEET_READ: ReadonlySet<string> = new Set([
  'dimension',
  'sheetFormatPr',
  'cols',
  'sheetData',
]);
const SHEET_READ: ReadonlySet<string> = new Set(['name', 'sheetId', 'state']);
// The styles part's children a kept format rule, table or pivot table names by index (D110).
const STYLESHEET_KEPT: ReadonlySet<string> = new Set(['dxfs', 'tableStyles']);

// The relationship ids an element and its descendants name.
function idsNamed(element: XmlElement, into: string[] = []): string[] {
  for (const a of element.attributes) if (a.uri === OFFICE_RELATIONSHIPS_NS) into.push(a.value);
  for (const child of childElements(element)) idsNamed(child, into);
  return into;
}

// A `sheetPr`'s children LiveDoc writes itself: its `outlinePr` (standard-mapping.md "Rows and columns in the file")
// and its `tabColor` ("Sheet name, hidden, tab colour"); a tab colour it cannot read is named, not kept.
const sheetPrOwn = (e: XmlElement) =>
  e.uri === SPREADSHEETML_NS && (e.local === 'outlinePr' || e.local === 'tabColor');
const isSheetPr = (element: XmlElement) =>
  element.uri === SPREADSHEETML_NS && element.local === 'sheetPr';

// A worksheet's `sheetPr` without the children LiveDoc writes, a `conditionalFormatting` without the rules it
// reads, a `dataValidations` without the rules it reads and its count; any other element as the file wrote it.
function without(
  parsed: XmlParsed,
  element: XmlElement,
  xml: string,
  read: ReadonlySet<XmlElement>,
): string {
  const own = isSheetPr(element)
    ? childElements(element).filter(sheetPrOwn)
    : childElements(element).filter((child) => read.has(child));
  let out = xml;
  if (own.length > 0) {
    out = '';
    let from = element.start;
    for (const child of own) {
      out += parsed.source.slice(from, child.start);
      from = child.end;
    }
    out += parsed.source.slice(from, element.end);
  }
  // A `dataValidations`' count is the writer's to make again, from the rules it writes in it.
  return element.uri === SPREADSHEETML_NS && element.local === 'dataValidations'
    ? out.replace(/^(<[^>]*?)\s+count="[^"]*"/, '$1')
    : out;
}

/** Whether every child of an element (a `conditionalFormatting`'s rules) is read, so nothing of it is kept. */
export const allRead = (element: XmlElement, read: ReadonlySet<XmlElement>): boolean => {
  const children = childElements(element);
  return children.length > 0 && children.every((child) => read.has(child));
};

// One differential format of a kept `dxfs` (none nests another).
const DXF = /<(?:[\w.-]+:)?dxf\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:[\w.-]+:)?dxf>)/g;

// The last differential format kept items (but a `dxfs`) or parts name by id; -1 for none.
function lastDxfNamed(items: readonly KeptItem<unknown>[], parts: readonly KeptPart[]): number {
  const texts = [
    ...items.filter((i) => keptLocalName(i.xml) !== 'dxfs').map((i) => i.xml),
    ...parts.map((p) => new TextDecoder().decode(p.data)),
  ];
  let last = -1;
  for (const text of texts)
    for (const m of text.matchAll(/[dD]xfId="(\d+)"/g)) last = Math.max(last, Number(m[1]));
  return last;
}

// A `dxfs` cut to its formats up to `last`; null when it keeps none.
function dxfsNamed(xml: string, last: number): string | null {
  const each = [...xml.matchAll(DXF)].slice(0, last + 1).map((m) => m[0]);
  if (each.length === 0) return null;
  const prefix = /^<((?:[\w.-]+:)?)/.exec(xml)![1]!;
  return `<${prefix}dxfs count="${each.length}">${each.join('')}</${prefix}dxfs>`;
}

/** Kept content with its `dxfs` cut to the formats what else it keeps still names (after some of it is read). */
export function withDxfsNamed(kept: KeptContent<FileAt>): KeptContent<FileAt> {
  const last = lastDxfNamed(kept.items, kept.parts);
  const items = kept.items.flatMap((item) => {
    if (item.place !== 'stylesheet' || keptLocalName(item.xml) !== 'dxfs') return [item];
    const xml = dxfsNamed(item.xml, last);
    return xml === null ? [] : [{ ...item, xml }];
  });
  return { ...kept, items };
}

// A `sheetPr` holding nothing but what LiveDoc writes: nothing left to keep.
const onlyOwn = (element: XmlElement) =>
  isSheetPr(element) && element.attributes.length === 0 && childElements(element).every(sheetPrOwn);

/** Kept content as the XLSX reader gathers it, part by part. */
/**
 * Whether a defined name is read into the model, and so not kept: `kept` is it as the file wrote it, `scoped` whether
 * it is one sheet's (`localSheetId`).
 */
export type Claim = (name: XmlElement, kept: KeptItem<FileAt>, scoped: boolean) => boolean;

export class XlsxKeeper {
  readonly items: KeptItem<FileAt>[] = [];
  readonly relationships: KeptRelationship<FileAt>[] = [];
  /** Elements not kept for naming a relationship that is not (D108). */
  unread = 0;
  private readonly pkg: OoxmlPackage;

  constructor(pkg: OoxmlPackage) {
    this.pkg = pkg;
  }

  private element(
    place: KeptPlace,
    parsed: XmlParsed,
    element: XmlElement,
    at: FileAt,
    ids: Set<string>,
    read: ReadonlySet<XmlElement> = new Set(),
  ) {
    if (idsNamed(element).some((id) => !ids.has(id))) {
      this.unread++;
      return;
    }
    const kept = keptXmlOf(parsed, element);
    this.items.push({ place, xml: without(parsed, element, kept.xml, read), ns: kept.ns, at });
  }

  // Whether `claim` reads a defined name into the model (a named range or function), so it is not kept.
  private claimed(parsed: XmlParsed, name: XmlElement, claim: Claim, scoped: boolean): boolean {
    const kept = keptXmlOf(parsed, name);
    return claim(name, { place: 'workbook', xml: kept.xml, ns: kept.ns, at: {} }, scoped);
  }

  // A root's attributes but its namespace declarations; `mc:Ignorable` with the bindings of the prefixes it names.
  private rootAttributes(place: KeptPlace, root: XmlElement, at: FileAt) {
    for (const attribute of root.attributes) {
      const kept = keptAttribute(root, attribute);
      const ignorable = attribute.uri === MC_NS && attribute.local === 'Ignorable';
      const named = ignorable ? attribute.value.split(/\s+/).filter((p) => root.scope[p]) : [];
      const ns = { ...kept.ns, ...Object.fromEntries(named.map((p) => [p, root.scope[p]!])) };
      this.items.push({ place, xml: kept.xml, ns, at });
    }
  }

  // A part's relationships kept, the targets of internal ones as the part's name from the root.
  private keepRelationships(
    source: string,
    from: KeptRelationship<FileAt>['from'],
    at: FileAt,
    skip: ReadonlySet<string>,
  ) {
    const ids = new Set<string>();
    for (const rel of this.pkg.relationships.get(source) ?? []) {
      if (WRITTEN_TYPES.has(rel.type) || skip.has(rel.id)) continue;
      const target = rel.external
        ? rel.target
        : // The package refuses a file whose internal target escapes it, so every one resolves.
          `/${resolvePartName(source, rel.target)!}`;
      this.relationships.push({ ...rel, target, from, at });
      ids.add(rel.id);
    }
    return ids;
  }

  /**
   * The package's relationships but LiveDoc's own, and the workbook's root attributes and children it does not read.
   * A defined name of one sheet (`localSheetId`, the sheet's place among the file's) is kept on its sheet as `read`
   * numbers it, so it follows that sheet (D112).
   */
  workbook(
    parsed: XmlParsed,
    part: string,
    sheets: readonly XmlElement[],
    read: ReadonlyMap<number, number>,
    claim: Claim,
    // The workbook's elements LiveDoc reads (its filter views' `customWorkbookView`s), so not kept.
    held: ReadonlySet<XmlElement> = new Set(),
  ): void {
    this.keepRelationships('', 'package', {}, new Set());
    // The sheets' relationships are LiveDoc's to write (its `sheets`), whatever kind of sheet each names.
    const sheetIds = new Set(sheets.flatMap((s) => idsNamed(s)));
    const ids = this.keepRelationships(part, 'workbook', {}, sheetIds);
    this.rootAttributes('workbook-attribute', parsed.root, {});
    for (const child of childElements(parsed.root)) {
      if (child.uri === SPREADSHEETML_NS && WORKBOOK_READ.has(child.local)) continue;
      if (child.uri !== SPREADSHEETML_NS || child.local !== 'definedNames') {
        if (!allRead(child, held)) this.element('workbook', parsed, child, {}, ids, held);
        continue;
      }
      for (const name of childElements(child)) {
        const local = attributeOf(name, '', 'localSheetId');
        const sheet = local === undefined ? undefined : read.get(Number(local));
        if (local !== undefined && sheet === undefined) this.unread++;
        else if (!this.claimed(parsed, name, claim, sheet !== undefined))
          this.element('workbook', parsed, name, sheet === undefined ? {} : { sheet }, ids);
      }
    }
  }

  /** A sheet entry's attributes but its name, number and relationship. */
  sheetEntry(entry: XmlElement, sheet: number): void {
    for (const attribute of entry.attributes) {
      if (
        attribute.uri === OFFICE_RELATIONSHIPS_NS ||
        (attribute.uri === '' && SHEET_READ.has(attribute.local))
      )
        continue;
      this.items.push({
        place: 'sheet-attribute',
        ...keptAttribute(entry, attribute),
        at: { sheet },
      });
    }
  }

  /**
   * A worksheet's relationships, root attributes and children but its dimension and cells, and the format rules
   * `read` names; a `conditionalFormatting` whose every rule is read is not kept.
   */
  worksheet(
    parsed: XmlParsed,
    part: string,
    sheet: number,
    read: ReadonlySet<XmlElement> = new Set(),
  ): void {
    const ids = this.keepRelationships(part, 'sheet', { sheet }, new Set());
    this.rootAttributes('worksheet-attribute', parsed.root, { sheet });
    for (const child of childElements(parsed.root))
      if (
        !(child.uri === SPREADSHEETML_NS && WORKSHEET_READ.has(child.local)) &&
        !onlyOwn(child) &&
        !read.has(child) &&
        !allRead(child, read)
      )
        this.element('worksheet', parsed, child, { sheet }, ids, read);
    const sheetPr = childElements(parsed.root).find(isSheetPr);
    for (const tab of sheetPr ? childElements(sheetPr) : [])
      if (tab.uri === SPREADSHEETML_NS && tab.local === 'tabColor' && !isReadTabColor(tab, tab.uri))
        this.unread++;
  }

  /** A cell's rich text, its string item's children as the file wrote them, kept on the cell (D377). */
  cellText(runs: readonly { xml: string; ns: XmlBindings }[], at: FileAt): void {
    for (const run of runs) this.items.push({ place: 'cell-text', xml: run.xml, ns: run.ns, at });
  }

  /**
   * The styles part's differential formats and table styles (D110); none when it does not parse. The differential
   * formats are kept up to the last one kept content names (`content`): those only the read format rules named are
   * LiveDoc's to write again.
   */
  styles(text: string | undefined): void {
    const parsed = text === undefined ? undefined : parseXml(text);
    if (!parsed?.ok) return;
    for (const child of childElements(parsed.root))
      if (child.uri === SPREADSHEETML_NS && STYLESHEET_KEPT.has(child.local)) {
        if (child.local === 'dxfs')
          this.dxfs = { at: this.items.length, ...keptXmlOf(parsed, child) };
        else this.element('stylesheet', parsed, child, {}, new Set());
      }
  }

  private dxfs: { at: number; xml: string; ns: XmlBindings } | null = null;

  // The kept differential formats up to the last one kept items or parts name by id; none when none is named.
  private keepDxfs(parts: readonly KeptPart[]): void {
    if (!this.dxfs) return;
    const { at, xml, ns } = this.dxfs;
    const kept = dxfsNamed(xml, lastDxfNamed(this.items, parts));
    if (kept !== null) this.items.splice(at, 0, { place: 'stylesheet', xml: kept, ns, at: {} });
  }

  /** Every part a kept relationship reaches, through the parts' own relationships, with theirs kept on each. */
  parts(): KeptPart[] {
    const out: KeptPart[] = [];
    const seen = new Set<string>();
    const queue = this.relationships.filter((r) => !r.external).map((r) => r.target.slice(1));
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      const data = this.pkg.parts.get(name);
      if (seen.has(name) || !data || WRITTEN_PARTS.test(name)) continue;
      seen.add(name);
      const rels: Relationship[] = [...(this.pkg.relationships.get(name) ?? [])];
      for (const rel of rels) {
        if (!rel.external) queue.push(resolvePartName(name, rel.target)!);
      }
      // The package types every part it reads, by its override or its extension's default.
      out.push({ name, type: this.pkg.contentTypes.get(name)!, data, rels });
    }
    return out;
  }

  /** What was kept, or nothing when nothing was. */
  content(): KeptContent | undefined {
    const parts = this.parts();
    this.keepDxfs(parts);
    if (this.items.length + this.relationships.length + parts.length === 0) return undefined;
    return { standard: 'ooxml', items: this.items, parts, relationships: this.relationships };
  }
}
