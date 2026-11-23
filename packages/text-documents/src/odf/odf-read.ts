// Reading an ODF text document (standard-mapping.md): the parts of a package or a flat file into the model, with
// everything the model does not map kept where it stood, and every drop reported.
import {
  attributeOf,
  childElement,
  childElements,
  keptXmlOf,
  readOdfMeta,
  serializeXml,
  startTagBindings,
  type KeptXml,
  type XmlElement,
  type XmlNode,
  type XmlParsed,
} from '@livedoc/office-packages';
import type {
  Block,
  Field,
  Note,
  Inline,
  KeptInline,
  Paragraph,
  Run,
  SectionBreak,
} from '../model/blocks';
import {
  canonical,
  compact,
  type KeptProperties,
  type ParagraphProps,
  type TextProps,
} from '../model/props';
import { ListDefinition, type ListPlace } from '../model/lists';
import { PageSetup, type Section } from '../model/sections';
import { roleOfStyleName, Styles, type Style, type StyleDefaults } from '../model/styles';
import type { KeptEntry, OdfSource, TextDocument } from '../model/text-document';
import { isSafeLink, type ReportBuilder } from '../report';
import { LIVEDOC_NS, NS, WRITTEN_NS } from './odf-names';
import { readListLevels } from './odf-lists';
import {
  readColumns,
  readPageSetup,
  readParagraphProps,
  readTextProps,
  unquote,
} from './odf-props';
import { keptSettings, pagelessIn } from './odf-settings';
import { masterStoryElements, unlinked, withHeaderMargins, withoutStories } from './odf-headers';
import {
  HeadersAndFooters,
  type HeaderFooter,
  type HeaderFooterKind,
  type HeaderFooterSlot,
  type SectionHeaders,
} from '../model/headers';
import { stopsRead, stylesStopsRead, tabsFromIndentIn } from './odf-tabs';
import { odfFieldKind, odfFieldText } from './odf-fields';
import { odfFootnoteBody } from './odf-notes';
import { readOdfPicture, type OdfPictureLookup } from './odf-pictures';
import { keptXmlTexts, MediaTaken } from '../picture-media';
import type { Picture } from '../model/pictures';
import { TEXT_DOCUMENT_MAX_OBJECTS } from '../limits';
import {
  isLineNumbering,
  paragraphLinesOf,
  readLineNumbering,
  sectionLines,
  type LineNumbering,
  type ParagraphLines,
} from './odf-lines';
import { readOdfTable } from './odf-tables';

export type OdfParts = {
  content: XmlParsed;
  /** Absent for a package without `styles.xml`; the flat file's one root otherwise. */
  styles?: XmlParsed;
  meta?: XmlParsed;
  settings?: XmlParsed;
  entries: readonly KeptEntry[];
  /** The media each `draw:image` may hold as a picture's (objects.md "In the formats"). */
  pictures?: OdfPictureLookup;
  /** The most pictures the document holds; past it, the rest stay kept. */
  maxObjects?: number;
};

const is = (e: XmlNode, uri: string, local: string): boolean =>
  typeof e !== 'string' && e.uri === uri && e.local === local;

type AutoStyle = {
  family: string;
  parent?: string;
  master?: string;
  /** The page number its paragraph's page starts at (`style:page-number`), an integer; `auto` is none. */
  pageNumber?: number;
  /** What its paragraph says of its line (page-layout.md "Line numbers"). */
  lines?: ParagraphLines;
  paragraph: ParagraphProps;
  text: TextProps;
  kept: KeptXml;
  element: XmlElement;
};

// Elements that run things: dropped with their declarations, their last shown text kept (files-and-print.md).
const DDE = new Set(['dde-connection', 'dde-connection-decls', 'dde-connection-decl']);
const isDde = (e: XmlElement) =>
  (e.uri === NS.text || e.uri === NS.office || e.uri === NS.table) &&
  (DDE.has(e.local) || e.local === 'dde-source' || e.local === 'dde-links');
const isOle = (e: XmlElement) => e.uri === NS.draw && e.local === 'object-ole';

function hasAny(e: XmlElement, test: (e: XmlElement) => boolean): boolean {
  return childElements(e).some((c) => test(c) || hasAny(c, test));
}

