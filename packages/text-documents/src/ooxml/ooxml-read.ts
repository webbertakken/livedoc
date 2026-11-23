// Reading an OOXML text document (standard-mapping.md): a WordprocessingML container into the model, every part and
// construct it does not map kept to write back, fields that run things dropped with their shown text kept.
import {
  attributeOf,
  childElement,
  childElements,
  keptXmlOf,
  OOXML_CONTENT_TYPES,
  ooxmlColour,
  parseXml,
  readOoxmlMetadata,
  readOoxmlPackage,
  refuse,
  RELATIONSHIP_TYPES,
  resolvePartName,
  serializeXml,
  textContent,
  type KeptXml,
  type OoxmlPackage,
  type PackageBudgets,
  type PackageRefusal,
  type Relationship,
  type XmlElement,
  type XmlNode,
  type XmlParsed,
} from '@livedoc/office-packages';
import type { Block, Field, FieldKind, Inline, Note, Paragraph, Run } from '../model/blocks';
import { LIST_LEVELS, type ListDefinition, type ListPlace } from '../model/lists';
import {
  canonical,
  compact,
  type KeptProperties,
  type ParagraphProps,
  type TextProps,
} from '../model/props';
import type { Section } from '../model/sections';
import { HeaderPartsReader, readEvenAndOdd, referenceSignature } from './ooxml-headers';
import { roleOfStyleName, Styles, type Style, type StyleDefaults } from '../model/styles';
import { TabStops, type TabStop } from '../model/tab-stops';
import { readTabEntries, readTabInterval } from './ooxml-tabs';
import { readPageless } from './ooxml-settings';
import type { OoxmlSource, TextDocument } from '../model/text-document';
import { isSafeLink, type ReportBuilder } from '../report';
import { sortedBindings } from '../odf/odf-read';
import { LIVEDOC_NS } from '../odf/odf-names';
import { MC_NS, R_NS, W_NS, W_STRICT_NS, WRITTEN_W_NS } from './ooxml-names';
import { ooxmlFieldKind } from './ooxml-fields';
import { adoptOoxmlMedia, ooxmlPictureLookup, readOoxmlPicture } from './ooxml-pictures';
import { MediaTaken, type FoundMedia } from '../picture-media';
import type { Picture } from '../model/pictures';
import { TEXT_DOCUMENT_MAX_OBJECTS } from '../limits';
import { FootnotesReader, markProps } from './ooxml-notes';
import { overLines, readOoxmlTable, tableLinesOf, type TableLines } from './ooxml-tables';
import {
  MAPPED_PPR,
  MAPPED_RPR,
  MAPPED_SECTPR,
  readLevels,
  readParagraphProps,
  readRunProps,
  readSection,
} from './ooxml-props';

const DOCUMENT_TYPES: readonly string[] = [
  OOXML_CONTENT_TYPES.document,
  OOXML_CONTENT_TYPES.template,
  OOXML_CONTENT_TYPES.macroDocument,
  OOXML_CONTENT_TYPES.macroTemplate,
];

const STRICT_R_NS = 'http://purl.oclc.org/ooxml/officeDocument/relationships';

/** Reads Strict's names as Transitional's, in place. */
function transitional(node: XmlElement): void {
  const fix = (uri: string) => (uri === W_STRICT_NS ? W_NS : uri === STRICT_R_NS ? R_NS : uri);
  const e = node as unknown as { uri: string; attributes: { uri: string }[]; children: XmlNode[] };
  e.uri = fix(e.uri);
  for (const a of e.attributes) a.uri = fix(a.uri);
  for (const c of e.children) if (typeof c !== 'string') transitional(c);
}

const isW = (e: XmlNode, local: string): boolean =>
  typeof e !== 'string' && e.uri === W_NS && e.local === local;
const wVal = (e: XmlElement | undefined, local = 'val') =>
  e ? attributeOf(e, W_NS, local) : undefined;
/** An on/off attribute that is there and not off (`0`, `false`, `off`). */
const isOnAttribute = (value: string | undefined) =>
  value !== undefined && !['0', 'false', 'off'].includes(value);

// Field instructions that run things or fetch from elsewhere (files-and-print.md "Import security").
const UNSAFE_FIELD = /^\s*(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK|IMPORT)\b/i;

type Parts = {
  document: XmlParsed;
  styles?: XmlParsed;
  numbering?: XmlParsed;
  settings?: XmlParsed;
};

export type OoxmlFileRead = { ok: true; document: TextDocument } | PackageRefusal;

