// XLSX's kept content, written back (docs/specs/029-sheets/standard-mapping.md "Unknown content", "Written back in
// place"): each kept child at its place in the schema's order of the workbook's and worksheet's children, the roots'
// kept attributes and the namespaces kept content uses on the roots, kept relationships with their ids (LiveDoc's own
// numbered after them), and each kept part while a kept relationship still reaches it.
import {
  keptXmlWithin,
  resolvePartName,
  type OoxmlPart,
  type Relationship,
  type XmlBindings,
} from '@livedoc/office-packages';
import {
  keptLocalName,
  type FileAt,
  type KeptContent,
  type KeptItem,
  type KeptPart,
} from './kept-content';
import { withOutlinePr } from './xlsx-lines';

// ECMA-376 Part 1's order of the workbook's and the worksheet's children (CT_Workbook, CT_Worksheet).
const WORKBOOK_ORDER = [
  'fileVersion',
  'fileSharing',
  'workbookPr',
  'workbookProtection',
  'bookViews',
  'sheets',
  'functionGroups',
  'externalReferences',
  'definedNames',
  'calcPr',
  'oleSize',
  'customWorkbookViews',
  'pivotCaches',
  'smartTagPr',
  'smartTagTypes',
  'webPublishing',
  'fileRecoveryPr',
  'webPublishObjects',
  'extLst',
];
const WORKSHEET_ORDER = [
  'sheetPr',
  'dimension',
  'sheetViews',
  'sheetFormatPr',
  'cols',
  'sheetData',
  'sheetCalcPr',
  'sheetProtection',
  'protectedRanges',
  'scenarios',
  'autoFilter',
  'sortState',
  'dataConsolidate',
  'customSheetViews',
  'mergeCells',
  'phoneticPr',
  'conditionalFormatting',
  'dataValidations',
  'hyperlinks',
  'printOptions',
  'pageMargins',
  'pageSetup',
  'headerFooter',
  'rowBreaks',
  'colBreaks',
  'customProperties',
  'cellWatches',
  'ignoredErrors',
  'smartTags',
  'drawing',
  'legacyDrawing',
  'legacyDrawingHF',
  'drawingHF',
  'picture',
  'oleObjects',
  'controls',
  'webPublishItems',
  'tableParts',
  'extLst',
];

/** One of LiveDoc's own children of a root, by its element name, and its XML. */
export type OwnChild = { name: string; xml: string };

// Kept children and LiveDoc's own in the schema's order: a kept child the schema does not name (another suite's,
// such as Excel's revision pointer) stays after the kept child it followed in the file.
function inOrder(
  order: readonly string[],
  kept: readonly string[],
  own: readonly OwnChild[],
): string[] {
  const rankOf = (name: string) => order.indexOf(name);
  const ranked: { rank: number; at: number; xml: string }[] = [];
  let last = -1;
  kept.forEach((xml, at) => {
    const rank = rankOf(keptLocalName(xml));
    last = rank >= 0 ? rank : last;
    ranked.push({ rank: last, at, xml });
  });
  for (const child of own) ranked.push({ rank: rankOf(child.name), at: -1, xml: child.xml });
  // A stable sort keeps the file's order among kept children of one rank, LiveDoc's own first.
  return ranked.sort((a, b) => a.rank - b.rank || a.at - b.at).map((r) => r.xml);
}

// A sheet's index in a kept workbook view, past the last sheet now, becomes the first (D112).
const SHEET_INDEX_IN_VIEW = /\s(activeTab|firstSheet)="(\d+)"/g;

/** XLSX kept content laid out for the writer. */
export class XlsxKeptWriter {
  private readonly items: KeptItem<FileAt>[];
  private readonly kept: KeptContent | undefined;
  private readonly sheets: number;

  constructor(kept: KeptContent | undefined, sheets: number) {
    this.kept = kept?.standard === 'ooxml' ? kept : undefined;
    this.items = this.kept?.items ?? [];
    this.sheets = sheets;
  }

  private of(place: KeptItem<FileAt>['place'], sheet?: number): KeptItem<FileAt>[] {
    return this.items.filter((item) => item.place === place && item.at.sheet === sheet);
  }

  // The kept children of a root (a sheet's, or the workbook's whatever sheet a defined name is on).
  private children(root: 'workbook' | 'worksheet', sheet?: number): KeptItem<FileAt>[] {
    return root === 'workbook'
      ? this.items.filter((i) => i.place === 'workbook')
      : this.of(root, sheet);
  }

  /** The bindings a root declares: `own`, then those its kept attributes and children use that `own` lacks. */
  rootBindings(root: 'workbook' | 'worksheet', own: XmlBindings, sheet?: number): XmlBindings {
    const ns: Record<string, string> = {};
    for (const item of [...this.of(`${root}-attribute`, sheet), ...this.children(root, sheet)])
      for (const [prefix, uri] of Object.entries(item.ns)) ns[prefix] ??= uri;
    return { ...ns, ...own };
  }