class OdfReader {
  readonly faces = new Map<string, string>();
  readonly auto = new Map<string, AutoStyle>();
  readonly namedLists = new Map<string, XmlElement & { parsed: XmlParsed }>();
  readonly autoLists = new Map<string, XmlElement & { parsed: XmlParsed }>();
  readonly lists: Record<string, ListDefinition> = {};
  readonly listIds = new Map<string, string>();
  readonly lastListOfStyle = new Map<string, string>();
  readonly pageLayouts = new Map<string, { element: XmlElement; parsed: XmlParsed }>();
  readonly masters = new Map<string, string>();
  /** Each master page's element, for its headers and footers. */
  readonly masterElements = new Map<string, { element: XmlElement; parsed: XmlParsed }>();
  /** styles.xml's automatic paragraph and text styles: a header's paragraphs name them. */
  readonly stylesAuto = new Map<string, AutoStyle>();
  /** The document's line numbering, as its configuration has it (page-layout.md "Line numbers"). */
  lineNumbering: LineNumbering = { on: false, restartOnPage: false, increment: 1 };
  /** The part being read and the automatic styles its paragraphs name: the body's, or a header's. */
  part!: { parsed: XmlParsed; auto: Map<string, AutoStyle> };
  /** Reads a header's or footer's element as blocks (set once the styles are read). */
  readStory: (element: XmlElement) => Block[] = () => [];
  /** Each master page's headers and footers, read once, so sections sharing one share them. */
  readonly #masterHeaders = new Map<string, SectionHeaders | undefined>();
  /** Each header's XML as its master page holds it, to find a section's linked ones. */
  readonly storyXml = new WeakMap<HeaderFooter, string>();
  #listCount = 0;

  readonly parts: OdfParts;
  readonly report: ReportBuilder;
  /** The media the pictures read hold. */
  readonly taken: MediaTaken;
  /** Whether the file counts tab positions from the indent (standard-mapping.md "The model", tab stops). */
  readonly tabsFromIndent: boolean;

  constructor(parts: OdfParts, report: ReportBuilder) {
    this.parts = parts;
    this.report = report;
    this.taken = new MediaTaken(parts.maxObjects ?? TEXT_DOCUMENT_MAX_OBJECTS);
    this.part = { parsed: parts.content, auto: this.auto };
    this.tabsFromIndent = tabsFromIndentIn(
      parts.settings && childElement(parts.settings.root, NS.office, 'settings'),
    );
  }

  /** Tab stops a read left out (bar stops, past the range or the most), reported. */
  readonly dropTabs = (count: number): void => this.report.drop('tab-stop', 'tab-stop', count);
  readonly unequalColumns = (): void => this.report.drop('column-width', 'column-width');

  /** Kept XML, with what runs things and OLE binaries left out and reported. */
  kept(parsed: XmlParsed, element: XmlElement): KeptXml {
    const unsafe = (e: XmlElement) => isDde(e) || isOle(e);
    if (!hasAny(element, unsafe)) return keptXmlOf(parsed, element);
    const omit = (e: XmlElement) => {
      if (!unsafe(e)) return false;
      this.report.drop(isOle(e) ? 'ole-object' : 'field', e.local);
      return true;
    };
    return { xml: serializeXml(element, omit), ns: keptXmlOf(parsed, element).ns };
  }

  readFaces(parsed: XmlParsed | undefined, into: KeptXml[]): void {
    const decls = parsed && childElement(parsed.root, NS.office, 'font-face-decls');
    for (const face of decls ? childElements(decls) : []) {
      const name = attributeOf(face, NS.style, 'name');
      const family = attributeOf(face, NS.svg, 'font-family');
      if (name && !this.faces.has(name)) {
        this.faces.set(name, family ? unquote(family) : name);
        into.push(keptXmlOf(parsed!, face));
      }
    }
  }

  readAutomatic(parsed: XmlParsed, into: { name: string; xml: KeptXml }[], forBody: boolean): void {
    const automatic = childElement(parsed.root, NS.office, 'automatic-styles');
    for (const style of automatic ? childElements(automatic) : []) {
      const name = attributeOf(style, NS.style, 'name') ?? '';
      const xml = keptXmlOf(parsed, style);
      into.push({ name, xml });
      if (is(style, NS.style, 'page-layout'))
        this.pageLayouts.set(name, { element: style, parsed });
      if (is(style, NS.text, 'list-style'))
        this.autoLists.set(name, Object.assign(style, { parsed }));
      if (is(style, NS.style, 'style')) {
        const master = attributeOf(style, NS.style, 'master-page-name');
        (forBody ? this.auto : this.stylesAuto).set(name, {
          family: attributeOf(style, NS.style, 'family') ?? '',
          ...compact({
            parent: attributeOf(style, NS.style, 'parent-style-name'),
            master: master || undefined,
            pageNumber: pageNumberOf(style),
            lines: paragraphLinesOf(style),
          }),
          paragraph: readParagraphProps(style, this.dropTabs),
          text: readTextProps(style, this.faces),
          kept: xml,
          element: style,
        });
      }
    }
  }