/** Reads a WordprocessingML text document. */
export async function readOoxmlFile(
  bytes: Uint8Array<ArrayBuffer>,
  report: ReportBuilder,
  budgets?: PackageBudgets,
  maxObjects?: number,
): Promise<OoxmlFileRead> {
  const read = await readOoxmlPackage(bytes, budgets);
  if (!read.ok) return read;
  const pkg = read.package;
  if (!DOCUMENT_TYPES.includes(pkg.mediaType)) return refuse('package_wrong_type');
  for (const name of pkg.dropped)
    report.drop(
      /signature/.test(name)
        ? 'signature'
        : /thumbnail/.test(name)
          ? 'thumbnail'
          : /oleObject/.test(name)
            ? 'ole-object'
            : /activeX/.test(name)
              ? 'active-content'
              : 'macro',
      name,
    );
  for (const rel of pkg.external)
    if (rel.type !== RELATIONSHIP_TYPES.hyperlink)
      report.drop('external', rel.type.split('/').pop() ?? 'external');
  const parse = (name: string | undefined): XmlParsed | PackageRefusal | undefined => {
    const data = name === undefined ? undefined : pkg.parts.get(name);
    if (data === undefined) return undefined;
    const parsed = parseXml(new TextDecoder().decode(data), name);
    if (parsed.ok) transitional(parsed.root);
    return parsed;
  };
  const mainRels = pkg.relationships.get(pkg.mainPart) ?? [];
  const partOf = (type: string) => {
    const rel = mainRels.find((r) => r.type === type && !r.external);
    return rel && resolvePartName(pkg.mainPart, rel.target);
  };
  const stylesPart = partOf(RELATIONSHIP_TYPES.styles);
  const numberingPart = partOf(RELATIONSHIP_TYPES.numbering);
  const settingsPart = partOf(RELATIONSHIP_TYPES.settings);
  const corePart = (pkg.relationships.get('') ?? []).find(
    (r) => r.type === RELATIONSHIP_TYPES.coreProperties,
  );
  const appPart = (pkg.relationships.get('') ?? []).find(
    (r) => r.type === RELATIONSHIP_TYPES.extendedProperties,
  );
  const coreName = corePart && resolvePartName('', corePart.target);
  const appName = appPart && resolvePartName('', appPart.target);
  const parsed = [
    parse(pkg.mainPart),
    parse(stylesPart),
    parse(numberingPart),
    parse(coreName),
    parse(appName),
    parse(settingsPart),
  ];
  const refused = parsed.find((p): p is PackageRefusal => p !== undefined && !p.ok);
  if (refused) return refused;
  const [document, styles, numbering, core, app, settings] = parsed as (XmlParsed | undefined)[];
  const body = document && childElement(document.root, W_NS, 'body');
  if (!document || !body) return refuse('package_damaged', { entry: pkg.mainPart });
  const reader = new OoxmlReader(
    { document, ...compact({ styles, numbering, settings }) },
    pkg,
    report,
    parse,
    await ooxmlPictureLookup(pkg),
    maxObjects,
  );
  return {
    ok: true,
    document: reader.read(body, {
      stylesPart,
      numberingPart,
      coreName,
      appName,
      metadata: readOoxmlMetadata(core, app),
    }),
  };
}

/**
 * A num read as its abstract numbering's first num's list (standard-mapping.md "Lists"): continuing it, or restarting
 * levels at their start overrides, each once.
 */
type NumAlias = { list: string; starts: Map<number, number>; restarted: Set<number> };

/** A num's start overrides by level, when that is all it holds beyond its abstract numbering; else null. */
function restartsOf(num: XmlElement): Map<number, number> | null {
  const starts = new Map<number, number>();
  for (const c of childElements(num)) {
    if (isW(c, 'abstractNumId')) continue;
    if (!isW(c, 'lvlOverride')) return null;
    const inner = childElements(c);
    const start = Number(wVal(childElement(c, W_NS, 'startOverride')));
    const level = Number(wVal(c, 'ilvl'));
    if (inner.length !== 1 || !isW(inner[0]!, 'startOverride')) return null;
    if (!(level >= 0 && level < LIST_LEVELS) || !(Number.isInteger(start) && start >= 0))
      return null;
    starts.set(level, start);
  }
  return starts;
}

class OoxmlReader {
  readonly numAliases = new Map<string, NumAlias>();
  readonly parts: Parts;
  readonly pkg: OoxmlPackage;
  readonly report: ReportBuilder;
  readonly rels: readonly Relationship[];
  /** The part being read (the main part, or a header's): where kept XML and links come from. */
  part: { parsed: XmlParsed; name: string; rels: readonly Relationship[] };
  /** The media each image part holds, by part name, for the pictures read (objects.md "In the formats"). */
  readonly pictures: ReadonlyMap<string, FoundMedia>;
  /** The media the pictures read hold. */
  readonly taken: MediaTaken;
  /** The header and footer parts the sections name, each read once. */
  readonly headerParts = new HeaderPartsReader(this);
  /** The footnotes part, read once (page-layout.md "Footnotes"). */
  readonly footnotes = new FootnotesReader(this);
  /** While a note's paragraphs are read. */
  readingNote = false;
  readonly parsePart: (name: string) => XmlParsed | PackageRefusal | undefined;
  /** The styles and defaults read, for the stops each paragraph inherits. */
  tabs: { styles: readonly Style[]; defaults: StyleDefaults } = {
    styles: [],
    defaults: { paragraph: {}, text: {} },
  };

  /** The table styles of `styles.xml` by id, and the default one's id (tables.md "In the formats"). */
  readonly tableStyles = new Map<string, XmlElement>();
  defaultTableStyle: string | undefined;

  /** Tab stops a read left out or read as less (bar and list stops, heavy leaders), reported. */
  readonly dropTabs = (name: string): void => this.report.drop('tab-stop', name);