  /** A root's start tag after its own declarations: the kept content's declarations and the kept attributes. */
  rootAttributes(root: 'workbook' | 'worksheet', own: XmlBindings, sheet?: number): string {
    const bindings = this.rootBindings(root, own, sheet);
    const declared = Object.entries(bindings)
      .filter(([prefix]) => !(prefix in own))
      .map(([p, uri]) => ` xmlns:${p}="${uri}"`);
    return (
      declared.join('') +
      this.of(`${root}-attribute`, sheet)
        .map((item) => ` ${item.xml}`)
        .join('')
    );
  }

  /** The workbook's children: LiveDoc's own and the kept ones, defined names in one `definedNames`. */
  workbookChildren(own: readonly OwnChild[], rootNs: XmlBindings): string[] {
    const kept: string[] = [];
    const names: string[] = [];
    for (const item of this.children('workbook')) {
      const xml = keptXmlWithin(item, rootNs);
      if (keptLocalName(xml) !== 'definedName')
        kept.push(
          xml.replace(SHEET_INDEX_IN_VIEW, (m, attr: string, n: string) =>
            Number(n) < this.sheets ? m : ` ${attr}="0"`,
          ),
        );
      // A defined name of one sheet names that sheet by its place now (D112).
      else
        names.push(
          item.at.sheet === undefined
            ? xml
            : xml.replace(/\blocalSheetId="\d+"/, `localSheetId="${item.at.sheet}"`),
        );
    }
    if (names.length > 0) kept.push(`<definedNames>${names.join('')}</definedNames>`);
    return inOrder(WORKBOOK_ORDER, kept, own);
  }

  /** A sheet entry's kept attributes. */
  sheetAttributes(sheet: number): string {
    return this.of('sheet-attribute', sheet)
      .map((item) => ` ${item.xml}`)
      .join('');
  }

  /**
   * A worksheet's children: LiveDoc's own and the kept ones. LiveDoc's `outlinePr` (its attributes) goes into a kept
   * `sheetPr`, or a `sheetPr` of its own when none is kept.
   */
  worksheetChildren(
    sheet: number,
    own: readonly OwnChild[],
    rootNs: XmlBindings,
    outlinePr: string | null = null,
  ): string[] {
    let placed = outlinePr === null;
    const kept = this.of('worksheet', sheet).map((item) => {
      const xml = keptXmlWithin(item, rootNs);
      if (placed || keptLocalName(xml) !== 'sheetPr') return xml;
      placed = true;
      return withOutlinePr(xml, outlinePr!);
    });
    const sheetPr = placed
      ? []
      : [{ name: 'sheetPr', xml: `<sheetPr><outlinePr${outlinePr}/></sheetPr>` }];
    return inOrder(WORKSHEET_ORDER, kept, [...sheetPr, ...own]);
  }

  /** The styles part's kept differential formats and table styles, after its cell styles. */
  stylesheet(rootNs: XmlBindings): string {
    return this.of('stylesheet')
      .map((item) => keptXmlWithin(item, rootNs))
      .join('');
  }

  /** The kept relationships of the package (`package`), the workbook, or a sheet. */
  relationships(from: 'package' | 'workbook' | 'sheet', sheet?: number): Relationship[] {
    return (this.kept?.relationships ?? [])
      .filter((r) => r.from === from && r.at.sheet === sheet)
      .map(({ id, type, target, external }) => ({
        id,
        type,
        target,
        ...(external ? { external } : {}),
      }));
  }

  /** Each kept part a kept relationship still reaches, through kept parts, and the parts' own relationships. */
  parts(): { parts: OoxmlPart[]; relationships: [string, Relationship[]][] } {
    const byName = new Map<string, KeptPart>((this.kept?.parts ?? []).map((p) => [p.name, p]));
    const reached = new Map<string, KeptPart>();
    const queue = (this.kept?.relationships ?? [])
      .filter((r) => !r.external)
      .map((r) => r.target.slice(1));
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      const part = byName.get(name);
      if (!part || reached.has(name)) continue;
      reached.set(name, part);
      for (const rel of part.rels) {
        // A kept part's relationships came from a package that resolved each.
        if (!rel.external) queue.push(resolvePartName(name, rel.target)!);
      }
    }
    const parts = [...reached.values()];
    return {
      parts: parts.map((p) => ({ name: p.name, contentType: p.type, data: p.data })),
      relationships: parts.filter((p) => p.rels.length > 0).map((p) => [p.name, p.rels]),
    };
  }
}

/** Relationship ids for LiveDoc's own relationships of a part: `rId1`, `rId2`, ... none a kept one has. */
export function ownIds(kept: readonly Relationship[]): () => string {
  const taken = new Set(kept.map((r) => r.id));
  let n = 0;
  return () => {
    do n++;
    while (taken.has(`rId${n}`));
    return `rId${n}`;
  };
}