  styleOf(parsed: XmlParsed, e: XmlElement): Style {
    const id = attributeOf(e, NS.style, 'name') ?? '';
    const name = attributeOf(e, NS.style, 'display-name') ?? id;
    const outline = Number(attributeOf(e, NS.style, 'default-outline-level'));
    const paragraph = readParagraphProps(e, this.dropTabs);
    const values = compact({
      id,
      name,
      family:
        attributeOf(e, NS.style, 'family') === 'text' ? ('text' as const) : ('paragraph' as const),
      parent: attributeOf(e, NS.style, 'parent-style-name'),
      next: attributeOf(e, NS.style, 'next-style-name'),
      role: roleOfStyleName(name) ?? roleOfStyleName(id),
      paragraph: outline >= 1 ? { ...paragraph, outlineLevel: outline } : paragraph,
      text: readTextProps(e, this.faces),
    });
    return { ...values, kept: this.keptProps(parsed, e, values) };
  }

  keptProps(
    parsed: XmlParsed,
    e: XmlElement,
    values: unknown,
    extra: Partial<KeptProperties> = {},
  ): KeptProperties {
    const residue = childElements(e)
      .filter(
        (c) =>
          !(
            c.uri === NS.style &&
            (c.local === 'paragraph-properties' || c.local === 'text-properties')
          ),
      )
      .map((c) => keptXmlOf(parsed, c));
    return { xml: keptXmlOf(parsed, e), read: canonical(values), residue, ...extra };
  }

  readStyles(
    styles: XmlParsed | undefined,
    kept: KeptXml[],
  ): { styles: Style[]; defaults: StyleDefaults } {
    const out: Style[] = [];
    let defaults: StyleDefaults = { paragraph: {}, text: {} };
    const office = styles && childElement(styles.root, NS.office, 'styles');
    for (const e of office ? childElements(office) : []) {
      const family = attributeOf(e, NS.style, 'family');
      if (is(e, NS.style, 'default-style') && family === 'paragraph') {
        const values = {
          paragraph: readParagraphProps(e, this.dropTabs),
          text: readTextProps(e, this.faces),
        };
        defaults = { ...values, kept: this.keptProps(styles!, e, values) };
      } else if (is(e, NS.style, 'style') && (family === 'paragraph' || family === 'text')) {
        out.push(this.styleOf(styles!, e));
      } else {
        if (is(e, NS.text, 'list-style'))
          this.namedLists.set(
            attributeOf(e, NS.style, 'name') ?? '',
            Object.assign(e, { parsed: styles! }),
          );
        if (isLineNumbering(e)) this.lineNumbering = readLineNumbering(e);
        kept.push(this.kept(styles!, e));
      }
    }
    return stylesStopsRead(out, defaults, this.tabsFromIndent);
  }

  readMasters(styles: XmlParsed | undefined, kept: KeptXml[]): void {
    const master = styles && childElement(styles.root, NS.office, 'master-styles');
    for (const page of master ? childElements(master) : []) {
      const xml = keptXmlOf(styles!, page);
      // A master page's headers and footers are the model's: what is kept is the rest of it.
      kept.push(is(page, NS.style, 'master-page') ? { ...xml, xml: withoutStories(xml.xml) } : xml);
      if (is(page, NS.style, 'master-page')) {
        const name = attributeOf(page, NS.style, 'name') ?? '';
        this.masters.set(name, attributeOf(page, NS.style, 'page-layout-name') ?? '');
        this.masterElements.set(name, { element: page, parsed: styles! });
      }
    }
  }

  /** The section a master page gives, its layout kept. */
  sectionOf(master: string | undefined, start: Section['start']): Section | undefined {
    const layoutName = master === undefined ? undefined : this.masters.get(master);
    const layout = layoutName === undefined ? undefined : this.pageLayouts.get(layoutName);
    const read = layout && readPageSetup(layout.element, this.unequalColumns);
    if (!layout || !read) return undefined;
    const headers = master === undefined ? undefined : this.headersOfMaster(master);
    const setup = withHeaderMargins(read, layout.element, {
      header: !!headers?.header,
      footer: !!headers?.footer,
    });
    const props = childElement(layout.element, NS.style, 'page-layout-properties');
    const residue = [
      ...(props ? childElements(props).filter((c) => !is(c, NS.style, 'columns')) : []),
      ...childElements(layout.element).filter((c) => c !== props),
    ].map((c) => keptXmlOf(layout.parsed, c));
    return {
      start,
      setup,
      ...compact({ headers }),
      kept: {
        xml: keptXmlOf(layout.parsed, layout.element),
        // What its layout was read with: the setup, and whether its master page shows a header and a footer.
        read: canonical({ setup, shown: { header: !!headers?.header, footer: !!headers?.footer } }),
        residue,
        name: master,
        layout: layoutName,
      },
    };
  }

