// Kept content (docs/specs/029-sheets/standard-mapping.md "Unknown content"): what a file holds that the model does
// not, kept as the file's own XML by where it sat, and written back untouched to the same standard. A file's kept
// content is anchored by position (`FileAt`); the model's by id (`StoredAt`), so it moves with its sheet, row and
// column as cells do.
import {
  escapeXmlAttribute,
  type Relationship,
  type XmlAttribute,
  type XmlBindings,
  type XmlElement,
} from '@livedoc/office-packages';

/** The standard kept content belongs to: written back only to a file of it (D109). */
export type KeptStandard = 'odf' | 'ooxml';

/**
 * Where a kept item sat. ODF: `scripts`, `styles` (an automatic style kept drawings and notes name), `common-styles`
 * (a named cell style a kept format rule names), `settings`,
 * `spreadsheet-before` / `-after` (the tables), `table-before` / `-after` (its columns and rows), `table-attribute`,
 * `cell` / `cell-after` (its paragraphs), `cell-attribute`. OOXML: `workbook` and `workbook-attribute` (its root's),
 * `stylesheet` (`dxfs`, `tableStyles`), `sheet-attribute` (its `sheet` element's), `worksheet` and
 * `worksheet-attribute` (its root's).
 */
export const KEPT_PLACES = [
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
  'workbook',
  'workbook-attribute',
  'stylesheet',
  'sheet-attribute',
  'worksheet',
  'worksheet-attribute',
] as const;
export type KeptPlace = (typeof KEPT_PLACES)[number];

/** Whether a value names a place kept content sits at. */
export const isKeptPlace = (value: unknown): value is KeptPlace =>
  (KEPT_PLACES as readonly unknown[]).includes(value);

/** An item's anchor in a file: its sheet's index, its cell's zero-based row and column. */
export type FileAt = { sheet?: number; r?: number; c?: number };

/** An item's anchor in the model: its sheet's id, its cell's row and column ids. */
export type StoredAt = { sheet?: string; r?: string; c?: string };

/** One kept element (or attribute, `name="value"`) as the file wrote it, with the outer bindings it needs. */
export type KeptItem<At> = { place: KeptPlace; xml: string; ns: XmlBindings; at: At };

/**
 * A package entry kept whole: ODF's by path, XLSX's part by name, with its media or content type, and (XLSX) its own
 * relationships, targets as the file wrote them.
 */
export type KeptPart = { name: string; type: string; data: Uint8Array; rels: Relationship[] };

/**
 * An XLSX relationship kept on the package's, the workbook's or a sheet's part (`at` names the sheet), with its id;
 * an internal target is the part's name from the package's root, `/`-led.
 */
export type KeptRelationship<At> = Relationship & {
  from: 'package' | 'workbook' | 'sheet';
  at: At;
};

export type KeptContent<At = FileAt> = {
  standard: KeptStandard;
  items: KeptItem<At>[];
  parts: KeptPart[];
  relationships: KeptRelationship<At>[];
};

/** The standard a format's files are of. */
export const keptStandardOf = (format: 'ods' | 'fods' | 'xlsx'): KeptStandard =>
  format === 'xlsx' ? 'ooxml' : 'odf';

/** The most cells a repeated ODF cell keeps its kept content on (D105). */
export const KEPT_REPEAT_MAX = 1_000;

/** An attribute kept alone: `prefix:local="value"`, its value escaped again, and the binding its prefix needs. */
export function keptAttribute(
  element: XmlElement,
  attribute: XmlAttribute,
): { xml: string; ns: XmlBindings } {
  const name = attribute.prefix ? `${attribute.prefix}:${attribute.local}` : attribute.local;
  const uri = attribute.prefix ? element.scope[attribute.prefix] : undefined;
  return {
    xml: `${name}="${escapeXmlAttribute(attribute.value)}"`,
    ns: uri && attribute.prefix !== 'xml' ? { [attribute.prefix]: uri } : {},
  };
}

/** What a person is told a kept item is (files-and-print.md "Converting"); `support` items are never counted. */
export type KeptKind =
  | 'drawings'
  | 'notes'
  | 'named-ranges'
  | 'validation'
  | 'format-rules'
  | 'filters'
  | 'merges'
  | 'pivot-tables'
  | 'tables'
  | 'links'
  | 'print-settings'
  | 'protection'
  | 'column-widths'
  | 'view-settings'
  | 'other';

const KINDS: Readonly<Record<string, KeptKind>> = {
  shapes: 'drawings',
  frame: 'drawings',
  drawing: 'drawings',
  picture: 'drawings',
  'custom-shape': 'drawings',
  rect: 'drawings',
  line: 'drawings',
  ellipse: 'drawings',
  annotation: 'notes',
  legacyDrawing: 'notes',
  'named-expressions': 'named-ranges',
  definedNames: 'named-ranges',
  'content-validations': 'validation',
  'content-validation-name': 'validation',
  dataValidations: 'validation',
  'conditional-formats': 'format-rules',
  conditionalFormatting: 'format-rules',
  'database-ranges': 'filters',
  autoFilter: 'filters',
  sortState: 'filters',
  'data-pilot-tables': 'pivot-tables',
  pivotCaches: 'pivot-tables',
  tableParts: 'tables',
  'number-columns-spanned': 'merges',
  'number-rows-spanned': 'merges',
  mergeCells: 'merges',
  hyperlinks: 'links',
  externalReferences: 'links',
  'print-ranges': 'print-settings',
  printOptions: 'print-settings',
  pageMargins: 'print-settings',
  pageSetup: 'print-settings',
  headerFooter: 'print-settings',
  rowBreaks: 'print-settings',
  colBreaks: 'print-settings',
  protected: 'protection',
  'protection-key': 'protection',
  sheetProtection: 'protection',
  protectedRanges: 'protection',
  workbookProtection: 'protection',
  cols: 'column-widths',
  settings: 'view-settings',
  sheetViews: 'view-settings',
  bookViews: 'view-settings',
  sheetFormatPr: 'view-settings',
  sheetPr: 'view-settings',
  calcPr: 'view-settings',
};

// Items that only serve others (styles, relationships, the package's parts) are not counted as things kept.
const SUPPORT: ReadonlySet<KeptPlace> = new Set([
  'styles',
  'common-styles',
  'stylesheet',
  'workbook-attribute',
  'worksheet-attribute',
]);

/** The local name of a kept element (`<p:name …`) or attribute (`p:name="…"`); empty for neither. */
export function keptLocalName(xml: string): string {
  return /^<?(?:[\w.-]+:)?([\w.-]+)/.exec(xml)?.[1] ?? '';
}

/** The kind of a kept item, by its element's or attribute's local name; null for one that only serves others. */
export function keptKindOf(item: KeptItem<unknown>): KeptKind | null {
  if (SUPPORT.has(item.place)) return null;
  return KINDS[keptLocalName(item.xml)] ?? 'other';
}

/** The kept items counted, and their kinds, the most common first (files-and-print.md "Converting"). */
export function keptKinds(items: readonly KeptItem<unknown>[]): {
  count: number;
  kinds: KeptKind[];
} {
  const counts = new Map<KeptKind, number>();
  for (const item of items) {
    const kind = keptKindOf(item);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const kinds = [...counts].sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
  return { count: [...counts.values()].reduce((n, k) => n + k, 0), kinds };
}
