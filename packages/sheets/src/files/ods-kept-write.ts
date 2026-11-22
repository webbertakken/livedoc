// ODF's kept content, written back (docs/specs/029-sheets/standard-mapping.md "Unknown content"): each kept item where
// it sat, untouched, its namespaces declared on the root unless the root binds its prefix otherwise; a kept entry
// while it is still reached (D109's other half: a file of the other standard never sees it).
import { keptXmlWithin, type OdfEntry, type XmlBindings } from '@livedoc/office-packages';
import {
  keptLocalName,
  type FileAt,
  type KeptContent,
  type KeptItem,
  type KeptPlace,
} from './kept-content';

const key = (at: FileAt) => `${at.sheet ?? ''},${at.r ?? ''},${at.c ?? ''}`;

// The entries a kept element names by path (a picture, an embedded object): written only while one still names them.
const NAMED_BY_PATH = /^(Pictures\/|Object [^/]*\/|ObjectReplacements\/|media\/)/;

// Kept workbook content that sits before the calculation settings LiveDoc writes, by ODF's order of the spreadsheet.
const BEFORE_CALCULATION: ReadonlySet<string> = new Set([
  'tracked-changes',
  'variable-decls',
  'sequence-decls',
  'user-field-decls',
  'dde-connection-decls',
]);

/** ` xmlns:p="uri"` for each binding of `ns` that `own` lacks. */
export function declarations(ns: XmlBindings, own: XmlBindings): string {
  return Object.entries(ns)
    .filter(([prefix]) => !(prefix in own))
    .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
    .join('');
}

export type OdsCellKept = { attributes: string; before: string; after: string };

/** ODF kept content laid out for the writer: by place, sheet and cell, with the root's extra namespaces. */
export class OdsKeptWriter {
  private readonly byPlace = new Map<string, KeptItem<FileAt>[]>();
  private readonly cellPositions = new Map<number, Map<string, { r: number; c: number }>>();
  private readonly parts: KeptContent['parts'];
  private readonly rootNs: Record<string, string>;
  /** The bindings the kept settings use, for the root of the part that holds them. */
  readonly settingsNs: Record<string, string> = {};
  private readonly written: string[] = [];
  private renamed = 1;

  constructor(kept: KeptContent | undefined, rootNs: XmlBindings) {
    const items = kept?.standard === 'odf' ? kept.items : [];
    this.parts = kept?.standard === 'odf' ? kept.parts : [];
    this.rootNs = { ...rootNs };
    for (const item of items) {
      const k = `${item.place}|${key(item.at)}`;
      const list = this.byPlace.get(k);
      if (list) list.push(item);
      else this.byPlace.set(k, [item]);
      const { sheet, r, c } = item.at;
      if (sheet !== undefined && r !== undefined && c !== undefined) {
        const cells = this.cellPositions.get(sheet) ?? new Map<string, { r: number; c: number }>();
        cells.set(`${r},${c}`, { r, c });
        this.cellPositions.set(sheet, cells);
      }
      // A prefix the root does not bind is declared there; one it binds otherwise, on the kept content itself. The
      // settings live in a part of their own in a package, so declare theirs themselves.
      const into = item.place === 'settings' ? this.settingsNs : this.rootNs;
      for (const [prefix, uri] of Object.entries(item.ns)) into[prefix] ??= uri;
    }
  }

  /** The declarations a root binding `own` adds for kept content, ` xmlns:p="uri"` each, none it already has. */
  rootDeclarations(own: XmlBindings, settings = false): string {
    const wanted = settings ? { ...this.settingsNs, ...this.rootNs } : this.rootNs;
    return declarations(wanted, own);
  }

  private items(place: KeptPlace, at: FileAt = {}): KeptItem<FileAt>[] {
    return this.byPlace.get(`${place}|${key(at)}`) ?? [];
  }

  private elements(items: readonly KeptItem<FileAt>[]): string[] {
    const out = items.map((item) => keptXmlWithin(item, this.rootNs));
    this.written.push(...out);
    return out;
  }

  /** The kept workbook content of a place: `scripts`, `styles`, `spreadsheet-after`. */
  workbook(place: 'scripts' | 'styles' | 'spreadsheet-after'): string[] {
    return this.elements(this.items(place));
  }

  /** The kept settings, inside a root binding `rootNs` (a package's `settings.xml`, or the flat file's root). */
  settings(rootNs: XmlBindings): string[] {
    return this.items('settings').map((item) => keptXmlWithin(item, rootNs));
  }

  /** The kept content before the tables: before LiveDoc's calculation settings, or after them. */
  spreadsheetBefore(calculation: 'before' | 'after'): string[] {
    const items = this.items('spreadsheet-before').filter(
      (item) => BEFORE_CALCULATION.has(keptLocalName(item.xml)) === (calculation === 'before'),
    );
    return this.elements(items);
  }

  table(place: 'table-before' | 'table-after', sheet: number): string[] {
    return this.elements(this.items(place, { sheet }));
  }

  tableAttributes(sheet: number): string {
    return this.attributes(this.items('table-attribute', { sheet }));
  }

  /** The cells of a sheet that keep content, so the writer writes each, empty or not. */
  cellsOf(sheet: number): readonly { r: number; c: number }[] {
    return [...(this.cellPositions.get(sheet)?.values() ?? [])];
  }

  /** A cell's kept attributes and its kept children before and after its paragraphs; null when it keeps none. */
  cell(sheet: number, r: number, c: number): OdsCellKept | null {
    const at = { sheet, r, c };
    const attributes = this.items('cell-attribute', at);
    const before = this.items('cell', at);
    const after = this.items('cell-after', at);
    if (attributes.length + before.length + after.length === 0) return null;
    return {
      attributes: this.attributes(attributes),
      before: this.elements(before).join(''),
      after: this.elements(after).join(''),
    };
  }

  // Attributes kept alone, each ` name="value"`. One whose prefix the root binds otherwise takes a prefix of its own,
  // declared beside it: declaring its own would rename the element it sits on.
  private attributes(items: readonly KeptItem<FileAt>[]): string {
    return items
      .map((item) => {
        const [prefix, uri] = Object.entries(item.ns)[0] ?? [];
        if (prefix === undefined || this.rootNs[prefix] === uri) return ` ${item.xml}`;
        const own = `kept${this.renamed++}`;
        return ` xmlns:${own}="${uri}" ${own}${item.xml.slice(prefix.length)}`;
      })
      .join('');
  }

  /** The kept entries still reached: a picture or an object while written kept XML names its path, the rest always. */
  entries(): OdfEntry[] {
    const named = this.written.join('\n');
    const reached = (name: string) => {
      const folder = NAMED_BY_PATH.exec(name)?.[0];
      if (!folder) return true;
      // An embedded object is named by its folder, a picture by its own path, each closed by a quote or a slash.
      const path = folder.startsWith('Object ') ? folder.slice(0, -1) : name;
      return named.includes(`${path}"`) || named.includes(`${path}/`);
    };
    return this.parts
      .filter((part) => reached(part.name))
      .map((part) => ({ name: part.name, mediaType: part.type, data: part.data }));
  }
}