  constructor(
    parts: Parts,
    pkg: OoxmlPackage,
    report: ReportBuilder,
    parsePart: (name: string) => XmlParsed | PackageRefusal | undefined = () => undefined,
    pictures: ReadonlyMap<string, FoundMedia> = new Map(),
    maxObjects = TEXT_DOCUMENT_MAX_OBJECTS,
  ) {
    this.pictures = pictures;
    this.taken = new MediaTaken(maxObjects);
    this.parts = parts;
    this.pkg = pkg;
    this.report = report;
    this.rels = pkg.relationships.get(pkg.mainPart) ?? [];
    this.part = { parsed: parts.document, name: pkg.mainPart, rels: this.rels };
    this.parsePart = parsePart;
  }

  kept(parsed: XmlParsed, e: XmlElement): KeptXml {
    const unsafe = (x: XmlElement) =>
      (x.uri === W_NS && x.local === 'instrText' && UNSAFE_FIELD.test(textContent(x))) ||
      (x.uri === W_NS && x.local === 'fldSimple' && UNSAFE_FIELD.test(wVal(x, 'instr') ?? ''));
    const has = (x: XmlElement): boolean => childElements(x).some((c) => unsafe(c) || has(c));
    if (!unsafe(e) && !has(e)) return keptXmlOf(parsed, e);
    const omit = (x: XmlElement) => {
      if (!unsafe(x)) return false;
      this.report.drop('field', 'field');
      return true;
    };
    return { xml: serializeXml(e, omit), ns: keptXmlOf(parsed, e).ns };
  }

  propsKept(
    parsed: XmlParsed,
    e: XmlElement | undefined,
    values: unknown,
    mapped: ReadonlySet<string>,
  ): KeptProperties | undefined {
    if (!e) return undefined;
    const residue = childElements(e)
      .filter((c) => !(c.uri === W_NS && mapped.has(c.local)))
      .map((c) => keptXmlOf(parsed, c));
    return { xml: keptXmlOf(parsed, e), read: canonical(values), residue };
  }

  readStyles(): { styles: Style[]; defaults: StyleDefaults; kept: KeptXml[] } {
    const parsed = this.parts.styles;
    const out: Style[] = [];
    const kept: KeptXml[] = [];
    let defaults: StyleDefaults = { paragraph: {}, text: {} };
    const tabsOf = this.styleTabs();
    const interval = readTabInterval(this.parts.settings?.root);
    for (const e of parsed ? childElements(parsed.root) : []) {
      if (isW(e, 'docDefaults')) {
        const pPr = childElement(childElement(e, W_NS, 'pPrDefault') ?? e, W_NS, 'pPr');
        const rPr = childElement(childElement(e, W_NS, 'rPrDefault') ?? e, W_NS, 'rPr');
        const paragraph = compact({
          ...readParagraphProps(pPr, [], this.dropTabs),
          tabInterval: interval,
        });
        const values = { paragraph, text: readRunProps(rPr).props };
        defaults = {
          ...values,
          kept: { xml: keptXmlOf(parsed!, e), read: canonical(values), residue: [] },
        };
        continue;
      }
      if (isW(e, 'style') && wVal(e, 'type') === 'table') {
        const id = wVal(e, 'styleId') ?? '';
        this.tableStyles.set(id, e);
        if (isOnAttribute(wVal(e, 'default'))) this.defaultTableStyle = id;
      }
      const type = wVal(e, 'type');
      if (!isW(e, 'style') || (type !== 'paragraph' && type !== 'character')) {
        kept.push(keptXmlOf(parsed!, e));
        continue;
      }
      const id = wVal(e, 'styleId') ?? '';
      const name = wVal(childElement(e, W_NS, 'name')) ?? id;
      const values = compact({
        id,
        name,
        family: type === 'character' ? ('text' as const) : ('paragraph' as const),
        parent: wVal(childElement(e, W_NS, 'basedOn')),
        next: wVal(childElement(e, W_NS, 'next')),
        role: type === 'paragraph' ? (roleOfStyleName(name) ?? roleOfStyleName(id)) : undefined,
        paragraph: readParagraphProps(
          childElement(e, W_NS, 'pPr'),
          tabsOf(wVal(childElement(e, W_NS, 'basedOn'))),
          type === 'paragraph' ? this.dropTabs : undefined,
        ),
        text: readRunProps(childElement(e, W_NS, 'rPr')).props,
      });
      const residue = childElements(e)
        .filter(
          (c) => !(c.uri === W_NS && ['name', 'basedOn', 'next', 'pPr', 'rPr'].includes(c.local)),
        )
        .map((c) => keptXmlOf(parsed!, c));
      out.push({
        ...values,
        kept: { xml: keptXmlOf(parsed!, e), read: canonical(values), residue },
      });
    }
    this.tabs = { styles: out, defaults };
    return { styles: out, defaults, kept };
  }

