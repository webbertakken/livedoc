// ODF's kept content, read (docs/specs/029-sheets/standard-mapping.md "Unknown content"): each element and attribute
// the ODF reader does not read, kept as the file wrote it, by where it sat; and the package entries it does not read.
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

/** Kept items as a reader gathers them, with the parsed entry their XML is sliced from. */
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

  /** The spreadsheet's children but its tables and calculation settings, before or after the tables. */
  spreadsheet(spreadsheet: XmlElement): void {
    let tables = false;
    for (const child of childElements(spreadsheet)) {
      const isTable = child.uri === TABLE && child.local === 'table';
      tables ||= isTable;
      if (isTable || (child.uri === TABLE && child.local === 'calculation-settings')) continue;
      this.element(tables ? 'spreadsheet-after' : 'spreadsheet-before', child);
    }
  }

  /** A table's children but its columns and rows, before or after them, and its attributes but its name and style. */
  table(table: XmlElement, sheet: number): void {
    let grid = false;
    for (const child of childElements(table)) {
      const isGrid = child.uri === TABLE && TABLE_GRID.has(child.local);
      grid ||= isGrid;
      if (isGrid || (child.uri === TEXT && child.local === 'soft-page-break')) continue;
      this.element(grid ? 'table-after' : 'table-before', child, { sheet });
    }
    for (const attribute of table.attributes) {
      if (
        attribute.uri === TABLE &&
        (attribute.local === 'name' || attribute.local === 'style-name')
      )
        continue;
      this.items.push({
        place: 'table-attribute',
        ...keptAttribute(table, attribute),
        at: { sheet },
      });
    }
  }

  /**
   * A cell's kept content, one item each, anchored at no cell yet (the caller places them): its children but its
   * paragraphs, before or after them, and its attributes but those the reader reads. Empty when it keeps nothing.
   */
  cell(cell: XmlElement): KeptItem<FileAt>[] {
    const out: KeptItem<FileAt>[] = [];
    let text = false;
    for (const child of childElements(cell)) {
      const paragraph = child.uri === TEXT && child.local === 'p';
      text ||= paragraph;
      if (paragraph) continue;
      const kept = keptXmlOf(this.parsed, child);
      out.push({ place: text ? 'cell-after' : 'cell', xml: kept.xml, ns: kept.ns, at: {} });
    }
    for (const attribute of cell.attributes) {
      if (CELL_READ[attribute.uri]?.has(attribute.local)) continue;
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