  /** A master page's headers and footers as it holds them, each read once. */
  headersOfMaster(master: string): SectionHeaders | undefined {
    if (this.#masterHeaders.has(master)) return this.#masterHeaders.get(master);
    const page = this.masterElements.get(master);
    let headers: SectionHeaders | undefined;
    if (page) {
      const elements = masterStoryElements(page.element);
      const outer = this.part;
      // A flat file's automatic styles are one set, read as the body's.
      const auto = this.parts.styles === this.parts.content ? this.auto : this.stylesAuto;
      this.part = { parsed: page.parsed, auto };
      const kind = (k: HeaderFooterKind) => {
        const found = elements[k];
        if (!found) return undefined;
        const set: Partial<Record<HeaderFooterSlot, HeaderFooter>> = {};
        for (const [slot, e] of Object.entries(found) as [HeaderFooterSlot, XmlElement][]) {
          const blocks = this.readStory(e);
          // Nothing but an empty paragraph is an empty one, as an empty slot is written.
          const story: HeaderFooter = {
            blocks: HeadersAndFooters.isEmpty({ blocks }) ? [] : blocks,
          };
          this.storyXml.set(story, keptXmlOf(page.parsed, e).xml);
          set[slot] = story;
        }
        return set;
      };
      const read = { header: kind('header'), footer: kind('footer') };
      this.part = outer;
      const differentFirst = !!(elements.header?.first ?? elements.footer?.first);
      const differentOddEven = !!(elements.header?.even ?? elements.footer?.even);
      // A page with no first or even element of a kind shows that kind's default (ODF).
      const filled = (set: Partial<Record<HeaderFooterSlot, HeaderFooter>> | undefined) =>
        set && {
          ...set,
          ...(differentFirst && !set.first && set.default ? { first: set.default } : {}),
          ...(differentOddEven && !set.even && set.default ? { even: set.default } : {}),
        };
      const header = filled(read.header);
      const footer = filled(read.footer);
      const own: SectionHeaders = {
        ...(header ? { header } : {}),
        ...(footer ? { footer } : {}),
        ...(differentFirst ? { differentFirst: true as const } : {}),
        ...(differentOddEven ? { differentOddEven: true as const } : {}),
      };
      headers = Object.keys(own).length > 0 ? own : undefined;
    }
    this.#masterHeaders.set(master, headers);
    return headers;
  }

  listDefinition(styleName: string | undefined): ListDefinition {
    const style =
      styleName === undefined
        ? undefined
        : (this.autoLists.get(styleName) ?? this.namedLists.get(styleName));
    if (!style) return ListDefinition.of('bullet');
    const levels = readListLevels(style);
    return {
      levels,
      kept: {
        xml: keptXmlOf(style.parsed, style),
        read: canonical(levels),
        residue: [],
        name: styleName,
      },
    };
  }

  newListId(xmlId: string | undefined): string {
    this.#listCount += 1;
    const id = xmlId && !(xmlId in this.lists) ? xmlId : `list${this.#listCount}`;
    if (xmlId) this.listIds.set(xmlId, id);
    return id;
  }
}

/** Reads a text document's parts (package or flat file) into the model. */
/**
 * The entries still kept: those pictures now hold leave, unless kept content still names them (objects.md "In the
 * formats", read).
 */
function keptEntries(
  entries: readonly KeptEntry[],
  taken: MediaTaken,
  kept: unknown,
): readonly KeptEntry[] {
  if (taken.parts.size === 0) return entries;
  const named = keptXmlTexts(kept);
  return entries.filter(
    (e) => !taken.parts.has(e.name) || named.some((xml) => xml.includes(e.name)),
  );
}

export function readOdfParts(parts: OdfParts, report: ReportBuilder): TextDocument {
  const reader = new OdfReader(parts, report);
  const fontFaces: KeptXml[] = [];
  reader.readFaces(parts.styles, fontFaces);
  reader.readFaces(parts.content === parts.styles ? undefined : parts.content, fontFaces);
  const keptStyles: KeptXml[] = [];
  const { styles, defaults } = reader.readStyles(parts.styles, keptStyles);
  const automaticStyles: { name: string; xml: KeptXml }[] = [];
  const pageStyles: { name: string; xml: KeptXml }[] = [];
  if (parts.styles && parts.styles !== parts.content)
    reader.readAutomatic(parts.styles, pageStyles, false);
  reader.readAutomatic(parts.content, automaticStyles, true);
  const masterStyles: KeptXml[] = [];
  reader.readMasters(parts.styles, masterStyles);
  reader.readStory = (element) => {
    const story = new BodyReader(reader, styles, defaults, true);
    story.container(element);
    return story.blocks;
  };
  const body = new BodyReader(reader, styles, defaults).read();
  const settingsRoot = parts.settings && childElement(parts.settings.root, NS.office, 'settings');
  const source: OdfSource = {
    format: 'odf',
    namespaces: sortedBindings({
      ...parts.settings?.root.scope,
      ...parts.meta?.root.scope,
      ...parts.styles?.root.scope,
      ...parts.content.root.scope,
    }),
    fontFaces,
    styles: keptStyles,
    automaticStyles,
    pageStyles,
    masterStyles,
    ...(settingsRoot ? { settings: keptSettings(parts.settings!, settingsRoot) } : {}),
    tabsFromIndent: reader.tabsFromIndent,
    entries: keptEntries(parts.entries, reader.taken, [
      body.blocks,
      body.section,
      keptStyles,
      automaticStyles,
      pageStyles,
      masterStyles,
    ]),
  };
  return {
    format: 'odf',
    metadata: parts.meta ? readOdfMeta(parts.meta) : {},
    defaults,
    styles,
    lists: reader.lists,
    section: body.section,
    ...(pagelessIn(settingsRoot) ? { pageless: true as const } : {}),
    body: body.blocks,
    ...compact({ media: reader.taken.held() }),
    source,
  };
}

/** Bindings sorted by prefix, without `xml` and those every written part declares anyway, so the same declarations read as the same value. */
export const sortedBindings = (ns: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(ns)
      .filter(([p, uri]) => p !== 'xml' && !Object.values(WRITTEN_NS).includes(uri))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );

type Context = { props: TextProps; style?: string; link?: string; kept?: KeptProperties };

const KEPT_INLINE_SKIP = new Set(['soft-page-break']);

class BodyReader {
  readonly blocks: Block[] = [];
  section: Section | undefined;
  /** The first section's start at (page-layout.md "Page numbers"), from the body's first paragraph. */
  firstStart: number | undefined;
  /** What each paragraph said of its line, the document's numbering on (page-layout.md "Line numbers"). */
  readonly linesOf = new WeakMap<Paragraph, ParagraphLines>();
  #setup = PageSetup.of('letter');