  /**
   * The stops each paragraph style draws with, by id: Word's `w:tabs` merged down `w:basedOn` from the document
   * defaults' (standard-mapping.md "The model", tab stops). A style the file does not name inherits the defaults'.
   */
  styleTabs(): (id: string | undefined) => readonly TabStop[] {
    const parsed = this.parts.styles;
    const elements = new Map<string, XmlElement>();
    let base: readonly TabStop[] = [];
    for (const e of parsed ? childElements(parsed.root) : []) {
      if (isW(e, 'docDefaults')) {
        const pPr = childElement(childElement(e, W_NS, 'pPrDefault') ?? e, W_NS, 'pPr');
        base = TabStops.merge([], readTabEntries(pPr, () => {}) ?? { clears: [], sets: [] });
      } else if (isW(e, 'style') && wVal(e, 'type') === 'paragraph')
        elements.set(wVal(e, 'styleId') ?? '', e);
    }
    const resolved = new Map<string, readonly TabStop[]>();
    const of = (id: string | undefined, seen: Set<string>): readonly TabStop[] => {
      const e = id === undefined ? undefined : elements.get(id);
      if (id === undefined || !e || seen.has(id)) return base;
      const known = resolved.get(id);
      if (known) return known;
      seen.add(id);
      const inherited = of(wVal(childElement(e, W_NS, 'basedOn')), seen);
      const entries = readTabEntries(childElement(e, W_NS, 'pPr'), () => {});
      const stops = entries ? TabStops.merge(inherited, entries) : inherited;
      resolved.set(id, stops);
      return stops;
    };
    return (id) => of(id, new Set());
  }

  readLists(): { lists: Record<string, ListDefinition>; kept: KeptXml[] } {
    const parsed = this.parts.numbering;
    const lists: Record<string, ListDefinition> = {};
    const kept: KeptXml[] = [];
    if (!parsed) return { lists, kept };
    const abstracts = new Map<string, XmlElement>();
    for (const e of childElements(parsed.root))
      if (isW(e, 'abstractNum')) abstracts.set(wVal(e, 'abstractNumId') ?? '', e);
    // The first num of each abstract numbering, by abstract id.
    const baseOf = new Map<string, string>();
    for (const e of childElements(parsed.root)) {
      if (isW(e, 'abstractNum')) continue;
      if (!isW(e, 'num')) {
        kept.push(keptXmlOf(parsed, e));
        continue;
      }
      const id = wVal(e, 'numId') ?? '';
      const abstractId = wVal(childElement(e, W_NS, 'abstractNumId')) ?? '';
      const abstract = abstracts.get(abstractId);
      // A later num of an abstract numbering already read, with no levels of its own, continues that list, or
      // restarts it at its start overrides (standard-mapping.md "Lists"): Word counts nums of one abstract on.
      const base = baseOf.get(abstractId);
      const starts = restartsOf(e);
      if (base !== undefined && starts) {
        this.numAliases.set(id, { list: base, starts, restarted: new Set() });
        continue;
      }
      if (!baseOf.has(abstractId)) baseOf.set(abstractId, id);
      const levels = readLevels(abstract, e);
      lists[id] = {
        levels,
        kept: {
          xml: keptXmlOf(parsed, e),
          read: canonical(levels),
          residue: abstract ? [keptXmlOf(parsed, abstract)] : [],
          name: abstractId,
        },
      };
    }
    return { lists, kept };
  }

