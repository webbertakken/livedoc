// ODF's kept content, read (docs/specs/029-sheets/standard-mapping.md "Unknown content"): each element and attribute
// the ODF reader does not read, kept as the file wrote it, by where it sat; and the package entries it does not read.
import { isOdsProtectionAttribute } from './ods-protection';
import { isOdsTableRecordAttribute } from './ods-tables';
import { isOdsFilterRecordAttribute } from './ods-filters';
import { cellLinkHref, cellParagraphs, isMarkedParagraph } from './ods-cell-text';
import {
  attributeOf,
  childElement,
  childElements,
  keptXmlOf,
  ODF_NS,
  parseXml,
  type OdfPackage,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import {
  keptAttribute,
  type FileAt,
  type KeptItem,
  type KeptPart,
  type KeptPlace,
} from './kept-content';

const { office: OFFICE, style: STYLE, table: TABLE, text: TEXT, calcext: CALCEXT } = ODF_NS;

// The columns and rows of a table, wherever ODF groups them: what the reader reads; the rest of a table is kept.
const TABLE_GRID: ReadonlySet<string> = new Set([
  'table-column',
  'table-columns',
  'table-header-columns',
  'table-column-group',
  'table-row',
  'table-rows',
  'table-header-rows',
  'table-row-group',
]);

// The attributes of a cell the reader reads (its value, type, formula, style, repeats and array spans).
const CELL_READ: Readonly<Record<string, ReadonlySet<string>>> = {
  [TABLE]: new Set([
    'style-name',
    'formula',
    'number-columns-repeated',
    'number-matrix-columns-spanned',
    'number-matrix-rows-spanned',
  ]),
  [OFFICE]: new Set([
    'value-type',
    'value',
    'date-value',
    'time-value',
    'boolean-value',
    'string-value',
    'currency',
  ]),
  [CALCEXT]: new Set(['value-type']),
};

// The automatic styles no cell, row, column or table names, which kept drawings and notes name (D104).
const KEPT_STYLE_FAMILIES: ReadonlySet<string> = new Set(['graphic', 'paragraph', 'text', 'chart']);

// Entries the ODF writer writes itself, or reads into the model: never kept.
const WRITTEN_ENTRIES: ReadonlySet<string> = new Set([
  'content.xml',
  'styles.xml',
  'meta.xml',
  'settings.xml',
  'mimetype',
  'META-INF/manifest.xml',
]);

/** Whether the ODF writer writes an entry of this name itself, so none is kept under it. */
export const isWrittenOdfEntry = (name: string): boolean => WRITTEN_ENTRIES.has(name);

/** Kept items as a reader gathers them, with the parsed entry their XML is sliced from. */
// The spreadsheet's holders whose children LiveDoc reads: validation rules and names.
const READ_HOLDERS = new Set(['content-validations', 'named-expressions', 'database-ranges']);

export class OdsKeeper {
  readonly items: KeptItem<FileAt>[] = [];
  /** Cells whose kept content was left out for repeating past `KEPT_REPEAT_MAX` (D105). */
  cut = 0;

  private readonly parsed: XmlParsed;

  constructor(parsed: XmlParsed) {
    this.parsed = parsed;
  }

  element(place: KeptPlace, element: XmlElement, at: FileAt = {}): void {
    const kept = keptXmlOf(this.parsed, element);
    this.items.push({ place, xml: kept.xml, ns: kept.ns, at });
  }

  /** The root's scripts and the automatic styles kept drawings and notes name; in a flat file, its settings. */
  root(root: XmlElement): void {
    const scripts = childElement(root, OFFICE, 'scripts');
    if (scripts) this.element('scripts', scripts);
    const settings = childElement(root, OFFICE, 'settings');
    if (settings) this.element('settings', settings);
    const automatic = childElement(root, OFFICE, 'automatic-styles');
    for (const style of automatic ? childElements(automatic) : []) {
      const family = attributeOf(style, STYLE, 'family');
      if (style.uri === STYLE && style.local === 'style' && KEPT_STYLE_FAMILIES.has(family ?? ''))
        this.element('styles', style);
    }
  }

  /**
   * The spreadsheet's children but its tables and calculation settings, before or after the tables; its validation
   * rules and names but those `read` names (a `table:content-validations` or `table:named-expressions` all read is
   * not kept).
   */
  spreadsheet(spreadsheet: XmlElement, read: ReadonlySet<XmlElement> = new Set()): void {
    let tables = false;
    for (const child of childElements(spreadsheet)) {
      const isTable = child.uri === TABLE && child.local === 'table';
      tables ||= isTable;
      if (isTable || (child.uri === TABLE && child.local === 'calculation-settings')) continue;
      const place = tables ? 'spreadsheet-after' : 'spreadsheet-before';
      if (child.uri === TABLE && READ_HOLDERS.has(child.local))
        this.withoutRead(place, child, read);
      else this.element(place, child);
    }
  }

  // A holder without the children `read` names; one all read is not kept.
  private withoutRead(place: KeptPlace, holder: XmlElement, read: ReadonlySet<XmlElement>) {
    const children = childElements(holder);
    const gone = children.filter((child) => read.has(child));
    if (gone.length > 0 && gone.length === children.length) return;
    const kept = keptXmlOf(this.parsed, holder);
    let xml = this.parsed.source.slice(holder.start, holder.end);
    for (const element of [...gone].reverse())
      xml = xml.slice(0, element.start - holder.start) + xml.slice(element.end - holder.start);
    this.items.push({ place, xml: gone.length ? xml : kept.xml, ns: kept.ns, at: {} });
  }

  /**
   * A table's children but its columns and rows, before or after them, and its attributes but its name and style;
   * its format rules but the conditions `read` names (a `calcext:conditional-formats` all read is not kept).
   */
  table(table: XmlElement, sheet: number, read: ReadonlySet<XmlElement> = new Set()): void {
    let grid = false;
    for (const child of childElements(table)) {
      const isGrid = child.uri === TABLE && TABLE_GRID.has(child.local);
      grid ||= isGrid;
      if (isGrid || (child.uri === TEXT && child.local === 'soft-page-break')) continue;
      const place = grid ? 'table-after' : 'table-before';
      if (child.uri === CALCEXT && child.local === 'conditional-formats')
        this.formats(place, child, sheet, read);
      else this.element(place, child, { sheet });
    }
    for (const attribute of table.attributes) {
      if (
        (attribute.uri === TABLE &&
          (attribute.local === 'name' || attribute.local === 'style-name')) ||
        isOdsProtectionAttribute(attribute) ||
        isOdsTableRecordAttribute(attribute) ||
        isOdsFilterRecordAttribute(attribute)
      )
        continue;
      this.items.push({
        place: 'table-attribute',
        ...keptAttribute(table, attribute),
        at: { sheet },
      });
    }
  }

  // A table's format rules without those read: a rule's read conditions cut out, a rule with none left too.
  private formats(
    place: KeptPlace,
    holder: XmlElement,
    sheet: number,
    read: ReadonlySet<XmlElement>,
  ) {
    const cut: XmlElement[] = [];
    let whole = 0;
    const formats = childElements(holder);
    for (const format of formats) {
      const parts = childElements(format);
      const gone = parts.filter((p) => read.has(p));
      if (gone.length === 0 || gone.length < parts.length) cut.push(...gone);
      else {
        cut.push(format);
        whole++;
      }
    }
    if (whole > 0 && whole === formats.length) return;
    const kept = keptXmlOf(this.parsed, holder);
    let xml = this.parsed.source.slice(holder.start, holder.end);
    for (const element of [...cut].reverse())
      xml = xml.slice(0, element.start - holder.start) + xml.slice(element.end - holder.start);
    this.items.push({ place, xml, ns: kept.ns, at: { sheet } });
  }

  /** Named cell styles of `parsed`'s common styles, each kept as it came, for kept format rules that name them. */
  commonStyles(parsed: XmlParsed, names: ReadonlySet<string>): void {
    const styles = childElement(parsed.root, OFFICE, 'styles');
    for (const style of styles ? childElements(styles) : []) {
      // A rule names its style by its display name, as LibreOffice does, or by its name.
      const name = attributeOf(style, STYLE, 'display-name') ?? attributeOf(style, STYLE, 'name');
      if (style.local !== 'style' || name === undefined || !names.has(name)) continue;
      const kept = keptXmlOf(parsed, style);
      this.items.push({ place: 'common-styles', xml: kept.xml, ns: kept.ns, at: {} });
    }
  }

  /**
   * A cell's kept content, one item each, anchored at no cell yet (the caller places them): its children but its
   * paragraphs, before or after them, its paragraphs when one holds marked text (D376), and its attributes but those
   * the reader reads (a validation rule's name among them when `ruled` says its rule is read). Empty when it keeps
   * nothing.
   */
  cell(cell: XmlElement, ruled: (name: string) => boolean = () => false): KeptItem<FileAt>[] {
    const out: KeptItem<FileAt>[] = [];
    let text = false;
    // Paragraphs holding marked text (a link, a span) are kept whole, read as the cell's text too (D376).
    // A cell's text wholly one link is read as its link, not kept (D642).
    const marked = cellParagraphs(cell).some(isMarkedParagraph) && cellLinkHref(cell) === null;
    for (const child of childElements(cell)) {
      const paragraph = child.uri === TEXT && child.local === 'p';
      text ||= paragraph;
      if (paragraph && marked) {
        const kept = keptXmlOf(this.parsed, child);
        out.push({ place: 'cell-text', xml: kept.xml, ns: kept.ns, at: {} });
      }
      if (paragraph) continue;
      const kept = keptXmlOf(this.parsed, child);
      out.push({ place: text ? 'cell-after' : 'cell', xml: kept.xml, ns: kept.ns, at: {} });
    }
    for (const attribute of cell.attributes) {
      if (CELL_READ[attribute.uri]?.has(attribute.local)) continue;
      if (
        attribute.uri === TABLE &&
        attribute.local === 'content-validation-name' &&
        ruled(attribute.value)
      )
        continue;
      out.push({ place: 'cell-attribute', ...keptAttribute(cell, attribute), at: {} });
    }
    return out;
  }

  /** A cell's kept items placed at each of the positions it repeats over. */
  place(items: readonly KeptItem<FileAt>[], at: readonly Required<FileAt>[]): void {
    for (const position of at) for (const item of items) this.items.push({ ...item, at: position });
  }
}

/** A package's `settings.xml` settings, kept as a flat file's are; none when it has none or does not parse. */
export function keptSettings(pkg: OdfPackage): KeptItem<FileAt>[] {
  const entry = pkg.entries.get('settings.xml');
  const parsed = entry && parseXml(new TextDecoder().decode(entry), 'settings.xml');
  const settings = parsed && parsed.ok ? childElement(parsed.root, OFFICE, 'settings') : undefined;
  if (!parsed || !parsed.ok || !settings) return [];
  const kept = keptXmlOf(parsed, settings);
  return [{ place: 'settings', xml: kept.xml, ns: kept.ns, at: {} }];
}

/** The package's entries the reader does not read and the writer does not write, with their media types. */
export function keptOdfParts(pkg: OdfPackage): KeptPart[] {
  const parts: KeptPart[] = [];
  for (const [name, data] of pkg.entries) {
    if (WRITTEN_ENTRIES.has(name)) continue;
    parts.push({ name, type: pkg.mediaTypes.get(name) ?? '', data, rels: [] });
  }
  // A folder the manifest types (an embedded object's), kept while an entry of it is.
  for (const [name, type] of pkg.mediaTypes) {
    if (name === '/' || !name.endsWith('/') || !parts.some((p) => p.name.startsWith(name)))
      continue;
    parts.push({ name, type, data: new Uint8Array(), rels: [] });
  }
  return parts;
}