  readonly r: OdfReader;
  readonly styles: readonly Style[];
  readonly defaults: StyleDefaults;

  /** A header's, footer's, note's or cell's writing: its paragraphs start no page and are not numbered. */
  readonly story: boolean;
  /** Whether a footnote is read as the model's: in the body and its tables, never in a header, footer or note. */
  readonly notes: boolean;
  /** A table cell's writing: a region in it is kept as it is. */
  readonly cell: boolean;

  constructor(
    r: OdfReader,
    styles: readonly Style[],
    defaults: StyleDefaults,
    story = false,
    { notes = !story, cell = false }: { notes?: boolean; cell?: boolean } = {},
  ) {
    this.r = r;
    this.story = story;
    this.notes = notes;
    this.cell = cell;
    this.styles = styles;
    this.defaults = defaults;
  }

  read(): { blocks: Block[]; section: Section } {
    const body = childElement(this.r.parts.content.root, NS.office, 'body');
    const text = body && childElement(body, NS.office, 'text');
    if (text) this.container(text);
    // A region's end that nothing follows ends no section (page-layout.md "Breaks").
    while (isRegionEnd(this.blocks[this.blocks.length - 1])) this.blocks.pop();
    const normal = Styles.idOfRole(this.styles, 'normal') ?? 'Standard';
    if (!this.blocks.some((b) => b.type === 'paragraph'))
      this.blocks.push({ type: 'paragraph', style: normal, props: {}, inlines: [] });
    const first = this.section ??
      this.r.sectionOf('Standard', 'next-page') ??
      this.r.sectionOf([...this.r.masters.keys()][0], 'next-page') ?? {
        start: 'next-page',
        setup: this.#setup,
      };
    return this.linked(this.numbered({ ...first, ...compact({ numberStart: this.firstStart }) }));
  }

  /** Each section's line numbers, from what its first paragraph says (page-layout.md "Line numbers"). */
  numbered(first: Section): Section {
    const numbering = this.r.lineNumbering;
    if (!numbering.on) return first;
    const withLines = <T extends Section>(section: T, said: ParagraphLines | undefined): T => {
      const lineNumbers = sectionLines(numbering, said);
      return lineNumbers ? { ...section, lineNumbers } : section;
    };
    let owner: number | 'first' | null = 'first';
    let section = first;
    const close = (said: ParagraphLines | undefined) => {
      if (owner === 'first') section = withLines(section, said);
      else if (owner !== null)
        this.blocks[owner] = withLines(this.blocks[owner] as SectionBreak, said);
      owner = null;
    };
    this.blocks.forEach((block, at) => {
      if (block.type === 'section') {
        close(undefined);
        owner = at;
      } else if (block.type === 'paragraph' && owner !== null) close(this.linesOf.get(block));
    });
    close(undefined);
    return section;
  }