  read(
    body: XmlElement,
    names: {
      stylesPart?: string;
      numberingPart?: string;
      coreName?: string;
      appName?: string;
      metadata: TextDocument['metadata'];
    },
  ): TextDocument {
    const doc = this.parts.document;
    const { styles, defaults, kept: keptStyles } = this.readStyles();
    const { lists, kept: keptNumbering } = this.readLists();
    const pageColor = ooxmlColour(wVal(childElement(doc.root, W_NS, 'background'), 'color'));
    const oddEven = readEvenAndOdd(this.parts.settings?.root);
    // The page colour is the whole document's in OOXML (`w:background`): it is the first section's in the model.
    const sectionOf = (sectPr: XmlElement, at: number): Section => {
      const values = readSection(sectPr, at === 0 ? pageColor : undefined, () =>
        this.report.drop('column-width', 'column-width'),
      );
      const headers = this.headerParts.headersOf(sectPr, oddEven);
      const keptValues = { ...values, references: referenceSignature(headers, false) };
      return {
        ...values,
        ...compact({ headers }),
        kept: this.propsKept(doc, sectPr, keptValues, MAPPED_SECTPR)!,
      };
    };
    const elements = childElements(body);
    const finalSectPr = elements.findLast((e) => isW(e, 'sectPr'));
    const sectPrs = elements.flatMap((e) => {
      const s = isW(e, 'p')
        ? childElement(childElement(e, W_NS, 'pPr') ?? e, W_NS, 'sectPr')
        : undefined;
      return s && isW(e, 'p') ? [s] : [];
    });
    const all = [...sectPrs, ...(finalSectPr ? [finalSectPr] : [])];
    const sections = all.map((s, at) => sectionOf(s, at));
    const first: Section = sections[0] ?? {
      start: 'next-page',
      setup: readSection(
        {
          uri: W_NS,
          local: 'sectPr',
          prefix: 'w',
          attributes: [],
          children: [],
          declared: {},
          scope: {},
          start: 0,
          end: 0,
        },
        pageColor,
      ).setup,
    };
    const blocks: Block[] = [];
    let sectionAt = 0;
    for (const e of elements) {
      if (isW(e, 'p')) {
        const ends = childElement(childElement(e, W_NS, 'pPr') ?? e, W_NS, 'sectPr') !== undefined;
        // A paragraph holding a `w:sectPr` ends the section that sectPr describes; the next one starts after it.
        const next = ends ? sections[sectionAt + 1] : undefined;
        blocks.push(this.paragraph(e, ends ? sections[sectionAt] : undefined));
        if (ends) {
          sectionAt += 1;
          if (next) blocks.push({ type: 'section', ...next });
        }
      } else if (isW(e, 'sectPr')) continue;
      else if (isW(e, 'tbl')) {
        const table = this.table(e);
        if (table) blocks.push(table);
      } else if (isW(e, 'proofErr')) this.report.drop('layout-hint', e.local);
      else {
        blocks.push({ type: 'kept', name: e.local, xml: this.kept(doc, e) });
        this.report.keep(e.local);
      }
    }
    if (!blocks.some((b) => b.type === 'paragraph'))
      blocks.push({
        type: 'paragraph',
        style: styles.find((s) => s.role === 'normal')?.id ?? 'Normal',
        props: {},
        inlines: [],
      });
    const ignorable = (attributeOf(doc.root, MC_NS, 'Ignorable') ?? '')
      .split(/\s+/)
      .filter((p) => p && p !== 'livedoc');
    const footnotes = this.footnotes.kept();
    const source: OoxmlSource = {
      format: 'ooxml',
      mainPart: this.pkg.mainPart,
      mainContentType: this.pkg.mediaType,
      documentNamespaces: withoutWritten(doc.root.scope),
      ignorable,
      ...compact({ stylesPart: names.stylesPart, numberingPart: names.numberingPart }),
      stylesNamespaces: withoutWritten(this.parts.styles?.root.scope ?? {}),
      styles: keptStyles,
      numberingNamespaces: withoutWritten(this.parts.numbering?.root.scope ?? {}),
      numbering: keptNumbering,
      ...compact({ footnotes }),
      // Header and footer parts the sections hold are the model's, written from it; so is the footnotes part.
      parts: [...this.pkg.parts]
        .filter(
          ([name]) =>
            ![
              this.pkg.mainPart,
              names.stylesPart,
              names.numberingPart,
              names.coreName,
              names.appName,
              footnotes?.part,
            ].includes(name) && !this.headerParts.holds(name),
        )
        .map(([name, data]) => ({
          name,
          data,
          mediaType: this.pkg.contentTypes.get(name) ?? 'application/octet-stream',
        })),
      // By source part, so a package read again (whatever order it lists its parts in) holds them alike.
      relationships: new Map(
        [...this.pkg.relationships]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          // The package's own relationships LiveDoc writes itself (the main part, core and app properties) are not kept.
          .map(([from, rels]) => [
            from,
            byId(from === '' ? rels.filter((r) => !PACKAGE_WRITTEN.has(r.type)) : rels),
          ]),
      ),
      // Every written package defaults `rels` and `xml`; the rest by extension, sorted.
      defaults: new Map(
        [...this.pkg.defaults]
          .filter(([ext]) => ext !== 'rels' && ext !== 'xml')
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
    };
    const document: TextDocument = {
      format: 'ooxml',
      metadata: names.metadata,
      defaults,
      styles,
      lists,
      section: first,
      ...(readPageless(this.parts.settings?.root) ? { pageless: true as const } : {}),
      body: blocks,
      ...compact({ media: this.taken.held() }),
      source,
    };
    return adoptOoxmlMedia(document, this.taken);
  }

  paragraph(p: XmlElement, endsWith: Section | undefined): Paragraph {
    const doc = this.part.parsed;
    const pPr = childElement(p, W_NS, 'pPr');
    const numPr = pPr && childElement(pPr, W_NS, 'numPr');
    const numId = wVal(childElement(numPr ?? p, W_NS, 'numId'));
    const level = Number(wVal(childElement(numPr ?? p, W_NS, 'ilvl')) ?? '0');
    const checked = attributeOf(p, LIVEDOC_NS, 'checked') === 'true';
    const at = Math.max(0, Math.min(8, level || 0));
    const alias = numId === undefined ? undefined : this.numAliases.get(numId);
    // A restarting num restarts each of its levels once, at the first item of that level.
    const restart = alias?.restarted.has(at) ? undefined : alias?.starts.get(at);
    if (restart !== undefined) alias!.restarted.add(at);
    const list: ListPlace | undefined =
      numId !== undefined && numId !== '0'
        ? compact({
            id: alias?.list ?? numId,
            level: at,
            checked: checked || undefined,
            restart,
          })
        : undefined;
    const style = wVal(childElement(pPr ?? p, W_NS, 'pStyle')) ?? this.normalId();
    const read = readParagraphProps(
      pPr,
      Styles.paragraphPropsOf(this.tabs.styles, this.tabs.defaults, style).tabStops ?? [],
      this.dropTabs,
    );
    // A column break at the paragraph's start is its column break before (page-layout.md "Breaks").
    const runs = new RunReader(this, p);
    const inlines = runs.read();
    const props: ParagraphProps = runs.columnBreak ? { ...read, columnBreakBefore: true } : read;
    const values = {
      style,
      props,
      // The num as written: a restarting num is its own, so the kept properties hold only while it is written again.
      list: list && { id: numId!, level: list.level },
      section: endsWith && {
        start: endsWith.start,
        setup: endsWith.setup,
        references: referenceSignature(endsWith.headers, false),
      },
    };
    const kept = this.propsKept(doc, pPr, values, MAPPED_PPR);
    return {
      type: 'paragraph',
      style,
      props,
      ...compact({ list, kept }),
      inlines,
    };
  }

  /** A table style's lines and margins, down its `w:basedOn`; the default table style's for none. */
  styleLines(id: string | undefined, seen = new Set<string>()): TableLines {
    const empty: TableLines = { borders: {}, margins: {} };
    const style = this.tableStyles.get(id ?? this.defaultTableStyle ?? '');
    if (!style || seen.has(id ?? '')) return empty;
    seen.add(id ?? '');
    const parent = wVal(childElement(style, W_NS, 'basedOn'));
    const under = parent === undefined ? empty : this.styleLines(parent, seen);
    return overLines(under, tableLinesOf(childElement(style, W_NS, 'tblPr')));
  }

  /** A `w:tbl` as a table, a kept block past the limits, or nothing for one with no rows. */
  table(tbl: XmlElement): Block | null {
    return readOoxmlTable(tbl, {
      cellBlocks: (tc) => this.blocksOf(tc),
      kept: (e) => this.kept(this.part.parsed, e),
      propsKept: (e, values, mapped) => this.propsKept(this.part.parsed, e, values, mapped),
      styleLines: (id) => this.styleLines(id),
      report: this.report,
      normal: this.normalId(),
    });
  }

  /** The blocks a cell, header, footer or note holds: paragraphs, tables and kept elements. */
  blocksOf(parent: XmlElement): Block[] {
    const blocks: Block[] = [];
    for (const e of childElements(parent)) {
      if (isW(e, 'p')) blocks.push(this.paragraph(e, undefined));
      else if (isW(e, 'tbl')) {
        const table = this.table(e);
        if (table) blocks.push(table);
      } else if (isW(e, 'tcPr')) continue;
      else if (isW(e, 'proofErr')) this.report.drop('layout-hint', e.local);
      else {
        blocks.push({ type: 'kept', name: e.local, xml: this.kept(this.part.parsed, e) });
        this.report.keep(e.local);
      }
    }
    return blocks;
  }

  normalId(): string {
    const styles = this.parts.styles;
    const normal =
      styles &&
      childElements(styles.root).find(
        (e) => isW(e, 'style') && wVal(e, 'type') === 'paragraph' && wVal(e, 'default') === '1',
      );
    return (normal && wVal(normal, 'styleId')) ?? 'Normal';
  }

  linkOf(e: XmlElement): string | undefined {
    const anchor = wVal(e, 'anchor');
    if (anchor !== undefined) return `#${anchor}`;
    const id = attributeOf(e, R_NS, 'id');
    return this.part.rels.find((r) => r.id === id)?.target;
  }
}

/** Relationships in the order of their ids, so a package reads the same whichever order it listed them in. */
export const byId = (rels: readonly Relationship[]): Relationship[] =>
  [...rels].sort(
    (a, b) => idNumber(a.id) - idNumber(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

/** The package relationships every written file has, written by LiveDoc, never kept. */
const PACKAGE_WRITTEN: ReadonlySet<string> = new Set([
  RELATIONSHIP_TYPES.officeDocument,
  RELATIONSHIP_TYPES.coreProperties,
  RELATIONSHIP_TYPES.extendedProperties,
]);

const idNumber = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);

function withoutWritten(scope: Readonly<Record<string, string>>): Record<string, string> {
  // Every written part declares LiveDoc's own bindings, so a file's other prefix for one of them is not kept; nor is a
  // default namespace (Google Docs declares one): every element LiveDoc writes is prefixed, and kept XML carries the
  // bindings it uses.
  const written = new Set(Object.values(WRITTEN_W_NS));
  return sortedBindings(
    Object.fromEntries(Object.entries(scope).filter(([p, uri]) => p !== '' && !written.has(uri))),
  );
}

type RunContext = { link?: string };

/** An on/off attribute's values that mean off. */
const OFF: ReadonlySet<string> = new Set(['0', 'false', 'off']);

class RunReader {
  readonly out: Inline[] = [];
  /** A column break opened the paragraph: its column break before (page-layout.md "Breaks"). */
  columnBreak = false;
  readonly r: OoxmlReader;
  readonly p: XmlElement;
  readonly skipped = new Set<XmlElement>();
  /** Complex fields the model holds (page-layout.md "Page numbers"), by their begin run: what each is, and its result runs. */
  readonly fields = new Map<XmlElement, { kind: FieldKind; results: XmlElement[] }>();

  constructor(r: OoxmlReader, p: XmlElement) {
    this.r = r;
    this.p = p;
    this.markUnsafeFields();
  }

  /** Complex fields whose instruction runs things: their begin, instruction, separator and end runs are skipped. */
  markUnsafeFields(): void {
    const runs: XmlElement[] = [];
    const collect = (e: XmlElement) => {
      for (const c of childElements(e)) {
        if (isW(c, 'r')) runs.push(c);
        else if (!isW(c, 'p')) collect(c);
      }
    };
    collect(this.p);
    const stack: { runs: XmlElement[]; instr: string; result: boolean; results: XmlElement[] }[] =
      [];
    // A field's marks in the order written: one a run as Word writes them, or all in one run as Google Docs does.
    const marksOf = (run: XmlElement) =>
      childElements(run).flatMap((c) =>
        isW(c, 'fldChar')
          ? [{ char: wVal(c, 'fldCharType'), instr: undefined as XmlElement | undefined }]
          : isW(c, 'instrText')
            ? [{ char: undefined, instr: c }]
            : [],
      );
    const add = (runs: XmlElement[], run: XmlElement) => {
      if (runs.at(-1) !== run) runs.push(run);
    };
    for (const run of runs) {
      const marks = marksOf(run);
      if (!marks.some((m) => m.char === 'end'))
        for (const open of stack) if (open.result) add(open.results, run);
      for (const { char, instr } of marks) {
        if (char === 'begin') {
          stack.push({ runs: [run], instr: '', result: false, results: [] });
          continue;
        }
        const top = stack.at(-1);
        if (!top) continue;
        if (instr && !top.result) {
          top.instr += textContent(instr);
          add(top.runs, run);
        } else if (char === 'separate') {
          top.result = true;
          add(top.runs, run);
        } else if (char === 'end') {
          add(top.runs, run);
          top.results = top.results.filter((r) => !top.runs.includes(r));
          stack.pop();
          const kind = ooxmlFieldKind(top.instr);
          if (UNSAFE_FIELD.test(top.instr)) {
            this.r.report.drop('field', top.instr.trim().split(/\s+/)[0]!.toUpperCase());
            for (const skip of top.runs) this.skipped.add(skip);
          } else if (kind) {
            // One field from its begin run; every other run of it is read there.
            this.fields.set(top.runs[0]!, { kind, results: top.results });
            for (const skip of [...top.runs, ...top.results]) this.skipped.add(skip);
          }
        }
      }
    }
  }

  read(): Inline[] {
    for (const c of childElements(this.p)) this.node(c, {});
    return this.out;
  }

  push(
    text: string,
    style: string | undefined,
    props: TextProps,
    link: string | undefined,
    kept: KeptProperties | undefined,
  ): void {
    if (!text) return;
    const last = this.out.at(-1);
    if (
      last?.type === 'run' &&
      last.style === style &&
      last.link === link &&
      last.kept === kept &&
      canonical(last.props) === canonical(props)
    ) {
      this.out[this.out.length - 1] = { ...last, text: last.text + text };
      return;
    }
    const run: Run = { type: 'run', text, props, ...compact({ style, link, kept }) };
    this.out.push(run);
  }

  keepInline(
    e: XmlElement,
    ctx: RunContext,
    props: TextProps = {},
    style?: string,
    xml?: KeptXml,
  ): void {
    this.r.report.keep(e.local);
    this.out.push({
      type: 'kept',
      name: e.local,
      xml: xml ?? this.r.kept(this.r.part.parsed, e),
      props,
      ...compact({ style, link: ctx.link }),
    });
  }

  node(e: XmlElement, ctx: RunContext): void {
    if (e.uri === W_NS) {
      if (e.local === 'pPr') return;
      if (e.local === 'r') return this.run(e, ctx);
      if (e.local === 'proofErr') {
        this.r.report.drop('layout-hint', e.local);
        return;
      }
      if (e.local === 'hyperlink') {
        const href = this.r.linkOf(e);
        const safe = href !== undefined && isSafeLink(href);
        if (href !== undefined && !safe) this.r.report.drop('link', 'link');
        for (const c of childElements(e)) this.node(c, safe ? { link: href } : {});
        return;
      }
      const simple = e.local === 'fldSimple' ? ooxmlFieldKind(wVal(e, 'instr') ?? '') : undefined;
      if (simple) {
        const results = childElements(e).filter((c) => isW(c, 'r'));
        return this.field(simple, results, e, ctx);
      }
      if (e.local === 'fldSimple' && UNSAFE_FIELD.test(wVal(e, 'instr') ?? '')) {
        this.r.report.drop('field', (wVal(e, 'instr') ?? '').trim().split(/\s+/)[0]!.toUpperCase());
        for (const c of childElements(e)) this.node(c, ctx);
        return;
      }
    }
    this.keepInline(e, ctx);
  }

  run(r: XmlElement, ctx: RunContext): void {
    const field = this.fields.get(r);
    if (field) return this.field(field.kind, field.results, r, ctx);
    if (this.skipped.has(r)) return;
    const doc = this.r.part.parsed;
    const rPr = childElement(r, W_NS, 'rPr');
    const { style, props } = readRunProps(rPr);
    const kept = this.r.propsKept(doc, rPr, { style, props }, MAPPED_RPR);
    for (const c of childElements(r)) {
      if (c.uri !== W_NS) {
        this.keepWhole(r, rPr, c, ctx, props, style);
        continue;
      }
      switch (c.local) {
        case 'rPr':
          break;
        case 'drawing':
          if (!this.picture(c, ctx, props, style, kept))
            this.keepWhole(r, rPr, c, ctx, props, style);
          break;
        case 't':
          this.push(textContent(c), style, props, ctx.link, kept);
          break;
        case 'tab':
          this.push('\t', style, props, ctx.link, kept);
          break;
        case 'cr':
          this.push('\n', style, props, ctx.link, kept);
          break;
        case 'noBreakHyphen':
          this.push('\u2011', style, props, ctx.link, kept);
          break;
        case 'softHyphen':
          this.push('\u00ad', style, props, ctx.link, kept);
          break;
        case 'lastRenderedPageBreak':
          this.r.report.drop('layout-hint', c.local);
          break;
        case 'footnoteRef':
          // A note's number, drawn from its place; the model holds no text for it.
          if (!this.r.readingNote) this.keepWhole(r, rPr, c, ctx, props, style);
          break;
        case 'footnoteReference':
          if (!this.note(c, rPr, ctx)) this.keepWhole(r, rPr, c, ctx, props, style);
          break;
        case 'br': {
          const type = wVal(c, 'type');
          if (type === 'column' && this.out.length === 0 && !this.columnBreak)
            this.columnBreak = true;
          else if (type === undefined || type === 'textWrapping')
            this.push('\n', style, props, ctx.link, kept);
          else this.keepWhole(r, rPr, c, ctx, props, style);
          break;
        }
        default:
          this.keepWhole(r, rPr, c, ctx, props, style);
      }
    }
  }

  /**
   * A footnote's mark as the model's note (page-layout.md "Footnotes"): in the body, naming a footnote of the footnotes
   * part, its own number (no custom mark); its formatting the run's, without the superscript every mark has.
   */
  note(reference: XmlElement, rPr: XmlElement | undefined, ctx: RunContext): boolean {
    const custom = attributeOf(reference, W_NS, 'customMarkFollows');
    const id = attributeOf(reference, W_NS, 'id');
    if (this.r.readingNote || this.r.part.parsed !== this.r.parts.document) return false;
    if ((custom !== undefined && !OFF.has(custom)) || id === undefined) return false;
    const blocks = this.r.footnotes.blocks(id);
    if (!blocks) return false;
    const read = readRunProps(rPr);
    const props = markProps(read.props);
    const kept = this.r.propsKept(
      this.r.part.parsed,
      rPr,
      { style: read.style, props },
      MAPPED_RPR,
    );
    this.out.push({
      type: 'note',
      blocks,
      props,
      ...compact({ style: read.style, link: ctx.link, kept }),
    } satisfies Note);
    return true;
  }

  /** A field: its result runs' text, the formatting of the first (else of the run it begins at). */
  field(kind: FieldKind, results: readonly XmlElement[], at: XmlElement, ctx: RunContext): void {
    const doc = this.r.part.parsed;
    const rPr = childElement(results[0] ?? at, W_NS, 'rPr');
    const { style, props } = readRunProps(rPr);
    const kept = this.r.propsKept(doc, rPr, { style, props }, MAPPED_RPR);
    const text = results
      .flatMap((r) => childElements(r).filter((c) => isW(c, 't')))
      .map((t) => textContent(t))
      .join('');
    this.out.push({
      type: 'field',
      field: kind,
      text,
      props,
      ...compact({ style, link: ctx.link, kept }),
    } satisfies Field);
  }

  /** A drawing read as a picture, in line or placed, when it holds only what the model maps (objects.md "In the formats"). */
  picture(
    drawing: XmlElement,
    ctx: RunContext,
    props: TextProps,
    style: string | undefined,
    kept: KeptProperties | undefined,
  ): boolean {
    const part = this.r.part;
    const read = readOoxmlPicture(
      drawing,
      (id) => {
        const rel = part.rels.find((r) => r.id === id);
        if (!rel || rel.external || rel.type !== RELATIONSHIP_TYPES.image) return undefined;
        const name = resolvePartName(part.name, rel.target);
        return name === undefined ? undefined : this.r.pictures.get(name);
      },
      this.r.taken,
      // A picture is placed only in the body (objects.md "Placement read"): never in a note, header or footer.
      part.name === this.r.pkg.mainPart,
    );
    if (!read) return false;
    this.out.push({
      type: 'picture',
      ...read,
      props,
      ...compact({ style, link: ctx.link, kept }),
    } satisfies Picture);
    return true;
  }

  /** A run's unmapped child kept as a run of its own, with the run's formatting inside it. */
  keepWhole(
    r: XmlElement,
    rPr: XmlElement | undefined,
    c: XmlElement,
    ctx: RunContext,
    props: TextProps,
    style: string | undefined,
  ): void {
    const doc = this.r.part.parsed;
    const inner = this.r.kept(doc, c);
    const pr = rPr ? keptXmlOf(doc, rPr) : undefined;
    const prefix = r.prefix ? `${r.prefix}:` : '';
    const xml: KeptXml = {
      xml: `<${prefix}r>${pr?.xml ?? ''}${inner.xml}</${prefix}r>`,
      ns: { ...pr?.ns, ...inner.ns, [r.prefix]: r.uri },
    };
    this.keepInline(c, ctx, props, style, xml);
  }
}