  /** The sections' headers as their own, those the previous section has the same of linked (page-layout.md). */
  linked(first: Section): { blocks: Block[]; section: Section } {
    const breaks = this.blocks.flatMap((b, i) =>
      b.type === 'section' && b.start !== 'continuous' ? [i] : [],
    );
    const own = unlinked(
      [first.headers, ...breaks.map((i) => (this.blocks[i] as SectionBreak).headers)],
      (story) => this.r.storyXml.get(story) ?? '',
    );
    const withHeaders = <T extends Section>(section: T, headers: SectionHeaders | undefined): T => {
      const { headers: _, ...rest } = section;
      return (headers ? { ...rest, headers } : rest) as T;
    };
    breaks.forEach((at, n) => {
      this.blocks[at] = withHeaders(this.blocks[at] as SectionBreak, own[n + 1]);
    });
    return { blocks: this.blocks, section: withHeaders(first, own[0]) };
  }

  container(parent: XmlElement): void {
    for (const e of childElements(parent)) {
      if (is(e, NS.text, 'p') || is(e, NS.text, 'h')) this.paragraph(e, undefined);
      else if (is(e, NS.text, 'list')) this.list(e, 0, undefined);
      else if (is(e, NS.text, 'section') && !this.cell) this.region(e);
      else if (is(e, NS.table, 'table')) this.table(e);
      else if (is(e, NS.text, 'soft-page-break')) this.r.report.drop('layout-hint', e.local);
      else if (isDde(e)) this.r.report.drop('field', e.local);
      else {
        this.blocks.push({
          type: 'kept',
          name: e.local,
          xml: this.r.kept(this.r.part.parsed, e),
        });
        this.r.report.keep(e.local);
      }
    }
  }

  table(e: XmlElement): void {
    const auto = this.r.part.auto;
    const block = readOdfTable(e, {
      parsed: this.r.part.parsed,
      style: (name) => {
        const style = name === undefined ? undefined : auto.get(name);
        return style && { element: style.element, kept: style.kept };
      },
      cellBlocks: (cell) => {
        const reader = new BodyReader(this.r, this.styles, this.defaults, true, {
          notes: this.notes,
          cell: true,
        });
        reader.container(cell);
        return reader.blocks;
      },
      kept: (x) => this.r.kept(this.r.part.parsed, x),
      report: this.r.report,
      normal: Styles.idOfRole(this.styles, 'normal') ?? 'Standard',
    });
    if (block) this.blocks.push(block);
  }

  region(e: XmlElement): void {
    const parsed = this.r.part.parsed;
    const open = parsed.source
      .slice(e.start, parsed.source.indexOf('>', e.start) + 1)
      .replace(/\/>$/, '>');
    const columnsStyle = this.r.part.auto.get(attributeOf(e, NS.text, 'style-name') ?? '');
    const columns =
      columnsStyle &&
      readColumns(
        childElement(columnsStyle.element, NS.style, 'section-properties'),
        this.r.unequalColumns,
      );
    const setup = this.currentSetup();
    this.blocks.push({
      type: 'section',
      start: 'continuous',
      setup: compact({ ...setup, columns }),
      region: { xml: open, ns: startTagBindings(e) },
    });
    this.container(e);
    this.blocks.push({ type: 'section', start: 'continuous', setup });
  }

  currentSetup() {
    for (let i = this.blocks.length - 1; i >= 0; i -= 1) {
      const b = this.blocks[i]!;
      if (b.type === 'section' && !b.region) return b.setup;
    }
    return (this.section ?? { setup: this.#setup }).setup;
  }

  list(e: XmlElement, level: number, inherited: { id: string } | undefined): void {
    let id = inherited?.id;
    if (!id) {
      const styleName = attributeOf(e, NS.text, 'style-name');
      const continues = attributeOf(e, NS.text, 'continue-list');
      const continueNumbering = attributeOf(e, NS.text, 'continue-numbering') === 'true';
      id =
        (continues && this.r.listIds.get(continues)) ||
        (continueNumbering && styleName ? this.r.lastListOfStyle.get(styleName) : undefined) ||
        this.r.newListId(attributeOf(e, NS.xml, 'id'));
      if (!(id in this.r.lists)) this.r.lists[id] = this.r.listDefinition(styleName);
      if (styleName) this.r.lastListOfStyle.set(styleName, id);
    }
    for (const item of childElements(e)) {
      const header = is(item, NS.text, 'list-header');
      if (!header && !is(item, NS.text, 'list-item')) continue;
      const restartAt = Number(attributeOf(item, NS.text, 'start-value'));
      const checked = attributeOf(item, LIVEDOC_NS, 'checked') === 'true';
      let first = !header;
      for (const child of childElements(item)) {
        if (is(child, NS.text, 'list')) {
          this.list(child, level + 1, { id });
          first = false;
          continue;
        }
        if (!is(child, NS.text, 'p') && !is(child, NS.text, 'h')) continue;
        const place: ListPlace = compact({
          id,
          level,
          checked: first && checked ? true : undefined,
          restart: first && Number.isInteger(restartAt) && restartAt >= 0 ? restartAt : undefined,
          unnumbered: first ? undefined : true,
        });
        this.paragraph(child, place);
        first = false;
      }
    }
  }

  paragraph(e: XmlElement, list: ListPlace | undefined): void {
    const styleName = attributeOf(e, NS.text, 'style-name') ?? 'Standard';
    const auto = this.r.part.auto.get(styleName);
    const style = auto ? (auto.parent ?? 'Standard') : styleName;
    const heading = is(e, NS.text, 'h')
      ? Number(attributeOf(e, NS.text, 'outline-level') ?? '1') || 1
      : undefined;
    let props: ParagraphProps = auto ? auto.paragraph : {};
    const styleLevel = Styles.outlineLevel(this.styles, style);
    if (heading !== undefined && heading !== styleLevel)
      props = { ...props, outlineLevel: heading };
    if (heading === undefined && styleLevel !== undefined) props = { ...props, outlineLevel: 0 };
    props = stopsRead(
      { styles: this.styles, defaults: this.defaults, lists: this.r.lists },
      { style, props, list },
      this.r.tabsFromIndent,
    );
    const text = auto && Object.keys(auto.text).length > 0 ? auto.text : undefined;
    const master = auto?.master;
    const isFirst = !this.blocks.some((b) => b.type === 'paragraph');
    // A page's first paragraph names the number its page starts at: the body's first, or a section's.
    const startsPage = !this.story && (isFirst || master !== undefined);
    const start = startsPage ? auto?.pageNumber : undefined;
    if (isFirst && !this.story) this.firstStart = start;
    if (master !== undefined && !this.story) {
      const section = this.r.sectionOf(master, 'next-page');
      if (isFirst && !this.section && section) this.section = section;
      else if (section) {
        // A region's end straight before a new section is that section's start.
        if (isRegionEnd(this.blocks[this.blocks.length - 1])) this.blocks.pop();
        this.blocks.push({
          type: 'section',
          ...section,
          ...compact({ numberStart: start }),
        } satisfies SectionBreak);
      }
    }
    // What it says of its line, the document's numbering on (page-layout.md "Line numbers").
    const lines = !this.story && this.r.lineNumbering.on ? auto?.lines : undefined;
    const values = { style, props, text, master: isFirst ? undefined : master, start, lines };
    const kept: KeptProperties | undefined = auto
      ? { xml: auto.kept, read: canonical(values), residue: [], name: styleName }
      : undefined;
    // A header's, a footer's or a note's notes stay kept content (page-layout.md "Footnotes").
    const inlines = new InlineReader(this.r, this.notes).read(e);
    const paragraph: Paragraph = {
      type: 'paragraph',
      style,
      props,
      ...compact({ list, text, kept }),
      inlines,
    };
    this.blocks.push(paragraph);
    if (lines) this.linesOf.set(paragraph, lines);
  }
}

class InlineReader {
  readonly out: Inline[] = [];
  #afterSpace = true;

  readonly r: OdfReader;
  /** Whether a footnote is read as the model's: in the body, never in a header, footer or note. */
  readonly notes: boolean;

  constructor(r: OdfReader, notes: boolean) {
    this.r = r;
    this.notes = notes;
  }

  read(paragraph: XmlElement): Inline[] {
    for (const node of paragraph.children) this.node(node, { props: {} });
    return this.out;
  }

  text(chars: string, ctx: Context): void {
    if (!chars) return;
    const last = this.out.at(-1);
    if (
      last?.type === 'run' &&
      last.style === ctx.style &&
      last.link === ctx.link &&
      last.kept === ctx.kept &&
      canonical(last.props) === canonical(ctx.props)
    ) {
      this.out[this.out.length - 1] = { ...last, text: last.text + chars };
      return;
    }
    const run: Run = {
      type: 'run',
      text: chars,
      props: ctx.props,
      ...compact({ style: ctx.style, link: ctx.link, kept: ctx.kept }),
    };
    this.out.push(run);
  }

  node(node: XmlNode, ctx: Context): void {
    if (typeof node === 'string') {
      let chars = '';
      for (const char of node) {
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
          if (!this.#afterSpace) chars += ' ';
          this.#afterSpace = true;
        } else {
          chars += char;
          this.#afterSpace = false;
        }
      }
      this.text(chars, ctx);
      return;
    }
    if (node.uri === NS.text) {
      if (node.local === 's') {
        const count = Number(attributeOf(node, NS.text, 'c') ?? '1');
        this.text(' '.repeat(Number.isInteger(count) && count > 0 ? count : 1), ctx);
        this.#afterSpace = false;
        return;
      }
      if (node.local === 'tab' || node.local === 'line-break') {
        this.text(node.local === 'tab' ? '\t' : '\n', ctx);
        this.#afterSpace = false;
        return;
      }
      if (node.local === 'span') return this.span(node, ctx);
      if (node.local === 'a') {
        const href = attributeOf(node, NS.xlink, 'href') ?? '';
        const safe = isSafeLink(href);
        if (!safe) this.r.report.drop('link', 'link');
        const inner = { ...ctx, ...(safe ? { link: href } : {}) };
        for (const child of node.children) this.node(child, inner);
        return;
      }
      if (KEPT_INLINE_SKIP.has(node.local)) {
        this.r.report.drop('layout-hint', node.local);
        return;
      }
    }
    if (isDde(node)) {
      this.r.report.drop('field', node.local);
      for (const child of node.children) this.node(child, ctx);
      return;
    }
    const noteBody = this.notes ? odfFootnoteBody(node) : undefined;
    if (noteBody) {
      this.out.push({
        type: 'note',
        blocks: this.r.readStory(noteBody),
        props: ctx.props,
        ...compact({ style: ctx.style, link: ctx.link, kept: ctx.kept }),
      } satisfies Note);
      this.#afterSpace = false;
      return;
    }
    const field = odfFieldKind(node);
    if (field) {
      this.out.push({
        type: 'field',
        field,
        text: odfFieldText(node),
        props: ctx.props,
        ...compact({ style: ctx.style, link: ctx.link, kept: ctx.kept }),
      } satisfies Field);
      this.#afterSpace = false;
      return;
    }
    const picture = this.picture(node);
    if (picture) {
      this.out.push({
        type: 'picture',
        ...picture,
        props: ctx.props,
        ...compact({ style: ctx.style, link: ctx.link, kept: ctx.kept }),
      } satisfies Picture);
      this.#afterSpace = false;
      return;
    }
    const kept: KeptInline = {
      type: 'kept',
      name: node.local,
      xml: this.r.kept(this.r.part.parsed, node),
      props: ctx.props,
      ...compact({ style: ctx.style, link: ctx.link, kept: ctx.kept }),
    };
    this.r.report.keep(node.local);
    this.out.push(kept);
  }

  /** A frame read as a picture, in line or placed, when it holds only what the model maps (objects.md "In the formats"). */
  picture(node: XmlElement) {
    const auto = this.r.part.auto;
    return readOdfPicture(
      node,
      (name) => {
        const style = auto.get(name);
        return style?.family === 'graphic' ? style.element : undefined;
      },
      this.r.parts.pictures ?? new Map(),
      this.r.taken,
      // A picture is placed only in the body (objects.md "Placement read"): never in a note, header or footer.
      this.notes && this.r.part.parsed === this.r.parts.content,
    );
  }

  span(node: XmlElement, ctx: Context): void {
    const name = attributeOf(node, NS.text, 'style-name');
    const auto = name === undefined ? undefined : this.r.part.auto.get(name);
    let inner: Context;
    if (auto) {
      const props = { ...ctx.props, ...auto.text };
      const style = auto.parent ?? ctx.style;
      const values = { style, props };
      inner = {
        ...ctx,
        props,
        ...compact({ style }),
        kept: { xml: auto.kept, read: canonical(values), residue: [], name },
      };
    } else inner = { ...ctx, ...(name ? { style: name } : {}), kept: undefined };
    for (const child of node.children) this.node(child, inner);
  }
}

/** A paragraph style's `style:page-number`: an integer from 0, else none (`auto` continues). */
function pageNumberOf(style: XmlElement): number | undefined {
  const raw = attributeOf(
    childElement(style, NS.style, 'paragraph-properties') ?? style,
    NS.style,
    'page-number',
  );
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** The continuous section a `text:section`'s end leaves behind: back to the setup before it. */
function isRegionEnd(block: Block | undefined): boolean {
  return block?.type === 'section' && block.start === 'continuous' && !block.region;
}
